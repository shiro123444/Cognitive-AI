import { z } from 'zod';

export const ProtocolVersionSchema = z.literal('v1alpha1');

export const AgentDescriptorSchema = z.object({
  agent_id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  model_policy: z.object({
    provider: z.string().min(1),
    model: z.string().min(1)
  }),
  tool_scopes: z.array(z.string()),
  resource_scopes: z.array(z.string()),
  delegation_policy: z.object({
    allowed_targets: z.array(z.string())
  }),
  accepted_message_types: z.array(z.string()),
  produced_artifact_types: z.array(z.string())
});

export const SessionSchema = z.object({
  protocol_version: ProtocolVersionSchema,
  session_id: z.string().min(1),
  participants: z.array(z.string()),
  branch_heads: z.record(z.string(), z.string()),
  policy_refs: z.array(z.string()),
  shared_resource_refs: z.array(z.string()),
  audit_settings: z.object({
    enabled: z.boolean()
  })
});

export const RunStateSchema = z.enum([
  'created',
  'queued',
  'running',
  'waiting_tool',
  'waiting_child',
  'retrying',
  'interrupted',
  'completed',
  'failed',
  'cancelled'
]);

export const RunSchema = z.object({
  run_id: z.string().min(1),
  session_id: z.string().min(1),
  agent_id: z.string().min(1),
  parent_run_id: z.string().min(1).nullable(),
  state: RunStateSchema,
  mailbox_offset: z.number().int().nonnegative(),
  input_refs: z.array(z.string()),
  output_refs: z.array(z.string()),
  started_at: z.string().datetime(),
  ended_at: z.string().datetime().nullable()
});

export const DelegationSchema = z.object({
  delegation_id: z.string().min(1),
  from_run_id: z.string().min(1),
  to_agent_id: z.string().min(1),
  goal: z.string().min(1),
  constraints: z.array(z.string()),
  context_grants: z.array(z.string()),
  expected_output: z.string().min(1),
  status: z.enum(['pending', 'accepted', 'rejected', 'running', 'completed', 'failed'])
});

export const EventSchema = z.object({
  event_id: z.string().min(1),
  session_id: z.string().min(1),
  run_id: z.string().min(1),
  session_seq: z.number().int().positive(),
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  timestamp: z.string().datetime()
});

export type AgentDescriptor = z.infer<typeof AgentDescriptorSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type Run = z.infer<typeof RunSchema>;
export type Delegation = z.infer<typeof DelegationSchema>;
export type RuntimeEvent = z.infer<typeof EventSchema>;
