import {
  EDUFISH_OPERATION_NAMES,
  EDUFISH_PLUGIN_ID,
  EDUFISH_PLUGIN_VERSION,
  EDUFISH_PROTOCOL_VERSION,
  isEduFishOperationName,
  type EduFishOperationName,
} from './constants.js';
import { EduFishPluginError } from './errors.js';
import { abortedError, disposedError, raceWithAbort } from './failures.js';
import { assertTrustedInvocation, resolveRequestId } from './guards.js';
import { EDUFISH_MANIFEST } from './metadata.js';
import {
  OPERATION_SPECS,
  type OperationSpec,
} from './operations.js';
import type {
  EduFishInvocation,
  EduFishOperationDefinition,
  EduFishOperationEvent,
  EduFishPlugin,
  EduFishTransport,
} from './types.js';
import {
  attachOperationContext,
  validateOperationInput,
  validateOperationOutput,
} from './validation.js';

export interface CreateEduFishPluginOptions {
  /** Required transport boundary. Use `createHttpTransport` or inject a test double. */
  readonly transport: EduFishTransport;
  /** Optional millisecond clock, primarily for deterministic event tests. */
  readonly now?: () => number;
}

interface PluginState {
  transport: EduFishTransport;
  now: () => number;
  disposed: boolean;
  readonly activeControllers: Set<AbortController>;
}

function readRequestId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const requestId = (value as { requestId?: unknown }).requestId;
  return typeof requestId === 'string' ? requestId : undefined;
}

function signalIsAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function emitEvent(
  invocation: EduFishInvocation,
  event: EduFishOperationEvent,
): void {
  const sink = invocation.onEvent;
  if (typeof sink !== 'function') return;

  const frozen = Object.freeze(event);
  try {
    const result = sink(frozen);
    if (result !== undefined && typeof result.then === 'function') {
      void result.catch(() => undefined);
    }
  } catch {
    // Observability must never change operation semantics.
  }
}

function eventBase(
  operation: EduFishOperationName,
  requestId: string | undefined,
  sessionId: string,
  timestamp: string,
): Pick<
  EduFishOperationEvent,
  'operation' | 'requestId' | 'sessionId' | 'timestamp'
> {
  return {
    operation,
    requestId: requestId ?? null,
    sessionId,
    timestamp,
  };
}

async function executeOperation(
  spec: OperationSpec,
  rawInput: unknown,
  invocation: EduFishInvocation,
  state: PluginState,
): Promise<unknown> {
  const earlyRequestId = readRequestId(invocation);

  if (state.disposed) {
    throw disposedError(spec.name, earlyRequestId);
  }

  assertTrustedInvocation(invocation);

  const input = validateOperationInput(spec.name, rawInput);
  const requestId = resolveRequestId(spec.name, invocation);

  if (invocation.signal?.aborted === true) {
    throw abortedError(spec.name, requestId);
  }

  const controller = new AbortController();
  state.activeControllers.add(controller);

  let externalAborted = false;
  const onExternalAbort = (): void => {
    externalAborted = true;
    if (!controller.signal.aborted) controller.abort();
  };

  if (invocation.signal !== undefined) {
    invocation.signal.addEventListener('abort', onExternalAbort, {
      once: true,
    });
  }

  const startedAt = state.now();
  emitEvent(invocation, {
    type: 'started',
    ...eventBase(
      spec.name,
      requestId,
      invocation.scope.sessionId,
      new Date(startedAt).toISOString(),
    ),
  });

  try {
    const transportInvocation: EduFishInvocation = {
      scope: {
        userId: invocation.scope.userId,
        sessionId: invocation.scope.sessionId,
      },
      signal: controller.signal,
      ...(requestId === undefined ? {} : { requestId }),
    };

    const pending = Promise.resolve().then(() =>
      state.transport.invoke(spec.name, input, transportInvocation),
    );

    const rawOutput = await raceWithAbort(
      pending,
      controller.signal,
      () =>
        state.disposed
          ? disposedError(spec.name, requestId)
          : abortedError(spec.name, requestId),
    );

    if (state.disposed) {
      throw disposedError(spec.name, requestId);
    }
    if (signalIsAborted(invocation.signal)) {
      throw abortedError(spec.name, requestId);
    }

    const output = validateOperationOutput(spec.name, rawOutput);
    const completedAt = state.now();

    emitEvent(invocation, {
      type: 'completed',
      ...eventBase(
        spec.name,
        requestId,
        invocation.scope.sessionId,
        new Date(completedAt).toISOString(),
      ),
      durationMs: Math.max(0, completedAt - startedAt),
    });

    return output;
  } catch (error) {
    let normalized = attachOperationContext(error, spec.name, requestId);

    if (state.disposed) {
      normalized = disposedError(spec.name, requestId);
    } else if (
      (externalAborted || signalIsAborted(invocation.signal)) &&
      normalized.code !== 'ABORTED'
    ) {
      normalized = abortedError(spec.name, requestId);
    }

    const failedAt = state.now();
    emitEvent(invocation, {
      type: 'failed',
      ...eventBase(
        spec.name,
        requestId,
        invocation.scope.sessionId,
        new Date(failedAt).toISOString(),
      ),
      durationMs: Math.max(0, failedAt - startedAt),
      errorCode: normalized.code,
    });

    throw normalized;
  } finally {
    if (invocation.signal !== undefined) {
      invocation.signal.removeEventListener('abort', onExternalAbort);
    }
    state.activeControllers.delete(controller);
  }
}

