import {
  assertTrustedInvocation,
  EduFishPluginError,
  isEduFishPluginError,
  isWriteOperation,
  resolveRequestId,
  validateOperationInput,
  validateOperationOutput,
  type EduFishInvocation,
  type EduFishOperationInput,
  type EduFishOperationName,
  type EduFishOperationOutput,
} from '@edufish/plugin';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { EduFishActionState, EduFishUIClient } from './contracts.js';
import { useRequiredEduFishUIContext } from './provider.js';

interface InternalState<O extends EduFishOperationName> {
  readonly operation: O;
  readonly identityKey: string;
  readonly data: EduFishOperationOutput<O> | undefined;
  readonly pending: boolean;
  readonly error: EduFishPluginError | undefined;
  readonly requestId: string | undefined;
}

interface WriteRequest {
  readonly signature: string;
  readonly requestId: string;
}

/** Delimiter that cannot appear in JSON input or a trusted user id. */
const SIGNATURE_SEPARATOR = String.fromCharCode(0);

function createInitialState<O extends EduFishOperationName>(
  operation: O,
  identityKey: string,
): InternalState<O> {
  return {
    operation,
    identityKey,
    data: undefined,
    pending: false,
    error: undefined,
    requestId: undefined,
  };
}

/** Recursively freeze a parsed JSON snapshot before exposing it to the UI. */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

/** Deterministic serialisation used only for the write-retry signature. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? 'null' : encoded;
}

function writeSignature(
  operation: EduFishOperationName,
  input: Record<string, unknown>,
  identityKey: string,
  userId: string,
  sessionId: string,
): string {
  return [
    operation,
    stableStringify(input),
    identityKey,
    userId,
    sessionId,
  ].join(SIGNATURE_SEPARATOR);
}

function fallbackRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi !== undefined && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `edufish-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function nextRequestId(factory: (() => string) | undefined): string {
  if (factory !== undefined) {
    try {
      const value = factory();
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    } catch {
      // A broken id factory must not make a write impossible.
    }
  }
  return fallbackRequestId();
}

/**
 * Normalise every failure to a redacted plugin error. Raw thrown values may
 * contain transport details, so their message is never copied.
 */
function toPluginError(
  error: unknown,
  operation: EduFishOperationName,
  requestId: string | undefined,
): EduFishPluginError {
  if (isEduFishPluginError(error)) {
    return error;
  }
  return new EduFishPluginError(
    'TRANSPORT_ERROR',
    `Operation ${operation} failed.`,
    { operation, requestId, retriable: true },
  );
}

/**
 * Explicit EduFish operation action.
 *
 * The hook performs no work on mount, rerender or StrictMode replay. A call
 * only happens from the returned `run(input)` function after the trusted
 * invocation source has been read and validated.
 */
