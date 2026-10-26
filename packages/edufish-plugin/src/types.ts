import type { z } from 'zod';

import type {
  EduFishOperationName,
  EDUFISH_PLUGIN_ID,
  EDUFISH_PLUGIN_VERSION,
  EDUFISH_PROTOCOL_VERSION,
} from './constants.js';

/** Trusted caller scope. Never derived from tool arguments or HTTP headers. */
export interface EduFishOperationScope {
  readonly userId: string;
  readonly sessionId: string;
}

export type EduFishEventType = 'started' | 'completed' | 'failed';

export interface EduFishOperationEventBase {
  readonly type: EduFishEventType;
  readonly operation: EduFishOperationName;
  readonly requestId: string | null;
  readonly sessionId: string;
  /** ISO-8601 timestamp supplied by the plugin clock. */
  readonly timestamp: string;
}

export interface EduFishStartedEvent extends EduFishOperationEventBase {
  readonly type: 'started';
}

export interface EduFishCompletedEvent extends EduFishOperationEventBase {
  readonly type: 'completed';
  readonly durationMs: number;
}

export interface EduFishFailedEvent extends EduFishOperationEventBase {
  readonly type: 'failed';
  readonly durationMs: number;
  /** Error code only; messages and arguments are deliberately omitted. */
  readonly errorCode: string;
}

export type EduFishOperationEvent =
  | EduFishStartedEvent
  | EduFishCompletedEvent
  | EduFishFailedEvent;

export type EduFishEventSink = (
  event: EduFishOperationEvent,
) => void | Promise<void>;

/**
 * Trusted invocation supplied by the host.
 *
 * `scope` is the only source of identity. `requestId` is the idempotency key
 * for write operations and is forwarded verbatim on the wire. `onEvent`
 * receives redacted lifecycle events.
 */
export interface EduFishInvocation {
  readonly scope: EduFishOperationScope;
  readonly signal?: AbortSignal;
  readonly requestId?: string;
  readonly onEvent?: EduFishEventSink;
}

/** Transport boundary injected into the plugin. */
export interface EduFishTransport {
  invoke(
    operation: EduFishOperationName,
    args: Readonly<Record<string, unknown>>,
    invocation: EduFishInvocation,
  ): Promise<unknown>;
  dispose?(): void;
}

export type AgentArgumentType = 'string' | 'integer' | 'number' | 'object' | 'array' | 'boolean';

export interface AgentArgumentHint {
  readonly name: string;
  readonly type: AgentArgumentType;
  readonly required: boolean;
  readonly description: string;
  readonly constraints?: string;
}

export interface AgentDiscoveryExample {
  readonly description: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

/**
 * Explicit metadata for host-side agent discovery.
 *
 * The metadata is declarative and JSON-serialisable. It tells a host what the
 * operation does, whether it mutates state, where identity comes from and
 * which limitations must be communicated to a model or user.
 */
export interface AgentDiscoveryMetadata {
  readonly operation: EduFishOperationName;
  readonly title: string;
  readonly summary: string;
  readonly category:
    | 'course'
    | 'material'
    | 'graph'
    | 'quiz'
    | 'progress'
    | 'lab';
  readonly tags: readonly string[];
  readonly mutates: boolean;
  readonly requiresRequestId: boolean;
  readonly idempotency: 'none' | 'request_id';
  readonly identitySource: 'trusted_invocation_scope';
  readonly scopes: readonly string[];
  readonly sideEffects: readonly string[];
  readonly arguments: readonly AgentArgumentHint[];
  readonly returns: string;
  readonly limitations: readonly string[];
  readonly examples: readonly AgentDiscoveryExample[];
}

export interface EduFishManifestOperation {
  readonly name: EduFishOperationName;
  readonly description: string;
  /** Compact JSON-Schema-style input description (not a Zod runtime value). */
  readonly input_schema: Readonly<Record<string, unknown>>;
  readonly mutates: boolean;
  readonly requires_request_id: boolean;
  readonly discovery: AgentDiscoveryMetadata;
}

/** Immutable, JSON-serialisable manifest mirroring the HTTP wire manifest. */
export interface EduFishManifest {
  readonly id: typeof EDUFISH_PLUGIN_ID;
  readonly version: typeof EDUFISH_PLUGIN_VERSION;
  readonly protocol_version: typeof EDUFISH_PROTOCOL_VERSION;
  readonly operations: readonly EduFishManifestOperation[];
}

/**
 * AtomicPlugin-shaped operation definition.
 *
 * `execute` always validates its input at runtime, even though the generic
 * types describe the expected shape.
 */
export interface EduFishOperationDefinition<
  I extends z.ZodTypeAny = z.ZodTypeAny,
  O extends z.ZodTypeAny = z.ZodTypeAny,
> {
  readonly name: EduFishOperationName;
  readonly description: string;
  readonly input: I;
  readonly output: O;
  readonly mutates: boolean;
  readonly requiresRequestId: boolean;
  readonly discovery: AgentDiscoveryMetadata;
  execute(
    input: z.input<I>,
    invocation: EduFishInvocation,
  ): Promise<z.output<O>>;
}

/** AtomicPlugin-shaped plugin returned by `createEduFishPlugin`. */
export interface EduFishPlugin {
  readonly id: typeof EDUFISH_PLUGIN_ID;
  readonly version: typeof EDUFISH_PLUGIN_VERSION;
  readonly protocolVersion: typeof EDUFISH_PROTOCOL_VERSION;
  readonly manifest: EduFishManifest;
  readonly operations: readonly EduFishOperationDefinition[];
  readonly disposed: boolean;
  invoke(
    operation: string,
    input: unknown,
    invocation: EduFishInvocation,
  ): Promise<unknown>;
  getOperation(
    name: EduFishOperationName,
  ): EduFishOperationDefinition | undefined;
  /** Disables future calls, aborts in-flight calls and disposes the transport. */
  dispose(): void;
}
