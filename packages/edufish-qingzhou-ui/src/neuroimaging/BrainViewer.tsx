import type { Niivue } from '@niivue/niivue';
import { Alert, Button, Segmented, Slider, Spin, Tag, theme } from 'antd';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  DEFAULT_BRAIN_SURFACE_OPACITY,
  brainAssetSignature,
  clampOpacity,
  describeError,
  nextZoom,
  normalizeBrainAssets,
  normalizeVolume,
  resolveBrainTheme,
  supportsWebGL2,
  toMeshRgba255,
} from './helpers.js';
import { styles } from './styles.js';
import { useBrainTranslation } from './strings.js';
import type {
  BrainAsset,
  BrainFailure,
  BrainStatus,
  BrainThemeColors,
  BrainView,
  BrainVolumeStatus,
  BrainViewerProps,
} from './types.js';

type NiivueModule = typeof import('@niivue/niivue');

const SURFACE: BrainView = 'surface';
const VOLUME: BrainView = 'volume';

function mergeClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/** Apply host-token colors without introducing a local palette. */
function applyBrainTheme(nv: Niivue, colors: BrainThemeColors): void {
  nv.opts.backColor = [...colors.background];
  nv.opts.crosshairColor = [...colors.crosshair];
  nv.opts.fontColor = [...colors.font];
  nv.meshes.forEach((mesh, index) => {
    const color = colors.meshes[index % colors.meshes.length];
    if (!color) return;
    mesh.setProperty('rgba255', toMeshRgba255(color), nv.gl);
  });
  nv.drawScene();
}

function applySurfaceView(nv: Niivue, opacity: number): void {
  for (const mesh of nv.meshes) {
    mesh.visible = true;
    mesh.opacity = opacity;
  }
  if (nv.volumes.length > 0) nv.setOpacity(0, 0);
  nv.setSliceType(nv.sliceTypeRender);
  nv.drawScene();
}

function applyVolumeView(nv: Niivue): void {
  for (const mesh of nv.meshes) {
    mesh.visible = false;
    mesh.opacity = 0;
  }
  if (nv.volumes.length > 0) nv.setOpacity(0, 1);
  nv.setSliceType(nv.sliceTypeMultiplanar);
  nv.drawScene();
}

function resetCamera(nv: Niivue): void {
  nv.scene.renderAzimuth = 0;
  nv.scene.renderElevation = 0;
  nv.scene.volScaleMultiplier = 1;
  nv.scene.pan2Dxyzmm = [0, 0, 0, 1];
  nv.scene.crosshairPos = [0.5, 0.5, 0.5];
  nv.drawScene();
}

function applyZoom(nv: Niivue, view: BrainView, zoom: number): void {
  nv.scene.volScaleMultiplier = zoom;
  if (view === VOLUME) {
    const pan = nv.scene.pan2Dxyzmm;
    nv.setPan2Dxyzmm([pan[0], pan[1], pan[2], zoom]);
  } else {
    nv.drawScene();
  }
}

function assetSummaryLabel(
  assets: readonly BrainAsset[],
  emptyLabel: string,
): string {
  if (assets.length === 0) return emptyLabel;
  return assets.map((asset) => asset.name).join(', ');
}

/**
 * Independent anatomical reference viewer.
 *
 * Surface meshes and the MRI volume come from host-owned local URLs. Nothing
 * is fetched at import time, and the MRI volume is fetched only after the user
 * explicitly chooses the MRI view. The viewer renders no activation overlays:
 * single-cell simulations are not mapped onto this anatomy.
 */
