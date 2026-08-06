import { describe, expect, it } from 'vitest';

import { buildRuntimeInspectorModel } from './runtimeInspectorState';

describe('runtimeInspectorState', () => {
  it('builds a compact inspector model', () => {
    const model = buildRuntimeInspectorModel({
      session: { session_id: 'session-1' },
      runs: [{ run_id: 'run-1' }, { run_id: 'run-2' }],
      events: [{ type: 'run.started' }, { type: 'run.completed' }]
    });

    expect(model.sessionId).toBe('session-1');
    expect(model.runCount).toBe(2);
    expect(model.eventCount).toBe(2);
    expect(model.latestEventType).toBe('run.completed');
  });
});
