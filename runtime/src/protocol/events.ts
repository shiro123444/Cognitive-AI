import { EventSchema } from './types.js';

export function assertValidEvent(event: unknown) {
  return EventSchema.parse(event);
}
