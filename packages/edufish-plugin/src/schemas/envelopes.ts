import { z } from 'zod';

/**
 * The wire envelope is exact: extra keys are rejected in both directions.
 * `data` must be present (possibly any JSON value) and `error` must carry a
 * non-empty code plus a message.
 */
export const SuccessEnvelopeSchema = z
  .object({
    success: z.literal(true),
    data: z.unknown(),
  })
  .strict();

export const ErrorDetailSchema = z
  .object({
    code: z.string().min(1).max(200),
    message: z.string().max(20_000),
  })
  .strict();

export const ErrorEnvelopeSchema = z
  .object({
    success: z.literal(false),
    error: ErrorDetailSchema,
  })
  .strict();

export type ErrorEnvelope = z.output<typeof ErrorEnvelopeSchema>;
