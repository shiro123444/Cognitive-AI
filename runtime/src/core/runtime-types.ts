export type RunState =
  | 'created'
  | 'queued'
  | 'running'
  | 'waiting_tool'
  | 'waiting_child'
  | 'retrying'
  | 'interrupted'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type RunAction =
  | 'enqueue'
  | 'start'
  | 'wait_tool'
  | 'tool_complete'
  | 'delegate'
  | 'child_complete'
  | 'retry'
  | 'interrupt'
  | 'complete'
  | 'fail'
  | 'cancel';