function buildOperation(
  spec: OperationSpec,
  state: PluginState,
): EduFishOperationDefinition {
  return Object.freeze({
    name: spec.name,
    description: spec.description,
    input: spec.input,
    output: spec.output,
    mutates: spec.mutates,
    requiresRequestId: spec.requiresRequestId,
    discovery: spec.discovery,
    execute: (input: unknown, invocation: EduFishInvocation) =>
      executeOperation(spec, input, invocation, state),
  });
}

/**
 * Create an isolated EduFish plugin instance.
 *
 * The function performs no registration and has no global side effects. All
 * state (including disposal) belongs to the returned instance.
 */
export function createEduFishPlugin(
  options: CreateEduFishPluginOptions,
): EduFishPlugin {
  if (typeof options !== 'object' || options === null) {
    throw new EduFishPluginError(
      'INVALID_ARGUMENT',
      'createEduFishPlugin requires an options object.',
    );
  }

  const transport = options.transport;
  if (
    typeof transport !== 'object' ||
    transport === null ||
    typeof transport.invoke !== 'function'
  ) {
    throw new EduFishPluginError(
      'INVALID_ARGUMENT',
      'createEduFishPlugin requires a transport with an invoke function.',
    );
  }

  if (options.now !== undefined && typeof options.now !== 'function') {
    throw new EduFishPluginError(
      'INVALID_ARGUMENT',
      'options.now must be a function returning milliseconds.',
    );
  }

  const state: PluginState = {
    transport,
    now: options.now ?? (() => Date.now()),
    disposed: false,
    activeControllers: new Set<AbortController>(),
  };

  const operations = Object.freeze(
    OPERATION_SPECS.map((spec) => buildOperation(spec, state)),
  );

  const operationMap = new Map<EduFishOperationName, EduFishOperationDefinition>(
    operations.map((operation) => [operation.name, operation]),
  );

  const dispose = (): void => {
    if (state.disposed) return;
    state.disposed = true;

    const controllers = [...state.activeControllers];
    state.activeControllers.clear();
    for (const controller of controllers) {
      if (!controller.signal.aborted) controller.abort();
    }

    try {
      state.transport.dispose?.();
    } catch {
      // Domain history is owned by the backend; disposal is best effort here.
    }
  };

  const plugin: EduFishPlugin = {
    id: EDUFISH_PLUGIN_ID,
    version: EDUFISH_PLUGIN_VERSION,
    protocolVersion: EDUFISH_PROTOCOL_VERSION,
    manifest: EDUFISH_MANIFEST,
    operations,
    get disposed(): boolean {
      return state.disposed;
    },
    async invoke(
      operation: string,
      input: unknown,
      invocation: EduFishInvocation,
    ): Promise<unknown> {
      if (state.disposed) {
        throw new EduFishPluginError(
          'DISPOSED',
          'The EduFish plugin has been disposed.',
          { operation, requestId: readRequestId(invocation) },
        );
      }

      if (!isEduFishOperationName(operation)) {
        throw new EduFishPluginError(
          'UNKNOWN_OPERATION',
          `Unknown EduFish operation: ${operation}`,
          { operation },
        );
      }

      const definition = operationMap.get(operation);
      if (definition === undefined) {
        throw new EduFishPluginError(
          'UNKNOWN_OPERATION',
          `Unknown EduFish operation: ${operation}`,
          { operation },
        );
      }

      return definition.execute(input, invocation);
    },
    getOperation(
      name: EduFishOperationName,
    ): EduFishOperationDefinition | undefined {
      return operationMap.get(name);
    },
    dispose,
  };

  // Fail fast if the static operation list ever drifts from the manifest.
  if (operations.length !== EDUFISH_OPERATION_NAMES.length) {
    throw new EduFishPluginError(
      'INVALID_RESPONSE',
      'EduFish plugin operation list is inconsistent with its manifest.',
    );
  }

  return Object.freeze(plugin);
}
