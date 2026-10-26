import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BrainViewer } from '../src/neuroimaging/BrainViewer.js';

/**
 * jsdom has no WebGL 2 implementation. That makes this a real check of the
 * graceful failure path: the component must report the missing capability and
 * must not pretend an anatomical render succeeded.
 */
describe('BrainViewer without WebGL 2', () => {
  it('shows a visible retryable error and no fake brain', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network should not be used'));

    render(
      <BrainViewer
        meshes={[
          { url: '/neurolab/niivue/lh.mz3', name: 'lh.mz3' },
          { url: '/neurolab/niivue/rh.mz3', name: 'rh.mz3' },
        ]}
        volume={{ url: '/neurolab/niivue/mni152.nii.gz', name: 'mni152.nii.gz' }}
      />,
    );

    expect(
      await screen.findByText(/WebGL 2 is not available/i),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(
      /viewer is unavailable/i,
    );

    // The MRI volume is never fetched, and no asset request happens when the
    // renderer cannot start.
    expect(fetchSpy).not.toHaveBeenCalled();

    // The textual equivalent must be explicit about what this view is not.
    expect(screen.getByText(/not a patient scan/i)).toBeTruthy();
    expect(screen.getByText(/does not show measured/i)).toBeTruthy();

    fetchSpy.mockRestore();
  });
});
