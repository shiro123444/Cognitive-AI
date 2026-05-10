import { describe, expect, it } from 'vitest';
import { bandLabel, firstSignalPreview, templateStatusLabel, summarizeRun } from './labViewState';

describe('labViewState', () => {
  it('labels template status for students', () => {
    expect(templateStatusLabel('published')).toBe('可运行');
    expect(templateStatusLabel('coming_soon')).toBe('即将开放');
  });

  it('labels eeg bands', () => {
    expect(bandLabel('alpha')).toBe('Alpha / 放松节律');
    expect(bandLabel('gamma')).toBe('Gamma');
  });

  it('extracts first signal preview channel', () => {
    const run = {
      artifacts: [{ data: { signal_preview: [[0.1, 0.2], [0.3, 0.4]] } }]
    };

    expect(firstSignalPreview(run)).toEqual([0.1, 0.2]);
  });

  it('summarizes completed run', () => {
    expect(summarizeRun({ status: 'completed', summary: { sample_count: 128, dominant_band: 'alpha' } }))
      .toEqual('128 samples · Alpha / 放松节律');
  });
});