export function BrainViewer({
  meshes: meshProps,
  volume: volumeProp,
  className,
}: BrainViewerProps) {
  const t = useBrainTranslation();
  const translateRef = useRef(t);
  translateRef.current = t;

  const titleId = useId();
  const summaryId = useId();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const instanceRef = useRef<Niivue | null>(null);
  const epochRef = useRef(0);
  const viewRef = useRef<BrainView>(SURFACE);
  const opacityRef = useRef(DEFAULT_BRAIN_SURFACE_OPACITY);
  const volumeLoadedRef = useRef(false);
  const volumeLoadingRef = useRef(false);

  const meshes = normalizeBrainAssets(meshProps);
  const volume = normalizeVolume(volumeProp);
  const meshSignature = brainAssetSignature(meshes);
  const volumeSignature = volume
    ? `${volume.url}\u0000${volume.name}`
    : '';
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const { token } = theme.useToken();
  const themeColors = useMemo(
    () =>
      resolveBrainTheme({
        background: token.colorBgContainer,
        text: token.colorText,
        primary: token.colorPrimary,
        meshPrimary: token.colorTextSecondary,
        meshSecondary: token.colorTextTertiary ?? token.colorTextSecondary,
      }),
    [
      token.colorBgContainer,
      token.colorPrimary,
      token.colorText,
      token.colorTextSecondary,
      token.colorTextTertiary,
    ],
  );
  const themeColorsRef = useRef(themeColors);
  themeColorsRef.current = themeColors;
  const backgroundCssRef = useRef(token.colorBgContainer);
  backgroundCssRef.current = token.colorBgContainer;

  const [status, setStatus] = useState<BrainStatus>('initializing');
  const [failure, setFailure] = useState<BrainFailure | null>(null);
  const [view, setView] = useState<BrainView>(SURFACE);
  const [opacity, setOpacityState] = useState(
    DEFAULT_BRAIN_SURFACE_OPACITY,
  );
  const [volumeStatus, setVolumeStatus] =
    useState<BrainVolumeStatus>('idle');
  const [volumeFailure, setVolumeFailure] = useState<BrainFailure | null>(
    null,
  );
  const [volumeLoaded, setVolumeLoaded] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let disposed = false;
    let nv: Niivue | null = null;
    const epoch = epochRef.current + 1;
    epochRef.current = epoch;

    viewRef.current = SURFACE;
    opacityRef.current = DEFAULT_BRAIN_SURFACE_OPACITY;
    volumeLoadedRef.current = false;
    volumeLoadingRef.current = false;
    setView(SURFACE);
    setOpacityState(DEFAULT_BRAIN_SURFACE_OPACITY);
    setVolumeLoaded(false);
    setVolumeStatus('idle');
    setVolumeFailure(null);
    setFailure(null);
    setStatus('initializing');

    const onContextLost = (event: Event) => {
      event.preventDefault();
      if (disposed) return;
      setFailure({
        title: translateRef.current('brainWebglLost'),
      });
      setStatus('error');
    };
    const onContextRestored = () => {
      if (disposed) return;
      setFailure({
        title: translateRef.current('brainWebglLost'),
      });
      setStatus('error');
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const dispose = () => {
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener(
        'webglcontextrestored',
        onContextRestored,
      );
      const current = instanceRef.current;
      if (current) {
        instanceRef.current = null;
        try {
          current.cleanup();
        } catch {
          // The context may already be gone; nothing left to release.
        }
      }
      if (nv && nv !== current) {
        try {
          nv.cleanup();
        } catch {
          // Best effort during teardown or a failed initialization.
        }
      }
      nv = null;
      canvas.parentElement?.style.removeProperty('background-color');
    };

    void (async () => {
      if (!supportsWebGL2()) {
        if (disposed) return;
        setFailure({
          title: translateRef.current('brainWebglUnavailable'),
        });
        setStatus('error');
        return;
      }

      try {
        const module: NiivueModule = await import('@niivue/niivue');
        if (disposed) return;

        const colors = themeColorsRef.current;
        const instance = new module.Niivue({
          backColor: [...colors.background],
          crosshairColor: [...colors.crosshair],
          fontColor: [...colors.font],
          dragAndDropEnabled: false,
          isColorbar: false,
          isOrientCube: false,
          isRuler: false,
          show3Dcrosshair: false,
          loadingText: 'Loading…',
          sliceType: module.SLICE_TYPE.RENDER,
          logLevel: 'warn',
        });
        nv = instance;

        await instance.attachToCanvas(canvas);
        if (disposed) return;
        instanceRef.current = instance;
        canvas.parentElement?.style.setProperty(
          'background-color',
          backgroundCssRef.current,
        );

        if (meshes.length > 0) {
          const meshOptions = meshes.map((asset, index) => ({
            url: asset.url,
            name: asset.name,
            rgba255: toMeshRgba255(
              colors.meshes[index % colors.meshes.length] ??
                colors.meshes[0] ??
                [0.8, 0.8, 0.8, 1],
            ),
            opacity: DEFAULT_BRAIN_SURFACE_OPACITY,
            visible: true,
          }));
          // This is the only surface fetch; it is client-side and host-owned.
          await instance.loadMeshes(meshOptions);
          if (disposed || instanceRef.current !== instance) return;
          applyBrainTheme(instance, themeColorsRef.current);
        }

        if (disposed || instanceRef.current !== instance) return;
        applySurfaceView(instance, opacityRef.current);
        setStatus('ready');
      } catch (cause) {
        if (disposed) return;
        setFailure({
          title: translateRef.current('brainInitFailed'),
          detail: describeError(cause),
        });
        setStatus('error');
      }
    })();

    return () => {
      disposed = true;
      epochRef.current += 1;
      dispose();
    };
  }, [meshSignature, volumeSignature, retryToken]);

  // Recolor the canvas, meshes and crosshair when the host theme changes.
  useEffect(() => {
    const nv = instanceRef.current;
    if (!nv) return;
    const canvas = canvasRef.current;
    canvas?.parentElement?.style.setProperty(
      'background-color',
      token.colorBgContainer,
    );
    try {
      applyBrainTheme(nv, themeColors);
    } catch {
      // A lost context is reported by the canvas listener with a retry path.
    }
  }, [themeColors, token.colorBgContainer]);

  const loadVolume = useCallback(async () => {
    const nv = instanceRef.current;
    const asset = volumeRef.current;
    if (!nv || !asset || volumeLoadingRef.current) return;

    const epoch = epochRef.current;
    const instance = nv;
    volumeLoadingRef.current = true;
    setVolumeStatus('loading');
    setVolumeFailure(null);

    try {
      // Explicit, user-triggered fetch only. No volume request happens on mount.
      await instance.loadVolumes([
        {
          url: asset.url,
          name: asset.name,
          colormap: 'gray',
          opacity: 1,
        },
      ]);
      if (epoch !== epochRef.current || instanceRef.current !== instance) {
        return;
      }
      volumeLoadedRef.current = true;
      setVolumeLoaded(true);
      setVolumeStatus('ready');
      try {
        if (viewRef.current === VOLUME) {
          applyVolumeView(instance);
          resetCamera(instance);
        } else {
          applySurfaceView(instance, opacityRef.current);
        }
      } catch {
        // The error UI is driven by the context-loss listener.
      }
    } catch (cause) {
      if (epoch !== epochRef.current || instanceRef.current !== instance) {
        return;
      }
      setVolumeStatus('error');
      setVolumeFailure({
        title: translateRef.current('brainVolumeFailed'),
        detail: describeError(cause),
      });
      if (viewRef.current === VOLUME) {
        viewRef.current = SURFACE;
        setView(SURFACE);
      }
      try {
        applySurfaceView(instance, opacityRef.current);
      } catch {
        // Keep the visible failure state.
      }
    } finally {
      if (epoch === epochRef.current) volumeLoadingRef.current = false;
    }
  }, []);

  const handleViewChange = useCallback(
    (value: string | number) => {
      const next: BrainView = value === VOLUME ? VOLUME : SURFACE;
      viewRef.current = next;
      setView(next);
      const nv = instanceRef.current;
      if (!nv) return;

      try {
        if (next === SURFACE) {
          applySurfaceView(nv, opacityRef.current);
          return;
        }
        if (volumeLoadedRef.current) {
          applyVolumeView(nv);
          resetCamera(nv);
          return;
        }
        if (volumeRef.current) void loadVolume();
      } catch {
        // The error UI is driven by the context-loss listener.
      }
    },
    [loadVolume],
  );

  const handleRetryVolume = useCallback(() => {
    viewRef.current = VOLUME;
    setView(VOLUME);
    void loadVolume();
  }, [loadVolume]);

  const handleOpacityChange = useCallback((value: number) => {
    const next = clampOpacity(value);
    opacityRef.current = next;
    setOpacityState(next);
    const nv = instanceRef.current;
    if (!nv || viewRef.current !== SURFACE) return;
    try {
      for (const mesh of nv.meshes) mesh.opacity = next;
      nv.drawScene();
    } catch {
      // The error UI is driven by the context-loss listener.
    }
  }, []);

  const handleZoom = useCallback((direction: 'in' | 'out') => {
    const nv = instanceRef.current;
    if (!nv) return;
    try {
      const current =
        viewRef.current === VOLUME
          ? nv.scene.pan2Dxyzmm[3]
          : nv.scene.volScaleMultiplier;
      applyZoom(nv, viewRef.current, nextZoom(current, direction));
    } catch {
      // The error UI is driven by the context-loss listener.
    }
  }, []);

  const handleRotate = useCallback((deltaAzimuth: number) => {
    const nv = instanceRef.current;
    if (!nv) return;
    try {
      nv.setRenderAzimuthElevation(
        nv.scene.renderAzimuth + deltaAzimuth,
        nv.scene.renderElevation,
      );
    } catch {
      // The error UI is driven by the context-loss listener.
    }
  }, []);

  const handleReset = useCallback(() => {
    const nv = instanceRef.current;
    if (!nv) return;
    try {
      resetCamera(nv);
    } catch {
      // The error UI is driven by the context-loss listener.
    }
  }, []);

  const handleRetry = useCallback(() => {
    setRetryToken((value) => value + 1);
  }, []);

  const ready = status === 'ready';
  const volumeAvailable = Boolean(volume);
  const opacityDisabled =
    !ready || view === VOLUME || meshes.length === 0;

  let statusText = t('brainSurfaceReady');
  if (status === 'initializing') {
    statusText = t('brainInitializing');
  } else if (failure) {
    statusText = t('brainStatusError');
  } else if (view === VOLUME && volumeStatus === 'loading') {
    statusText = t('brainVolumeLoading');
  } else if (view === VOLUME) {
    statusText = t('brainVolumeReady');
  } else if (meshes.length === 0) {
    statusText = `${t('brainNoSurface')}${
      volume ? ` ${t('brainChooseMri')}` : ''
    }`;
  }

  const surfaceNames = assetSummaryLabel(
    meshes,
    t('brainNoSurfaceAssets'),
  );
  const volumeLabel = volume
    ? `${volume.name} (${volumeLoaded ? t('brainLoaded') : t('brainNotLoaded')})`
    : t('brainNoVolumeAsset');

  return (
    <section
      className={mergeClassNames(styles.root, className)}
      aria-labelledby={titleId}
    >
      <header className={styles.header}>
        <div>
          <h3 className={styles.title} id={titleId}>
            {t('brainTitle')}
          </h3>
          <p className={styles.muted}>{t('brainSubtitle')}</p>
        </div>
        <div className={styles.tagRow}>
          {failure ? null : <Tag>{t('brainTagWebgl')}</Tag>}
          <Tag>{t('brainTagTemplate')}</Tag>
        </div>
      </header>

      <div
        aria-label={t('brainToolbarLabel')}
        className={styles.toolbar}
        role="toolbar"
      >
        <Segmented
          aria-label={t('brainViewLabel')}
          disabled={!ready}
          onChange={handleViewChange}
          options={[
            {
              label: t('brainSurfaceView'),
              value: SURFACE,
            },
            {
              label: t('brainVolumeView'),
              value: VOLUME,
              disabled: !ready || !volumeAvailable,
            },
          ]}
          value={view}
        />

        <span className={styles.opacityGroup}>
          <span>{t('brainOpacity')}</span>
          <Slider
            aria-label={t('brainOpacity')}
            className={styles.opacitySlider}
            disabled={opacityDisabled}
            max={1}
            min={0}
            onChange={handleOpacityChange}
            step={0.05}
            tooltip={{
              formatter: (value) =>
                `${Math.round((value ?? 0) * 100)}%`,
            }}
            value={opacity}
          />
        </span>

        <Button
          aria-label={t('brainRotateLeft')}
          disabled={!ready || view === VOLUME || meshes.length === 0}
          onClick={() => handleRotate(-15)}
          size="small"
        >
          {t('brainRotateLeft')}
        </Button>
        <Button
          aria-label={t('brainRotateRight')}
          disabled={!ready || view === VOLUME || meshes.length === 0}
          onClick={() => handleRotate(15)}
          size="small"
        >
          {t('brainRotateRight')}
        </Button>
        <Button
          aria-label={t('brainZoomOut')}
          disabled={!ready}
          onClick={() => handleZoom('out')}
          size="small"
        >
          {t('brainZoomOut')}
        </Button>
        <Button
          aria-label={t('brainZoomIn')}
          disabled={!ready}
          onClick={() => handleZoom('in')}
          size="small"
        >
          {t('brainZoomIn')}
        </Button>
        <Button
          aria-label={t('brainResetView')}
          disabled={!ready}
          onClick={handleReset}
          size="small"
          type="primary"
        >
          {t('brainResetView')}
        </Button>
      </div>

      {volumeFailure ? (
        <Alert
          action={
            <Button
              disabled={!ready || !volumeAvailable}
              onClick={handleRetryVolume}
              size="small"
            >
              {t('brainRetryMri')}
            </Button>
          }
          description={volumeFailure.detail}
          showIcon
          title={volumeFailure.title}
          type="error"
        />
      ) : null}

      <div className={styles.viewport}>
        <canvas
          role="img"
          tabIndex={0}
          aria-describedby={summaryId}
          aria-label={t('brainCanvasLabel')}
          className={styles.canvas}
          key={retryToken}
          ref={canvasRef}
        >
          {t('brainCanvasFallback')}
        </canvas>

        {status === 'initializing' && !failure ? (
          <div className={styles.overlay}>
            <Spin size="small" />
            <span className={styles.overlayText}>
              {t('brainInitializing')}
            </span>
          </div>
        ) : null}

        {failure ? (
          <div className={styles.overlay}>
            <div className={styles.overlayPanel}>
              <Alert
                action={
                  <Button onClick={handleRetry} size="small">
                    {t('brainRetry')}
                  </Button>
                }
                description={failure.detail}
                showIcon
                title={failure.title}
                type="error"
              />
            </div>
          </div>
        ) : null}

        {ready &&
        view === SURFACE &&
        meshes.length === 0 &&
        !failure ? (
          <div className={styles.overlay}>
            <span className={styles.overlayText}>
              {t('brainNoSurface')}
              {volume ? ` ${t('brainChooseMri')}` : ''}
            </span>
          </div>
        ) : null}

        {ready && view === VOLUME && volumeStatus === 'loading' ? (
          <div className={styles.overlay}>
            <Spin size="small" />
            <span className={styles.overlayText}>
              {t('brainVolumeLoading')}
            </span>
          </div>
        ) : null}
      </div>

      <p aria-live="polite" className={styles.status} role="status">
        {statusText}
      </p>

      <div className={styles.summary} id={summaryId}>
        <p className={styles.summaryBody}>
          {t('brainTextSummary', {
            surfaces: surfaceNames,
            volume: volumeLabel,
          })}
        </p>
        <p className={styles.muted}>{t('brainDisclaimer')}</p>
      </div>
    </section>
  );
}
