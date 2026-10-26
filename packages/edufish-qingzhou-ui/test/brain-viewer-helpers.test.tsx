import { describe, expect, it } from 'vitest';

import {
  assetNameFromUrl,
  brainAssetSignature,
  clampOpacity,
  clampZoom,
  describeError,
  isBrainView,
  nextZoom,
  normalizeBrainAsset,
  normalizeBrainAssets,
  normalizeVolume,
  parseCssColor,
  resolveBrainTheme,
  toMeshRgba255,
} from '../src/neuroimaging/helpers.js';
import {
  BRAIN_EN_DEFAULTS,
  BRAIN_ZH_DEFAULTS,
  type BrainResourceKey,
} from '../src/neuroimaging/strings.js';

describe('brain asset normalization', () => {
  it('trims names and derives a name from the URL when missing', () => {
    expect(
      normalizeBrainAsset({
        url: '  /neurolab/BrainMesh_ICBM152.lh.mz3  ',
        name: '  ',
      }),
    ).toEqual({
      url: '/neurolab/BrainMesh_ICBM152.lh.mz3',
      name: 'BrainMesh_ICBM152.lh.mz3',
    });
  });

  it('drops malformed entries and duplicate URLs', () => {
    const assets = normalizeBrainAssets([
      { url: '/left.mz3', name: 'Left' },
      { url: '/left.mz3', name: 'Left duplicate' },
      { url: '   ', name: 'Blank' },
      { name: 'No URL' },
      null,
      { url: '/right.mz3', name: 'Right' },
    ]);

    expect(assets).toEqual([
      { url: '/left.mz3', name: 'Left' },
      { url: '/right.mz3', name: 'Right' },
    ]);
  });

  it('treats non-array mesh input and malformed volumes as absent', () => {
    expect(normalizeBrainAssets(undefined)).toEqual([]);
    expect(normalizeBrainAssets({ url: '/x' })).toEqual([]);
    expect(normalizeVolume({ name: 'No URL' })).toBeUndefined();
    expect(normalizeVolume({ url: '/mni152.nii.gz' })).toEqual({
      url: '/mni152.nii.gz',
      name: 'mni152.nii.gz',
    });
  });

  it('decodes URL names and ignores query strings', () => {
    expect(assetNameFromUrl('/brain/my%20mesh.gii?v=2#x')).toBe(
      'my mesh.gii',
    );
    expect(assetNameFromUrl('/brain/mesh.gii')).toBe('mesh.gii');
  });

  it('produces a stable signature for equal asset lists', () => {
    const first = [{ url: '/a', name: 'A' }];
    const second = [{ url: '/a', name: 'A' }];
    expect(brainAssetSignature(first)).toBe(brainAssetSignature(second));
    expect(brainAssetSignature(first)).not.toBe(
      brainAssetSignature([{ url: '/a', name: 'B' }]),
    );
  });

  it('recognizes only supported view names', () => {
    expect(isBrainView('surface')).toBe(true);
    expect(isBrainView('volume')).toBe(true);
    expect(isBrainView('mri')).toBe(false);
    expect(isBrainView(undefined)).toBe(false);
  });
});

describe('CSS token color parsing', () => {
  it('parses short and long hex colors', () => {
    expect(parseCssColor('#abc')).toEqual([170, 187, 204, 1]);
    expect(parseCssColor('#112233')).toEqual([17, 34, 51, 1]);
  });

  it('parses rgba and alpha hex colors', () => {
    expect(parseCssColor('rgba(12, 34, 56, 0.5)')).toEqual([
      12, 34, 56, 0.5,
    ]);
    const parsed = parseCssColor('#11223380');
    expect(parsed?.slice(0, 3)).toEqual([17, 34, 51]);
    expect(parsed?.[3]).toBeCloseTo(128 / 255, 5);
  });

  it('parses percentage and space-separated channels', () => {
    expect(parseCssColor('rgb(100% 0% 50% / 25%)')).toEqual([
      255, 0, 127.5, 0.25,
    ]);
  });

  it('rejects unsupported color syntax', () => {
    expect(parseCssColor('var(--ant-color-text)')).toBeUndefined();
    expect(parseCssColor('not-a-color')).toBeUndefined();
    expect(parseCssColor(undefined)).toBeUndefined();
  });
});

