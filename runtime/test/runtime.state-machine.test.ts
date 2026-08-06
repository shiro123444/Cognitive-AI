import { describe, expect, it } from 'vitest';

import { nextRunState } from '../src/core/run-service.js';

describe('run state machine', () => {
  it('allows created -> queued -> running -> completed', () => {
    expect(nextRunState('created', 'enqueue')).toBe('queued');
    expect(nextRunState('queued', 'start')).toBe('running');
    expect(nextRunState('running', 'complete')).toBe('completed');
  });

  it('allows running -> waiting_child -> running', () => {
    expect(nextRunState('running', 'delegate')).toBe('waiting_child');
    expect(nextRunState('waiting_child', 'child_complete')).toBe('running');
  });

  it('throws on invalid transitions', () => {
    expect(() => nextRunState('completed', 'start')).toThrow('invalid transition');
  });
});
