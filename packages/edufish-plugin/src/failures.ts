import type { EduFishOperationName } from './constants.js';
import { EduFishPluginError } from './errors.js';

export function abortedError(
  operation: EduFishOperationName,
  requestId?: string,
): EduFishPluginError {
  return new EduFishPluginError(
    'ABORTED',
    `Operation ${operation} was aborted.`,
    { operation, requestId },
  );
}

export function disposedError(
  operation: EduFishOperationName,
  requestId?: string,
): EduFishPluginError {
  return new EduFishPluginError(
    'DISPOSED',
    'The EduFish plugin or transport has been disposed.',
    { operation, requestId },
  );
}

export function timeoutError(
  operation: EduFishOperationName,
  timeoutMs: number,
  requestId?: string,
): EduFishPluginError {
  return new EduFishPluginError(
    'TIMEOUT',
    `Operation ${operation} timed out after ${timeoutMs} ms.`,
    { operation, requestId, retriable: true },
  );
}

/**
 * Race a promise against an abort signal.
 *
 * The losing promise gets a rejection handler attached so a late transport
 * failure never becomes an unhandled rejection.
 */
export function raceWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  createError: () => EduFishPluginError,
): Promise<T> {
  if (signal.aborted) {
    void promise.catch(() => undefined);
    return Promise.reject(createError());
  }

  return new Promise<T>((resolve, reject) => {
    const cleanup = (): void => {
      signal.removeEventListener('abort', onAbort);
    };

    const onAbort = (): void => {
      cleanup();
      void promise.catch(() => undefined);
      reject(createError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}