export function useEduFishAction<O extends EduFishOperationName>(
  operation: O,
): EduFishActionState<O> {
  const {
    client,
    getInvocation,
    identityKey,
    createRequestId,
  } = useRequiredEduFishUIContext();

  const [state, setState] = useState<InternalState<O>>(() =>
    createInitialState(operation, identityKey),
  );

  const mountedRef = useRef(true);
  const epochRef = useRef(0);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const writeIdRef = useRef<WriteRequest | undefined>(undefined);
  const succeededRef = useRef<string | undefined>(undefined);

  // Latest scope values are read by async callbacks so a replaced client,
  // invocation factory or user can never receive a result from the previous
  // scope. Assigning the latest-value ref during render also closes the gap
  // before effects run.
  const latestRef = useRef({ client, getInvocation, identityKey });
  latestRef.current = { client, getInvocation, identityKey };

  // Clear retry identity synchronously only when the user/operation changes.
  // Client or invocation-factory replacement keeps the issued write id so a
  // retry of the same actual user/session/payload can never duplicate a write
  // that may have committed before the local abort.
  const renderedIdentityRef = useRef({ identityKey, operation });
  const renderedIdentity = renderedIdentityRef.current;
  if (
    renderedIdentity.identityKey !== identityKey ||
    renderedIdentity.operation !== operation
  ) {
    renderedIdentityRef.current = { identityKey, operation };
    writeIdRef.current = undefined;
    succeededRef.current = undefined;
  }

  const previousScopeRef = useRef<
    | {
        readonly client: EduFishUIClient;
        readonly getInvocation: () => EduFishInvocation;
        readonly identityKey: string;
        readonly operation: O;
      }
    | undefined
  >(undefined);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      epochRef.current += 1;
      const controller = controllerRef.current;
      controllerRef.current = undefined;
      controller?.abort();
    };
  }, []);

  useEffect(() => {
    const previous = previousScopeRef.current;
    if (previous === undefined) {
      // Establish the baseline after mount. StrictMode's replay sees this
      // populated baseline and does not treat its own props as a replacement.
      previousScopeRef.current = {
        client,
        getInvocation,
        identityKey,
        operation,
      };
      return;
    }

    const identityChanged =
      previous.identityKey !== identityKey ||
      previous.operation !== operation;
    const sourceChanged =
      identityChanged ||
      previous.client !== client ||
      previous.getInvocation !== getInvocation;

    previousScopeRef.current = { client, getInvocation, identityKey, operation };

    if (!sourceChanged) {
      return;
    }

    // Any source replacement invalidates outstanding work. Only a changed
    // user/operation invalidates the issued write id; a client or invocation
    // factory replacement keeps it for a safe retry under the same scope.
    epochRef.current += 1;
    const controller = controllerRef.current;
    controllerRef.current = undefined;
    controller?.abort();

    if (identityChanged) {
      // The issued write id and success signature were already cleared
      // synchronously during render. Do not clear them again here: a run may
      // have started under the new identity before this passive effect ran.
      setState(createInitialState(operation, identityKey));
    } else {
      // Same user/operation, new client or invocation callback: keep the last
      // snapshot but never leave a phantom pending state from the old source.
      setState((previousState) =>
        previousState.identityKey === identityKey &&
        previousState.operation === operation
          ? { ...previousState, pending: false }
          : previousState,
      );
    }
  }, [client, getInvocation, identityKey, operation]);

  const run = useCallback(
    async (
      rawInput: EduFishOperationInput<O>,
  ): Promise<EduFishOperationOutput<O> | undefined> => {
      // Suppress double clicks / concurrent explicit submissions.
      if (controllerRef.current !== undefined) {
        return undefined;
      }

      const scopedClient = client;
      const scopedGetInvocation = getInvocation;
      const scopedIdentity = identityKey;
      const epoch = epochRef.current;

      const isCurrent = (): boolean =>
        mountedRef.current &&
        epochRef.current === epoch &&
        latestRef.current.identityKey === scopedIdentity &&
        latestRef.current.client === scopedClient &&
        latestRef.current.getInvocation === scopedGetInvocation;

      // A stale event handler must not start work in a replaced source.
      if (!isCurrent()) {
        return undefined;
      }

      let input: Record<string, unknown>;
      try {
        input = validateOperationInput(operation, rawInput);
      } catch (error) {
        if (isCurrent()) {
          setState((previous) =>
            previous.identityKey === scopedIdentity &&
            previous.operation === operation
              ? {
                  ...previous,
                  pending: false,
                  error: toPluginError(error, operation, undefined),
                }
              : previous,
          );
        }
        return undefined;
      }

      let invocation: EduFishInvocation;
      try {
        const candidate: unknown = getInvocation();
        assertTrustedInvocation(candidate);
        invocation = candidate;
      } catch (error) {
        if (isCurrent()) {
          setState((previous) =>
            previous.identityKey === scopedIdentity &&
            previous.operation === operation
              ? {
                  ...previous,
                  pending: false,
                  error: toPluginError(error, operation, undefined),
                }
              : previous,
          );
        }
        return undefined;
      }

      const isWrite = isWriteOperation(operation);
      const signature = isWrite
        ? writeSignature(
            operation,
            input,
            scopedIdentity,
            invocation.scope.userId,
            invocation.scope.sessionId,
          )
        : undefined;

      let requestId: string | undefined;
      try {
        if (isWrite && signature !== undefined) {
          // A successful write is not replayed until the UI calls reset().
          if (succeededRef.current === signature) {
            return undefined;
          }

          const existing = writeIdRef.current;
          const candidateRequestId =
            existing !== undefined && existing.signature === signature
              ? existing.requestId
              : invocation.requestId ?? nextRequestId(createRequestId);

          const resolved = resolveRequestId(operation, {
            ...invocation,
            requestId: candidateRequestId,
          });
          if (resolved === undefined) {
            return undefined;
          }
          requestId = resolved;
          writeIdRef.current = { signature, requestId: resolved };
        } else {
          requestId = resolveRequestId(operation, invocation);
        }
      } catch (error) {
        if (isCurrent()) {
          setState((previous) =>
            previous.identityKey === scopedIdentity &&
            previous.operation === operation
              ? {
                  ...previous,
                  pending: false,
                  error: toPluginError(error, operation, undefined),
                }
              : previous,
          );
        }
        return undefined;
      }

      const controller = new AbortController();
      controllerRef.current = controller;

      const externalSignal = invocation.signal;
      const onExternalAbort = (): void => {
        if (!controller.signal.aborted) {
          controller.abort();
        }
      };

      if (externalSignal !== undefined) {
        if (externalSignal.aborted) {
          controller.abort();
        } else {
          externalSignal.addEventListener('abort', onExternalAbort, {
            once: true,
          });
        }
      }

      const cleanup = (): void => {
        externalSignal?.removeEventListener('abort', onExternalAbort);
        if (controllerRef.current === controller) {
          controllerRef.current = undefined;
        }
      };

      if (controller.signal.aborted) {
        cleanup();
        return undefined;
      }

      setState({
        operation,
        identityKey: scopedIdentity,
        data: undefined,
        pending: true,
        error: undefined,
        requestId,
      });

      const clientInvocation: EduFishInvocation = {
        scope: {
          userId: invocation.scope.userId,
          sessionId: invocation.scope.sessionId,
        },
        signal: controller.signal,
        ...(requestId === undefined ? {} : { requestId }),
        ...(invocation.onEvent === undefined
          ? {}
          : { onEvent: invocation.onEvent }),
      };

      try {
        const rawOutput = await scopedClient.invoke(
          operation,
          input,
          clientInvocation,
        );

        if (!isCurrent() || controller.signal.aborted) {
          return undefined;
        }

        const validated = validateOperationOutput(
          operation,
          rawOutput,
        ) as EduFishOperationOutput<O>;

        if (!isCurrent() || controller.signal.aborted) {
          return undefined;
        }

        const data = deepFreeze(validated);
        if (isWrite && signature !== undefined) {
          succeededRef.current = signature;
        }

        setState((previous) =>
          previous.identityKey === scopedIdentity &&
          previous.operation === operation
            ? {
                ...previous,
                data,
                pending: false,
                error: undefined,
                requestId,
              }
            : previous,
        );

        return data;
      } catch (error) {
        // Cancellation, unmount and scope replacement never surface errors.
        if (!isCurrent() || controller.signal.aborted) {
          return undefined;
        }

        const normalized = toPluginError(error, operation, requestId);
        if (normalized.code === 'ABORTED') {
          setState((previous) =>
            previous.identityKey === scopedIdentity &&
            previous.operation === operation
              ? { ...previous, pending: false, error: undefined }
              : previous,
          );
          return undefined;
        }

        setState((previous) =>
          previous.identityKey === scopedIdentity &&
          previous.operation === operation
            ? { ...previous, pending: false, error: normalized }
            : previous,
        );
        return undefined;
      } finally {
        cleanup();
      }
    },
    [client, createRequestId, getInvocation, identityKey, operation],
  );

  const cancel = useCallback((): void => {
    const controller = controllerRef.current;
    if (controller === undefined) {
      return;
    }
    // Local cancellation only: it aborts our wait, not backend work.
    controllerRef.current = undefined;
    controller.abort();
    epochRef.current += 1;
    setState((previous) =>
      previous.identityKey === identityKey && previous.operation === operation
        ? { ...previous, pending: false, error: undefined }
        : previous,
    );
  }, [identityKey, operation]);

  const reset = useCallback((): void => {
    const controller = controllerRef.current;
    controllerRef.current = undefined;
    controller?.abort();
    epochRef.current += 1;
    writeIdRef.current = undefined;
    succeededRef.current = undefined;
    setState(createInitialState(operation, identityKey));
  }, [identityKey, operation]);

  const active =
    state.identityKey === identityKey && state.operation === operation
      ? state
      : undefined;

  return useMemo<EduFishActionState<O>>(
    () => ({
      run,
      data: active?.data,
      pending: active?.pending ?? false,
      error: active?.error,
      requestId: active?.requestId,
      cancel,
      reset,
    }),
    [active, cancel, reset, run],
  );
}
