import { describe, expect, it } from 'vitest';
import { RUNTIME_PROTOCOL_VERSION } from '../src/index.js';

describe('runtime bootstrap', () => {
  it('exports the initial protocol version', () => {
    expect(RUNTIME_PROTOCOL_VERSION).toBe('v1alpha1');
  });
});
