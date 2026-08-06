// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/runtime', () => ({
  createRuntimeSession: vi.fn(() =>
    Promise.resolve({ session_id: 's-inspector', protocol_version: 'v1alpha1' })
  ),
  listRuntimeEvents: vi.fn(() => Promise.resolve({ events: [] })),
  startRuntimeRun: vi.fn(() => Promise.resolve({ run_id: 'r-1', final_state: 'completed' }))
}));

import RuntimeInspectorView from './RuntimeInspectorView.vue';
import { createRuntimeSession, startRuntimeRun } from '../api/runtime';

describe('RuntimeInspectorView', () => {
  beforeEach(() => {
    localStorage.clear();
    createRuntimeSession.mockClear();
    startRuntimeRun.mockClear();
  });

  it('bootstraps a session and renders the inspector shell', async () => {
    const wrapper = mount(RuntimeInspectorView);
    await flushPromises();

    expect(createRuntimeSession).toHaveBeenCalled();
    expect(wrapper.text()).toContain('Runtime Inspector');
    expect(wrapper.text()).toContain('s-inspector');
    expect(wrapper.text()).toContain('Latest Event');
    wrapper.unmount();
  });

  it('starts a test run on click with the active session id', async () => {
    const wrapper = mount(RuntimeInspectorView);
    await flushPromises();

    await wrapper.get('button.runtime-inspector__run').trigger('click');
    await flushPromises();

    expect(startRuntimeRun).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: 's-inspector', agent_id: 'tutor' })
    );
    wrapper.unmount();
  });
});
