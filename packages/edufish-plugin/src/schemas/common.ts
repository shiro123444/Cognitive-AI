import { z } from 'zod';

import {
  MAX_ID_LENGTH,
  MAX_QUERY_LENGTH,
} from '../constants.js';

/** Non-empty identifier bounded to the wire limit. */
export const IdSchema = z
  .string()
  .min(1)
  .max(MAX_ID_LENGTH)
  .refine((value) => !containsControlCharacters(value), {
    message: 'must not contain control characters',
  });

function containsControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Free-text query: non-empty after trimming, bounded. */
export const QuerySchema = z
  .string()
  .max(MAX_QUERY_LENGTH)
  .refine((value) => value.trim().length > 0, {
    message: 'must not be empty or whitespace-only',
  });

/** ISO-ish timestamp strings returned by the API. */
export const TimestampSchema = z.string().min(1).max(64);

/** JSON object whose values are interpreted by the domain service. */
export const JsonRecordSchema = z.record(z.unknown());

/** Non-negative integer counter. */
export const NonNegativeIntegerSchema = z.number().int().nonnegative();

/** Bounded string helper for output fields that may be empty. */
export function boundedText(maxLength: number): z.ZodString {
  return z.string().max(maxLength);
}
