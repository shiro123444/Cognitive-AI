import { describe, expect, it } from 'vitest';

import { canDelegate } from '../src/core/policy.js';
import { nextRunState } from '../src/core/run-service.js';

describe('failure and policy baselines', () => {
  it('allows a waiting child run to fail cleanly', () => {
    expect(nextRunState('waiting_child', 'fail')).toBe('failed');
  });

  it('allows a running run to be interrupted', () => {
    expect(nextRunState('running', 'interrupt')).toBe('interrupted');
  });

  it('rejects delegation to agents outside the allowed target list', () => {
    expect(canDelegate(['researcher'], 'reviewer')).toBe(false);
  });
});
