import type { EduFishInvocation } from '@edufish/plugin';
import { createContext, useContext, useMemo } from 'react';

import type {
  EduFishReference,
  EduFishUIClient,
  EduFishUIProviderProps,
} from './contracts.js';

/**
 * Business dependencies shared by the EduFish adapter.
 *
 * This provider deliberately owns no theme, i18n, palette or global styles.
 * The host renders it below its own ThemeProvider/ConfigProvider.
 */
export interface EduFishUIContextValue {
  readonly client: EduFishUIClient;
  readonly getInvocation: () => EduFishInvocation;
  readonly identityKey: string;
  readonly createRequestId?: () => string;
  readonly onOpenReference?: (reference: EduFishReference) => void;
}

const EduFishUIContext = createContext<EduFishUIContextValue | undefined>(
  undefined,
);

EduFishUIContext.displayName = 'EduFishUIContext';

export function EduFishUIProvider({
  client,
  getInvocation,
  identityKey,
  createRequestId,
  onOpenReference,
  children,
}: EduFishUIProviderProps) {
  const value = useMemo<EduFishUIContextValue>(
    () => ({
      client,
      getInvocation,
      identityKey,
      createRequestId,
      onOpenReference,
    }),
    [
      client,
      getInvocation,
      identityKey,
      createRequestId,
      onOpenReference,
    ],
  );

  return (
    <EduFishUIContext.Provider value={value}>
      {children}
    </EduFishUIContext.Provider>
  );
}

/**
 * Optional access for read-only renderers (reference callback, identity).
 * Snapshot components must keep working outside the provider.
 */
export function useEduFishUIContext(): EduFishUIContextValue | undefined {
  return useContext(EduFishUIContext);
}

/**
 * Strict access. Only interactive actions call this; a missing provider is a
 * programmer error and never triggers a network call.
 */
export function useRequiredEduFishUIContext(): EduFishUIContextValue {
  const value = useContext(EduFishUIContext);
  if (value === undefined) {
    throw new Error(
      'EduFish actions require an <EduFishUIProvider> with a trusted invocation source.',
    );
  }
  return value;
}
