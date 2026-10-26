import { Empty } from '@lobehub/ui';
import { useTranslation } from 'react-i18next';

import {
  COMPONENT_RESOURCE_DEFAULTS,
  type ComponentResourceKey,
} from './resource-keys.js';

export type Translate = (
  key: ComponentResourceKey,
  options?: Record<string, string | number>,
) => string;

/**
 * Translation helper for the pinned `edufish` namespace. Defaults keep the
 * components readable if the foundation resource bundle lands later; real
 * host translations always take precedence.
 */
export function useEduFishTranslation(): Translate {
  const { t } = useTranslation('edufish');
  const translate = t as unknown as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;

  return (key, options) =>
    translate(key, {
      defaultValue: COMPONENT_RESOURCE_DEFAULTS[key],
      ...options,
    });
}

export function mergeClassNames(
  ...values: Array<string | undefined>
): string {
  return values.filter(Boolean).join(' ');
}

export function EmptyState({ message }: { message: string }) {
  return <Empty description={message} />;
}

export function truncateText(value: string, maxLength: number): string {
  const characters = Array.from(value);
  return characters.length <= maxLength
    ? value
    : `${characters.slice(0, maxLength - 1).join('')}…`;
}

export type StatusTone = 'success' | 'processing' | 'error' | 'default';

export function statusTone(status: string): StatusTone {
  const normalized = status.trim().toLowerCase();
  if (
    normalized === 'completed' ||
    normalized === 'complete' ||
    normalized === 'succeeded' ||
    normalized === 'success' ||
    normalized === 'passed'
  ) {
    return 'success';
  }
  if (
    normalized === 'running' ||
    normalized === 'pending' ||
    normalized === 'queued' ||
    normalized === 'started' ||
    normalized === 'processing'
  ) {
    return 'processing';
  }
  if (
    normalized === 'failed' ||
    normalized === 'error' ||
    normalized === 'cancelled' ||
    normalized === 'canceled'
  ) {
    return 'error';
  }
  return 'default';
}
