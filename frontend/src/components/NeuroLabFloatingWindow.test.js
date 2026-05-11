// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import NeuroLabFloatingWindow from './NeuroLabFloatingWindow.vue';

describe('NeuroLabFloatingWindow', () => {
  it('emits expand and dock updates from header controls', async () => {
    const wrapper = mount(NeuroLabFloatingWindow, {
      props: {
        title: '参数控制',
        subtitle: 'Bandpass Filter',
        dock: 'top-right',
        expanded: false
      },
      slots: {
        default: '<div>content</div>'
      }
    });

    expect(wrapper.classes()).toContain('dock-top-right');

    await wrapper.get('[data-testid="window-toggle"]').trigger('click');
    expect(wrapper.emitted('update:expanded')[0][0]).toBe(true);

    await wrapper.get('[data-testid="dock-bottom-left"]').trigger('click');
    expect(wrapper.emitted('update:dock')[0][0]).toBe('bottom-left');
  });
});
