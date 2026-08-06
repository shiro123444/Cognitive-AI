import { describe, expect, it } from 'vitest';

import { createDelegationPlan, mergeChildResults, planDelegations } from '../src/agent/supervisor.js';

describe('multi-agent orchestration', () => {
  it('creates a child delegation plan with a unique id and explicit context grants', () => {
    const a = createDelegationPlan({
      fromRunId: 'run-supervisor',
      toAgentId: 'researcher',
      goal: 'Summarize artifact-1',
      grantIds: ['grant-1']
    });
    const b = createDelegationPlan({
      fromRunId: 'run-supervisor',
      toAgentId: 'researcher',
      goal: 'Summarize artifact-1',
      grantIds: ['grant-1']
    });

    expect(a.from_run_id).toBe('run-supervisor');
    expect(a.context_grants).toEqual(['grant-1']);
    expect(a.status).toBe('pending');
    expect(a.delegation_id).toMatch(/^del-/);
    // Unique id per call — previously hardcoded 'delegation-1'.
    expect(a.delegation_id).not.toBe(b.delegation_id);
  });

  it('fans out one delegation plan per sub-task, each uniquely scoped', () => {
    const plans = planDelegations({
      fromRunId: 'run-supervisor',
      tasks: [
        { toAgentId: 'document-analyst', goal: 'summarize', grantIds: ['g-1'] },
        { toAgentId: 'graph-explorer', goal: 'map relations', grantIds: ['g-2'] }
      ]
    });

    expect(plans).toHaveLength(2);
    expect(new Set(plans.map((p) => p.delegation_id))).toHaveLength(2);
    expect(plans[0].to_agent_id).toBe('document-analyst');
    expect(plans[1].context_grants).toEqual(['g-2']);
  });

  it('merges child results into supervisor-visible artifact refs (failed excluded)', () => {
    const merged = mergeChildResults([
      { run_id: 'run-child-a', artifact_ref: 'artifact-9', status: 'completed' },
      { run_id: 'run-child-b', artifact_ref: 'artifact-10', status: 'completed' },
      { run_id: 'run-child-c', artifact_ref: 'artifact-11', status: 'failed' }
    ]);

    expect(merged.output_refs).toEqual(['artifact-9', 'artifact-10']);
    expect(merged.completed).toBe(2);
    expect(merged.failed).toBe(1);
    expect(merged.child_count).toBe(3);
  });

  it('merges zero children gracefully', () => {
    const merged = mergeChildResults([]);
    expect(merged.child_count).toBe(0);
    expect(merged.output_refs).toEqual([]);
  });
});
