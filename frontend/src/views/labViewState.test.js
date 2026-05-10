import { describe, expect, it } from 'vitest';
import { bandLabel, firstSignalPreview, reportSections, templateStatusLabel, summarizeRun } from './labViewState';

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

  it('extracts report sections in display order', () => {
    const run = {
      report: {
        content: {
          purpose: 'Observe EEG bands.',
          observations: ['Alpha is dominant.'],
          limitations: 'Synthetic data only.',
          next_steps: 'Change sample rate.'
        }
      }
    };

    expect(reportSections(run)).toEqual([
      { title: '实验目的', body: 'Observe EEG bands.' },
      { title: '关键观察', body: 'Alpha is dominant.' },
      { title: '限制说明', body: 'Synthetic data only.' },
      { title: '下一步', body: 'Change sample rate.' }
    ]);
  });
});
