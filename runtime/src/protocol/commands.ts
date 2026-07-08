import { z } from 'zod';

import { ProtocolVersionSchema } from './types.js';

export const CommandEnvelopeSchema = z.object({
  protocol_version: ProtocolVersionSchema,
  request_id: z.string().min(1),
  command: z.string().min(1),
  payload: z.record(z.string(), z.unknown())
});

export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;