describe('theme resolution', () => {
  const colors = resolveBrainTheme({
    background: '#ffffff',
    text: '#111111',
    primary: '#1677ff',
    meshPrimary: '#666666',
    meshSecondary: '#999999',
  });

  it('normalizes host colors into Niivue unit ranges', () => {
    expect(colors.background).toEqual([1, 1, 1, 1]);
    expect(colors.crosshair[2]).toBe(1);
    expect(colors.meshes[0][0]).toBeCloseTo(102 / 255, 5);
    expect(colors.meshes[1][0]).toBeCloseTo(153 / 255, 5);
    expect(colors.meshes[0]).not.toEqual(colors.meshes[1]);
  });

  it('falls back to neutral values when a token is not parseable', () => {
    const fallback = resolveBrainTheme({
      background: 'var(--bg)',
      text: 'var(--text)',
      primary: 'var(--primary)',
      meshPrimary: 'var(--mesh)',
      meshSecondary: 'var(--mesh-2)',
    });
    expect(fallback.background).toEqual([0, 0, 0, 1]);
    expect(fallback.meshes[0]).toEqual([200 / 255, 200 / 255, 200 / 255, 1]);
    expect(fallback.meshes[1][0]).toBeCloseTo(160 / 255, 5);
  });

  it('composites translucent neutral tokens into distinct opaque shades', () => {
    const light = resolveBrainTheme({
      background: '#ffffff',
      text: '#111111',
      primary: '#1677ff',
      meshPrimary: 'rgba(0, 0, 0, 0.65)',
      meshSecondary: 'rgba(0, 0, 0, 0.45)',
    });
    expect(light.background).toEqual([1, 1, 1, 1]);
    expect(light.meshes[0][0]).toBeCloseTo(0.35, 5);
    expect(light.meshes[1][0]).toBeCloseTo(0.55, 5);
    expect(light.meshes[0]).not.toEqual(light.meshes[1]);
  });

  it('emits opaque mesh bytes so opacity stays a separate control', () => {
    expect(toMeshRgba255([1, 0.5, 0, 0.2])).toEqual(
      new Uint8Array([255, 128, 0, 255]),
    );
  });
});

describe('camera and opacity helpers', () => {
  it('clamps surface opacity and rejects non-finite input', () => {
    expect(clampOpacity(-1)).toBe(0);
    expect(clampOpacity(2)).toBe(1);
    expect(clampOpacity(0.4)).toBe(0.4);
    expect(clampOpacity(Number.NaN)).toBe(0.85);
  });

  it('steps zoom multiplicatively and respects bounds', () => {
    expect(nextZoom(1, 'in')).toBe(1.15);
    expect(nextZoom(1, 'out')).toBe(0.87);
    expect(nextZoom(3.9, 'in')).toBe(4);
    expect(nextZoom(0.5, 'out')).toBe(0.5);
    expect(clampZoom(Number.NaN)).toBe(1);
  });
});

describe('error detail helper', () => {
  it('reports real messages without inventing details', () => {
    expect(describeError(new Error('network down'))).toBe('network down');
    expect(describeError('timeout')).toBe('timeout');
    expect(describeError(new Error('  '))).toBeUndefined();
    expect(describeError(42)).toBeUndefined();
  });
});

describe('brain translation defaults', () => {
  it('keeps English and Chinese bundles in sync', () => {
    const englishKeys = Object.keys(BRAIN_EN_DEFAULTS).sort();
    const chineseKeys = Object.keys(BRAIN_ZH_DEFAULTS).sort();
    expect(chineseKeys).toEqual(englishKeys);
    for (const key of englishKeys as BrainResourceKey[]) {
      expect(BRAIN_EN_DEFAULTS[key].trim().length).toBeGreaterThan(0);
      expect(BRAIN_ZH_DEFAULTS[key].trim().length).toBeGreaterThan(0);
    }
  });

  it('does not claim measured or simulated activity', () => {
    const disclaimer = (
      BRAIN_EN_DEFAULTS.brainDisclaimer +
      BRAIN_ZH_DEFAULTS.brainDisclaimer
    ).toLowerCase();
    expect(disclaimer).toContain('not a patient scan');
    expect(disclaimer).toContain('does not show');
    expect(disclaimer).toContain('不是患者扫描');
  });
});
