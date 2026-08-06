import type { RunAction, RunState } from './runtime-types.js';

const transitions: Record<RunState, Partial<Record<RunAction, RunState>>> = {
  created: { enqueue: 'queued', cancel: 'cancelled' },
  queued: { start: 'running', cancel: 'cancelled' },
  running: {
    wait_tool: 'waiting_tool',
    delegate: 'waiting_child',
    retry: 'retrying',
    interrupt: 'interrupted',
    complete: 'completed',
    fail: 'failed',
    cancel: 'cancelled'
  },
  waiting_tool: {
    tool_complete: 'running',
    interrupt: 'interrupted',
    fail: 'failed',
    cancel: 'cancelled'
  },
  waiting_child: {
    child_complete: 'running',
    interrupt: 'interrupted',
    fail: 'failed',
    cancel: 'cancelled'
  },
  retrying: { start: 'running', fail: 'failed', cancel: 'cancelled' },
  interrupted: { retry: 'retrying', cancel: 'cancelled' },
  completed: {},
  failed: {},
  cancelled: {}
};

export function nextRunState(current: RunState, action: RunAction): RunState {
  const next = transitions[current][action];
  if (!next) throw new Error(`invalid transition: ${current} -> ${action}`);
  return next;
}
