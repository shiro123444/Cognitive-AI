import { randomUUID } from 'node:crypto';

import type { Delegation } from '../protocol/types.js';

export interface DelegationPlanInput {
  fromRunId: string;
  toAgentId: string;
  goal: string;
  grantIds: string[];
  constraints?: string[];
  expectedOutput?: string;
}

/**
 * Create a real delegation plan with a unique id.
 *
 * Previously this returned a hardcoded `delegation_id: 'delegation-1'`, which
 * collided across every call. Now each plan gets a unique id and reflects the
 * caller's goal / constraints / grants, so it is safe to fan out many at once.
 */
export function createDelegationPlan(input: DelegationPlanInput): Delegation {
  return {
    delegation_id: `del-${randomUUID()}`,
    from_run_id: input.fromRunId,
    to_agent_id: input.toAgentId,
    goal: input.goal,
    constraints: input.constraints ?? [],
    context_grants: input.grantIds,
    expected_output: input.expectedOutput ?? 'artifact_ref',
    status: 'pending',
  };
}

export interface DelegationTask {
  toAgentId: string;
  goal: string;
  grantIds: string[];
  constraints?: string[];
  expectedOutput?: string;
}

/**
 * Fan-out: split a parent goal into one delegation plan per sub-task / child
 * agent. Each plan is independently scoped with its own context grants.
 */
export function planDelegations(input: { fromRunId: string; tasks: DelegationTask[] }): Delegation[] {
  return input.tasks.map((task) =>
    createDelegationPlan({
      fromRunId: input.fromRunId,
      toAgentId: task.toAgentId,
      goal: task.goal,
      grantIds: task.grantIds,
      constraints: task.constraints,
      expectedOutput: task.expectedOutput,
    })
  );
}

export interface ChildResultInput {
  run_id: string;
  artifact_ref: string;
  status: 'completed' | 'failed';
}

export interface MergedChildResults {
  child_count: number;
  completed: number;
  failed: number;
  output_refs: string[];
  child_runs: Array<{ run_id: string; status: string }>;
}

/**
 * Fan-in: merge one or more child run results into the parent's output_refs.
 *
 * Previously a single-child passthrough. Now aggregates any number of child
 * runs: counts completed/failed, collects successful artifact refs, and keeps
 * per-child status for the parent agent to reason about.
 */
export function mergeChildResults(results: ChildResultInput[]): MergedChildResults {
  const completed = results.filter((r) => r.status === 'completed');
  return {
    child_count: results.length,
    completed: completed.length,
    failed: results.length - completed.length,
    output_refs: completed.map((r) => r.artifact_ref),
    child_runs: results.map((r) => ({ run_id: r.run_id, status: r.status })),
  };
}
