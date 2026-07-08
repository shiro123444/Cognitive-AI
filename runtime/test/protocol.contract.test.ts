import { describe, expect, it } from 'vitest';

import {
  AgentDescriptorSchema,
  DelegationSchema,
  EventSchema,
  RunSchema,
  SessionSchema
} from '../src/protocol/types.js';

describe('protocol contract', () => {
  it('accepts a valid session object', () => {
    const parsed = SessionSchema.parse({
      protocol_version: 'v1alpha1',
      session_id: 'session-1',
      participants: ['user:ada'],
      branch_heads: { main: 'entry-4' },
      policy_refs: [],
      shared_resource_refs: [],
      audit_settings: { enabled: true }
    });

    expect(parsed.session_id).toBe('session-1');
  });

  it('accepts a valid run object', () => {
    const parsed = RunSchema.parse({
      run_id: 'run-1',
      session_id: 'session-1',
      agent_id: 'supervisor',
      parent_run_id: null,
      state: 'running',
      mailbox_offset: 0,
      input_refs: ['entry-1'],
      output_refs: [],
      started_at: '2026-05-14T12:00:00.000Z',
      ended_at: null
    });

    expect(parsed.state).toBe('running');
  });

  it('accepts a valid delegation object', () => {
    const parsed = DelegationSchema.parse({
      delegation_id: 'delegation-1',
      from_run_id: 'run-1',
      to_agent_id: 'researcher',
      goal: 'Summarize the assigned artifact.',
      constraints: ['No external tools'],
      context_grants: ['grant-1'],
      expected_output: 'artifact_ref',
      status: 'pending'
    });

    expect(parsed.to_agent_id).toBe('researcher');
  });

  it('accepts a valid event object', () => {
    const parsed = EventSchema.parse({
      event_id: 'event-1',
      session_id: 'session-1',
      run_id: 'run-1',
      session_seq: 1,
      type: 'run.started',
      payload: { state: 'running' },
      timestamp: '2026-05-14T12:00:00.000Z'
    });

    expect(parsed.session_seq).toBe(1);
  });

  it('accepts a valid agent descriptor', () => {
    const parsed = AgentDescriptorSchema.parse({
      agent_id: 'supervisor',
      name: 'Supervisor',
      role: 'supervisor',
      model_policy: { provider: 'openai', model: 'gpt-4.1-mini' },
      tool_scopes: ['runtime.inspect'],
      resource_scopes: ['session.read'],
      delegation_policy: { allowed_targets: ['researcher'] },
      accepted_message_types: ['user_message'],
      produced_artifact_types: ['text/markdown']
    });

    expect(parsed.role).toBe('supervisor');
  });
});
