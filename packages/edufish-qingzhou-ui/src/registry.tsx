import {
  OPERATION_OUTPUT_SCHEMAS,
  ErrorEnvelopeSchema,
  SuccessEnvelopeSchema,
  type EduFishOperationName,
} from '@edufish/plugin';
import { Flexbox } from '@lobehub/ui';
import { Alert, Empty, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import type { ComponentType } from 'react';

import {
  LabResult,
  CourseResult,
  GraphResult,
  MaterialSearchResult,
  ProgressResult,
  QuizResult,
  QuizSubmissionResult,
} from './components/index.js';
import { EDUFISH_UI_NAMESPACE } from './contracts.js';
import type {
  EduFishInspectorMap,
  EduFishRenderMap,
  EduFishShortOperation,
  EduFishStreamingMap,
  EduFishToolInspectorProps,
  EduFishToolRenderProps,
  EduFishToolStreamingProps,
  ResultProps,
} from './contracts.js';
import { useEduFishUIContext } from './provider.js';

const OPERATION_BY_SHORT: Readonly<
  Record<EduFishShortOperation, EduFishOperationName>
> = Object.freeze({
  'course.read': 'edufish.course.read',
  'material.search': 'edufish.material.search',
  'graph.neighborhood': 'edufish.graph.neighborhood',
  'quiz.read': 'edufish.quiz.read',
  'quiz.submit': 'edufish.quiz.submit',
  'progress.read': 'edufish.progress.read',
  'lab.start': 'edufish.lab.start',
  'lab.status': 'edufish.lab.status',
});

const SHORT_BY_OPERATION: Readonly<Record<string, EduFishShortOperation>> =
  Object.freeze(
    Object.fromEntries(
      Object.entries(OPERATION_BY_SHORT).map(
        ([short, full]) =>
          [full, short as EduFishShortOperation] as const,
      ),
    ),
  );

const OPERATION_LABEL_KEY: Readonly<Record<EduFishShortOperation, string>> =
  Object.freeze({
    'course.read': 'opCourseRead',
    'material.search': 'opMaterialSearch',
    'graph.neighborhood': 'opGraphNeighborhood',
    'quiz.read': 'opQuizRead',
    'quiz.submit': 'opQuizSubmit',
    'progress.read': 'opProgressRead',
    'lab.start': 'opLabStart',
    'lab.status': 'opLabStatus',
  });

export type EduFishSnapshot =
  | { readonly status: 'ready'; readonly data: unknown }
  | { readonly status: 'empty' | 'invalid' | 'error' };

/**
 * Map a host apiName/identifier to one of the eight stable short names.
 * Accepts both `edufish.course.read` and `course.read`.
 */
export function normalizeEduFishOperation(
  value: unknown,
): EduFishShortOperation | undefined {
  if (typeof value !== 'string') return undefined;

  let candidate = value.trim();
  if (candidate.length === 0) return undefined;
  if (candidate.startsWith('edufish.')) {
    candidate = candidate.slice('edufish.'.length);
  }

  return SHORT_BY_OPERATION[`edufish.${candidate}`] ?? undefined;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

interface SnapshotSchema {
  safeParse(value: unknown):
    | { readonly success: true; readonly data: unknown }
    | { readonly success: false; readonly error: unknown };
}

/**
 * Decode and strictly validate a tool snapshot.
 *
 * Order: pluginState (when present) -> content JSON -> optional success/data
 * envelope -> the core operation output schema. No payload is ever returned
 * from an invalid or error snapshot.
 */
export function parseEduFishSnapshot(
  operation: unknown,
  pluginState: unknown,
  content: unknown,
): EduFishSnapshot {
  const short = normalizeEduFishOperation(operation);
  if (short === undefined) return { status: 'invalid' };

  let candidate: unknown =
    pluginState !== undefined && pluginState !== null
      ? pluginState
      : content;

  if (candidate === undefined || candidate === null) {
    return { status: 'empty' };
  }

  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (trimmed.length === 0) return { status: 'empty' };
    try {
      candidate = JSON.parse(trimmed) as unknown;
    } catch {
      return { status: 'invalid' };
    }
  }

  if (isPlainObject(candidate) && hasOwn(candidate, 'success')) {
    if (candidate.success === true) {
      const envelope = SuccessEnvelopeSchema.safeParse(candidate);
      if (!envelope.success) return { status: 'invalid' };
      candidate = envelope.data.data;
    } else {
      const envelope = ErrorEnvelopeSchema.safeParse(candidate);
      return envelope.success ? { status: 'error' } : { status: 'invalid' };
    }
  }

  const schema = OPERATION_OUTPUT_SCHEMAS[
    OPERATION_BY_SHORT[short]
  ] as unknown as SnapshotSchema;

  const parsed = schema.safeParse(candidate);
  if (!parsed.success) return { status: 'invalid' };

  return { status: 'ready', data: deepFreeze(parsed.data) };
}

type SnapshotComponent = ComponentType<ResultProps<unknown>>;

function snapshotComponent<D>(
  component: ComponentType<ResultProps<D>>,
): SnapshotComponent {
  return component as unknown as SnapshotComponent;
}

function SnapshotState({
  kind,
  message,
}: {
  readonly kind: 'loading' | 'empty' | 'invalid' | 'error';
  readonly message?: string;
}) {
  const { t } = useTranslation(EDUFISH_UI_NAMESPACE);

  if (kind === 'loading') {
    return (
      <Flexbox
        align="center"
        gap={8}
        padding={16}
        role="status"
        aria-live="polite"
        aria-label={t('a11yLoading')}
      >
        <Spin size="small" />
        <span>{message ?? t('loading')}</span>
      </Flexbox>
    );
  }

  if (kind === 'empty') {
    return (
      <Flexbox padding={16}>
        <Empty description={message ?? t('emptySnapshot')} />
      </Flexbox>
    );
  }

  return (
    <Flexbox padding={16}>
      <Alert
        type={kind === 'error' ? 'error' : 'warning'}
        showIcon
        title={
          message ?? t(kind === 'error' ? 'errorSnapshot' : 'invalidSnapshot')
        }
      />
    </Flexbox>
  );
}

function createSnapshotRenderer(
  short: EduFishShortOperation,
  Component: SnapshotComponent,
): ComponentType<EduFishToolRenderProps> {
  function EduFishSnapshotRenderer(props: EduFishToolRenderProps) {
    // Optional context access only; snapshot rendering never uses actions.
    const context = useEduFishUIContext();

    if (props.pluginError !== undefined && props.pluginError !== null) {
      return <SnapshotState kind="error" />;
    }

    const snapshot = parseEduFishSnapshot(
      short,
      props.pluginState,
      props.content,
    );

    if (snapshot.status !== 'ready') {
      return <SnapshotState kind={snapshot.status} />;
    }

    return (
      <Component
        data={snapshot.data}
        onOpenReference={context?.onOpenReference}
      />
    );
  }

  EduFishSnapshotRenderer.displayName = `EduFishSnapshot(${short})`;
  return EduFishSnapshotRenderer;
}

function createInspector(
  short: EduFishShortOperation,
): ComponentType<EduFishToolInspectorProps> {
  function EduFishInspector(props: EduFishToolInspectorProps) {
    const { t } = useTranslation(EDUFISH_UI_NAMESPACE);

    if (props.isLoading === true || props.isArgumentsStreaming === true) {
      return <SnapshotState kind="loading" message={t('inspectorLoading')} />;
    }

    if (props.result?.error !== undefined && props.result?.error !== null) {
      return <SnapshotState kind="error" message={t('inspectorError')} />;
    }

    const snapshot = parseEduFishSnapshot(
      short,
      props.pluginState,
      props.result?.content ?? null,
    );

    if (snapshot.status === 'ready') {
      return (
        <Flexbox align="center" gap={8} padding={12}>
          <span>{t(OPERATION_LABEL_KEY[short])}</span>
          <span aria-hidden="true">·</span>
          <span>{t('inspectorValid')}</span>
        </Flexbox>
      );
    }

    if (snapshot.status === 'empty') {
      return <SnapshotState kind="empty" message={t('inspectorEmpty')} />;
    }

    return <SnapshotState kind={snapshot.status} />;
  }

  EduFishInspector.displayName = `EduFishInspector(${short})`;
  return EduFishInspector;
}

function createStreaming(
  short: EduFishShortOperation,
): ComponentType<EduFishToolStreamingProps> {
  function EduFishStreaming(_props: EduFishToolStreamingProps) {
    const { t } = useTranslation(EDUFISH_UI_NAMESPACE);

    return (
      <Flexbox
        align="center"
        gap={8}
        padding={12}
        role="status"
        aria-live="polite"
        aria-label={t('a11yLoading')}
      >
        <Spin size="small" />
        <span>{t(OPERATION_LABEL_KEY[short])}</span>
        <span aria-hidden="true">·</span>
        <span>{t('streamingWaiting')}</span>
      </Flexbox>
    );
  }

  EduFishStreaming.displayName = `EduFishStreaming(${short})`;
  return EduFishStreaming;
}

/** Immutable host render map keyed by the eight stable short names. */
export const EduFishRenders: EduFishRenderMap = Object.freeze({
  'course.read': createSnapshotRenderer(
    'course.read',
    snapshotComponent(CourseResult),
  ),
  'material.search': createSnapshotRenderer(
    'material.search',
    snapshotComponent(MaterialSearchResult),
  ),
  'graph.neighborhood': createSnapshotRenderer(
    'graph.neighborhood',
    snapshotComponent(GraphResult),
  ),
  'quiz.read': createSnapshotRenderer(
    'quiz.read',
    snapshotComponent(QuizResult),
  ),
  'quiz.submit': createSnapshotRenderer(
    'quiz.submit',
    snapshotComponent(QuizSubmissionResult),
  ),
  'progress.read': createSnapshotRenderer(
    'progress.read',
    snapshotComponent(ProgressResult),
  ),
  'lab.start': createSnapshotRenderer(
    'lab.start',
    snapshotComponent(LabResult),
  ),
  'lab.status': createSnapshotRenderer(
    'lab.status',
    snapshotComponent(LabResult),
  ),
});

/** Immutable host inspector map (no raw args or payloads are displayed). */
export const EduFishInspectors: EduFishInspectorMap = Object.freeze({
  'course.read': createInspector('course.read'),
  'material.search': createInspector('material.search'),
  'graph.neighborhood': createInspector('graph.neighborhood'),
  'quiz.read': createInspector('quiz.read'),
  'quiz.submit': createInspector('quiz.submit'),
  'progress.read': createInspector('progress.read'),
  'lab.start': createInspector('lab.start'),
  'lab.status': createInspector('lab.status'),
});

/** Immutable streaming map (purely presentational, no API calls). */
export const EduFishStreaming: EduFishStreamingMap = Object.freeze({
  'course.read': createStreaming('course.read'),
  'material.search': createStreaming('material.search'),
  'graph.neighborhood': createStreaming('graph.neighborhood'),
  'quiz.read': createStreaming('quiz.read'),
  'quiz.submit': createStreaming('quiz.submit'),
  'progress.read': createStreaming('progress.read'),
  'lab.start': createStreaming('lab.start'),
  'lab.status': createStreaming('lab.status'),
});

/**
 * Generic entry point for hosts that dispatch through one component.
 * Unknown or error snapshots show a generic host state.
 */
export function EduFishToolResult(props: EduFishToolRenderProps) {
  const short =
    normalizeEduFishOperation(props.identifier) ??
    normalizeEduFishOperation(props.apiName);

  if (short === undefined) {
    return <SnapshotState kind="invalid" />;
  }

  const Renderer = EduFishRenders[short];
  return <Renderer {...props} />;
}
