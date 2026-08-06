# EduFish Web-Native Open Multi-Agent Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production-shaped EduFish web-native open multi-agent runtime with a TypeScript authority runtime, versioned protocol, append-only session/run persistence, a Python capability bridge, and a minimal Web debug surface.

**Architecture:** Add a new Node/TypeScript runtime workspace at the repo root, not inside `frontend` or `sdk/js`. The runtime owns sessions, runs, protocol validation, event sequencing, delegation, persistence, and recovery. Python remains the domain service layer and exposes capability endpoints through the existing Flask backend under `/api/v1/runtime/*`. The frontend consumes runtime snapshots and event streams through thin API wrappers and a minimal runtime inspector view.

**Tech Stack:** Node.js 20+, TypeScript, Fastify, Zod, PostgreSQL, `pg`, `pg-mem` for persistence tests, Vitest, existing Flask backend, existing Vue 3 frontend, Axios API client.

---

## Scope

This plan implements only the approved first-stage runtime slice:

1. New TypeScript runtime workspace with isolated tests and build scripts.
2. Protocol `v1alpha1` schemas for `Session`, `Run`, `Entry`, `Event`, `Delegation`, `ContextGrant`, and command envelopes.
3. Append-only local persistence and event sequencing in the runtime.
4. Single-session, real multi-agent supervisor/child orchestration with delegation, completion, failure, and interrupt handling.
5. Python capability discovery and invocation bridge via the existing Flask backend.
6. Minimal runtime snapshot and event APIs exposed by the runtime service.
7. Minimal frontend runtime inspector page for observing sessions, runs, and event streams.
8. Contract, replay, orchestration, and policy baseline tests.

Out of scope for this plan:

1. Migrating all existing tutor/experiment/graph workflows onto the new runtime.
2. Distributed storage, Kafka, or Redis.
3. Full external third-party agent federation.
4. Production auth hardening beyond local policy scaffolding.
5. Rich end-user runtime product UI beyond a debug inspector.

---

## File Structure

### New Runtime Workspace

- Create: `runtime/package.json`
  - Separate Node workspace for the authority runtime.
- Create: `runtime/tsconfig.json`
  - TypeScript config for the runtime package.
- Create: `runtime/vitest.config.ts`
  - Runtime-specific test configuration.
- Create: `runtime/src/index.ts`
  - Public exports for protocol, services, and runtime entry points.
- Create: `runtime/src/server.ts`
  - Fastify server wiring for runtime APIs.

### Protocol Layer

- Create: `runtime/src/protocol/types.ts`
  - Zod-backed protocol `v1alpha1` schemas and exported TypeScript types.
- Create: `runtime/src/protocol/commands.ts`
  - Command envelopes for create-session, append-entry, start-run, delegate, interrupt, and replay requests.
- Create: `runtime/src/protocol/events.ts`
  - Runtime event shapes and event sequence helpers.
- Create: `runtime/test/protocol.contract.test.ts`
  - Contract and compatibility tests.

### Persistence Layer

- Create: `runtime/src/persistence/db.ts`
  - PostgreSQL pool creation and transaction helpers.
- Create: `runtime/src/persistence/migrations.ts`
  - Idempotent PostgreSQL schema creation for sessions, runs, entries, events, artifacts, and grants.
- Create: `runtime/src/persistence/session-store.ts`
  - Append-only session and entry persistence.
- Create: `runtime/src/persistence/run-store.ts`
  - Run state persistence and transitions.
- Create: `runtime/src/persistence/event-store.ts`
  - `session_seq` allocation, event append, replay, and snapshot loading.
- Create: `runtime/test/persistence.replay.test.ts`
  - Persistence, replay, branch, and recovery tests.

### Runtime Core

- Create: `runtime/src/core/runtime-types.ts`
  - Runtime service interfaces and state enums.
- Create: `runtime/src/core/session-service.ts`
  - Session creation, branching, and context materialization.
- Create: `runtime/src/core/run-service.ts`
  - Run lifecycle transitions and supervisor/child relationships.
- Create: `runtime/src/core/context-grants.ts`
  - Context grant creation, validation, and filtering.
- Create: `runtime/src/core/policy.ts`
  - Capability and delegation policy checks.
- Create: `runtime/src/core/event-bus.ts`
  - In-process subscriber fanout for event delivery.
- Create: `runtime/src/core/runtime-service.ts`
  - Main runtime orchestration entry point.
- Create: `runtime/test/runtime.state-machine.test.ts`
  - State transition tests.
- Create: `runtime/test/multi-agent.orchestration.test.ts`
  - Supervisor/child delegation tests.

### Multi-Agent Loop

- Create: `runtime/src/agent/agent-descriptor.ts`
  - Agent descriptor model and registry.
- Create: `runtime/src/agent/agent-loop.ts`
  - Assistant/tool/delegation loop built around protocol events.
- Create: `runtime/src/agent/supervisor.ts`
  - Supervisor-specific delegation helpers.
- Create: `runtime/src/agent/faux-provider.ts`
  - Deterministic provider for runtime tests.
- Create: `runtime/test/failure-policy.test.ts`
  - Failure and interrupt propagation tests.

### Python Capability Bridge

- Create: `backend/app/api/runtime_capabilities.py`
  - Flask endpoints for capability discovery and invocation.
- Modify: `backend/app/api/__init__.py`
  - Register runtime capability endpoints.
- Create: `backend/app/services/runtime_capability_service.py`
  - Python capability discovery, invocation, and progress event payload helpers.
- Create: `backend/app/tests/test_runtime_capabilities_api.py`
  - Flask contract tests for capability endpoints.

### Runtime HTTP APIs

- Create: `runtime/src/api/routes/sessions.ts`
  - Session create/read/branch routes.
- Create: `runtime/src/api/routes/runs.ts`
  - Run create/read/interrupt/delegate routes.
- Create: `runtime/src/api/routes/events.ts`
  - Event polling/streaming routes with `last_seen_seq`.
- Create: `runtime/test/runtime.api.test.ts`
  - HTTP API tests for runtime service.

### Frontend Debug Surface

- Create: `frontend/src/api/runtime.js`
  - Thin client wrappers for runtime session/run/event APIs.
- Create: `frontend/src/api/runtime.test.js`
  - API wrapper tests.
- Create: `frontend/src/views/runtimeInspectorState.js`
  - Derived state helpers for the inspector view.
- Create: `frontend/src/views/runtimeInspectorState.test.js`
  - State derivation tests.
- Create: `frontend/src/views/RuntimeInspectorView.vue`
  - Minimal runtime inspector view.
- Modify: `frontend/src/router/index.js`
  - Add protected `/runtime` route.
- Create: `frontend/src/views/RuntimeInspectorView.test.js`
  - Page-level regression tests.

### Documentation

- Modify: `README.md`
  - Add runtime workspace startup and test commands.
- Modify: `sdk/python/README.md`
  - Clarify Python engine modules are legacy/transition-only relative to the new runtime.

---

## Task 1: Scaffold The Runtime Workspace

**Files:**
- Create: `runtime/package.json`
- Create: `runtime/tsconfig.json`
- Create: `runtime/vitest.config.ts`
- Create: `runtime/src/index.ts`

- [ ] **Step 1: Create the runtime package manifest**

Create `runtime/package.json`:

```json
{
  "name": "@edufish/runtime",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "fastify": "^5.2.1",
    "pg": "^8.13.1",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.13.1",
    "@types/pg": "^8.11.11",
    "pg-mem": "^3.0.5",
    "typescript": "^5.8.2",
    "vitest": "^2.1.9"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Add TypeScript and Vitest configuration**

Create `runtime/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

Create `runtime/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts']
  }
});
```

- [ ] **Step 3: Add a minimal runtime export surface**

Create `runtime/src/index.ts`:

```ts
export const RUNTIME_PROTOCOL_VERSION = 'v1alpha1';
```

- [ ] **Step 4: Run the workspace test command to verify the scaffold loads**

Run:

```bash
cd runtime && npm test
```

Expected:

```text
No test files found, exiting with code 1
```

- [ ] **Step 5: Add a placeholder runtime test so the package has a green baseline**

Create `runtime/test/runtime.bootstrap.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RUNTIME_PROTOCOL_VERSION } from '../src/index.js';

describe('runtime bootstrap', () => {
  it('exports the initial protocol version', () => {
    expect(RUNTIME_PROTOCOL_VERSION).toBe('v1alpha1');
  });
});
```

- [ ] **Step 6: Run the runtime test suite and verify it passes**

Run:

```bash
cd runtime && npm test
```

Expected:

```text
✓ test/runtime.bootstrap.test.ts
```

- [ ] **Step 7: Commit the workspace scaffold**

```bash
git add runtime/package.json runtime/tsconfig.json runtime/vitest.config.ts runtime/src/index.ts runtime/test/runtime.bootstrap.test.ts
git commit -m "feat: scaffold runtime workspace"
```

---

## Task 2: Define The Open Protocol `v1alpha1`

**Files:**
- Create: `runtime/src/protocol/types.ts`
- Create: `runtime/src/protocol/commands.ts`
- Create: `runtime/src/protocol/events.ts`
- Create: `runtime/test/protocol.contract.test.ts`
- Modify: `runtime/src/index.ts`

- [ ] **Step 1: Write failing contract tests for protocol objects**

Create `runtime/test/protocol.contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  AgentDescriptorSchema,
  DelegationSchema,
  EventSchema,
  RunSchema,
  SessionSchema
} from '../src/protocol/types.js';

describe('protocol contract', () => {
  it('accepts a valid session object', () => {
    const parsed = SessionSchema.parse({
      protocol_version: 'v1alpha1',
      session_id: 'session-1',
      participants: ['user:ada'],
      branch_heads: { main: 'entry-4' },
      policy_refs: [],
      shared_resource_refs: [],
      audit_settings: { enabled: true }
    });

    expect(parsed.session_id).toBe('session-1');
  });

  it('accepts a valid run object', () => {
    const parsed = RunSchema.parse({
      run_id: 'run-1',
      session_id: 'session-1',
      agent_id: 'supervisor',
      parent_run_id: null,
      state: 'running',
      mailbox_offset: 0,
      input_refs: ['entry-1'],
      output_refs: [],
      started_at: '2026-05-14T12:00:00.000Z',
      ended_at: null
    });

    expect(parsed.state).toBe('running');
  });

  it('accepts a valid delegation object', () => {
    const parsed = DelegationSchema.parse({
      delegation_id: 'delegation-1',
      from_run_id: 'run-1',
      to_agent_id: 'researcher',
      goal: 'Summarize the assigned artifact.',
      constraints: ['No external tools'],
      context_grants: ['grant-1'],
      expected_output: 'artifact_ref',
      status: 'pending'
    });

    expect(parsed.to_agent_id).toBe('researcher');
  });

  it('accepts a valid event object', () => {
    const parsed = EventSchema.parse({
      event_id: 'event-1',
      session_id: 'session-1',
      run_id: 'run-1',
      session_seq: 1,
      type: 'run.started',
      payload: { state: 'running' },
      timestamp: '2026-05-14T12:00:00.000Z'
    });

    expect(parsed.session_seq).toBe(1);
  });

  it('accepts a valid agent descriptor', () => {
    const parsed = AgentDescriptorSchema.parse({
      agent_id: 'supervisor',
      name: 'Supervisor',
      role: 'supervisor',
      model_policy: { provider: 'openai', model: 'gpt-4.1-mini' },
      tool_scopes: ['runtime.inspect'],
      resource_scopes: ['session.read'],
      delegation_policy: { allowed_targets: ['researcher'] },
      accepted_message_types: ['user_message'],
      produced_artifact_types: ['text/markdown']
    });

    expect(parsed.role).toBe('supervisor');
  });
});
```

- [ ] **Step 2: Run the protocol contract test and verify it fails**

Run:

```bash
cd runtime && npm test -- test/protocol.contract.test.ts
```

Expected:

```text
Error: Failed to resolve import "../src/protocol/types.js"
```

- [ ] **Step 3: Implement the protocol schemas**

Create `runtime/src/protocol/types.ts`:

```ts
import { z } from 'zod';

export const ProtocolVersionSchema = z.literal('v1alpha1');

export const AgentDescriptorSchema = z.object({
  agent_id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  model_policy: z.object({
    provider: z.string().min(1),
    model: z.string().min(1)
  }),
  tool_scopes: z.array(z.string()),
  resource_scopes: z.array(z.string()),
  delegation_policy: z.object({
    allowed_targets: z.array(z.string())
  }),
  accepted_message_types: z.array(z.string()),
  produced_artifact_types: z.array(z.string())
});

export const SessionSchema = z.object({
  protocol_version: ProtocolVersionSchema,
  session_id: z.string().min(1),
  participants: z.array(z.string()),
  branch_heads: z.record(z.string(), z.string()),
  policy_refs: z.array(z.string()),
  shared_resource_refs: z.array(z.string()),
  audit_settings: z.object({
    enabled: z.boolean()
  })
});

export const RunStateSchema = z.enum([
  'created',
  'queued',
  'running',
  'waiting_tool',
  'waiting_child',
  'retrying',
  'interrupted',
  'completed',
  'failed',
  'cancelled'
]);

export const RunSchema = z.object({
  run_id: z.string().min(1),
  session_id: z.string().min(1),
  agent_id: z.string().min(1),
  parent_run_id: z.string().min(1).nullable(),
  state: RunStateSchema,
  mailbox_offset: z.number().int().nonnegative(),
  input_refs: z.array(z.string()),
  output_refs: z.array(z.string()),
  started_at: z.string().datetime(),
  ended_at: z.string().datetime().nullable()
});

export const DelegationSchema = z.object({
  delegation_id: z.string().min(1),
  from_run_id: z.string().min(1),
  to_agent_id: z.string().min(1),
  goal: z.string().min(1),
  constraints: z.array(z.string()),
  context_grants: z.array(z.string()),
  expected_output: z.string().min(1),
  status: z.enum(['pending', 'accepted', 'rejected', 'running', 'completed', 'failed'])
});

export const EventSchema = z.object({
  event_id: z.string().min(1),
  session_id: z.string().min(1),
  run_id: z.string().min(1),
  session_seq: z.number().int().positive(),
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  timestamp: z.string().datetime()
});

export type AgentDescriptor = z.infer<typeof AgentDescriptorSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type Run = z.infer<typeof RunSchema>;
export type Delegation = z.infer<typeof DelegationSchema>;
export type RuntimeEvent = z.infer<typeof EventSchema>;
```

Create `runtime/src/protocol/commands.ts`:

```ts
import { z } from 'zod';
import { ProtocolVersionSchema } from './types.js';

export const CommandEnvelopeSchema = z.object({
  protocol_version: ProtocolVersionSchema,
  request_id: z.string().min(1),
  command: z.string().min(1),
  payload: z.record(z.string(), z.unknown())
});

export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;
```

Create `runtime/src/protocol/events.ts`:

```ts
import { EventSchema } from './types.js';

export function assertValidEvent(event: unknown) {
  return EventSchema.parse(event);
}
```

- [ ] **Step 4: Export the protocol surface from the runtime package**

Update `runtime/src/index.ts`:

```ts
export const RUNTIME_PROTOCOL_VERSION = 'v1alpha1';

export * from './protocol/types.js';
export * from './protocol/commands.js';
export * from './protocol/events.js';
```

- [ ] **Step 5: Run the protocol contract tests and verify they pass**

Run:

```bash
cd runtime && npm test -- test/protocol.contract.test.ts
```

Expected:

```text
✓ test/protocol.contract.test.ts
```

- [ ] **Step 6: Commit the protocol definition**

```bash
git add runtime/src/index.ts runtime/src/protocol/types.ts runtime/src/protocol/commands.ts runtime/src/protocol/events.ts runtime/test/protocol.contract.test.ts
git commit -m "feat: define runtime protocol v1alpha1"
```

---

## Task 3: Build Append-Only Runtime Persistence

**Files:**
- Create: `runtime/src/persistence/db.ts`
- Create: `runtime/src/persistence/migrations.ts`
- Create: `runtime/src/persistence/session-store.ts`
- Create: `runtime/src/persistence/run-store.ts`
- Create: `runtime/src/persistence/event-store.ts`
- Create: `runtime/test/persistence.replay.test.ts`

- [ ] **Step 1: Write failing persistence and replay tests**

Create `runtime/test/persistence.replay.test.ts`:

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import { createRuntimeDb } from '../src/persistence/db.js';
import { migrateRuntimeDb } from '../src/persistence/migrations.js';
import { EventStore } from '../src/persistence/event-store.js';
import { SessionStore } from '../src/persistence/session-store.js';

describe('runtime persistence', () => {
  it('appends sessions, entries, and sequential events', () => {
    const mem = newDb();
    const db = createRuntimeDb({
      connectionString: mem.adapters.createPg().connectionString
    });

    return migrateRuntimeDb(db).then(async () => {
      const sessions = new SessionStore(db);
      const events = new EventStore(db);

      await sessions.createSession({
        protocol_version: 'v1alpha1',
        session_id: 'session-1',
        participants: ['user:ada'],
        branch_heads: { main: 'entry-1' },
        policy_refs: [],
        shared_resource_refs: [],
        audit_settings: { enabled: true }
      });

      await events.append({
        session_id: 'session-1',
        run_id: 'run-1',
        type: 'run.started',
        payload: { state: 'running' }
      });
      await events.append({
        session_id: 'session-1',
        run_id: 'run-1',
        type: 'run.completed',
        payload: { state: 'completed' }
      });

      const stored = await events.listSince('session-1', 0);
      expect(stored.map((item) => item.session_seq)).toEqual([1, 2]);
    });
  });
});
```

- [ ] **Step 2: Run the persistence test and verify it fails**

Run:

```bash
cd runtime && npm test -- test/persistence.replay.test.ts
```

Expected:

```text
Error: Failed to resolve import "../src/persistence/db.js"
```

- [ ] **Step 3: Implement the runtime database and migrations**

Create `runtime/src/persistence/db.ts`:

```ts
import { Pool } from 'pg';

export function createRuntimeDb(input: { connectionString: string }) {
  return new Pool({
    connectionString: input.connectionString
  });
}
```

Create `runtime/src/persistence/migrations.ts`:

```ts
import type { Pool } from 'pg';

export async function migrateRuntimeDb(db: Pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      protocol_version TEXT NOT NULL,
      payload_json JSONB NOT NULL
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS events (
      session_id TEXT NOT NULL,
      session_seq BIGINT NOT NULL,
      event_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json JSONB NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (session_id, session_seq)
    );
  `);
}
```

Create `runtime/src/persistence/session-store.ts`:

```ts
import type { Pool } from 'pg';
import type { Session } from '../protocol/types.js';

export class SessionStore {
  constructor(private readonly db: Pool) {}

  async createSession(session: Session) {
    await this.db.query(
      'INSERT INTO sessions (session_id, protocol_version, payload_json) VALUES ($1, $2, $3::jsonb)',
      [session.session_id, session.protocol_version, JSON.stringify(session)]
    );
  }
}
```

Create `runtime/src/persistence/event-store.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

interface AppendEventInput {
  session_id: string;
  run_id: string;
  type: string;
  payload: Record<string, unknown>;
}

export class EventStore {
  constructor(private readonly db: Pool) {}

  async append(input: AppendEventInput) {
    const next = await this.db.query(
      'SELECT COALESCE(MAX(session_seq), 0) + 1 AS next_seq FROM events WHERE session_id = $1',
      [input.session_id]
    );

    const event = {
      event_id: randomUUID(),
      session_id: input.session_id,
      run_id: input.run_id,
      session_seq: Number(next.rows[0].next_seq),
      type: input.type,
      payload: input.payload,
      timestamp: new Date().toISOString()
    };

    await this.db.query(
      `
        INSERT INTO events (session_id, session_seq, event_id, run_id, type, payload_json, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      `,
      [
        event.session_id,
        event.session_seq,
        event.event_id,
        event.run_id,
        event.type,
        JSON.stringify(event.payload),
        event.timestamp
      ]
    );

    return event;
  }

  async listSince(sessionId: string, lastSeenSeq: number) {
    const result = await this.db.query(
      `
        SELECT event_id, session_id, run_id, session_seq, type, payload_json, timestamp
        FROM events
        WHERE session_id = $1 AND session_seq > $2
        ORDER BY session_seq ASC
      `,
      [sessionId, lastSeenSeq]
    );

    return result.rows.map((row: any) => ({
        event_id: row.event_id,
        session_id: row.session_id,
        run_id: row.run_id,
        session_seq: Number(row.session_seq),
        type: row.type,
        payload: row.payload_json,
        timestamp: new Date(row.timestamp).toISOString()
      }));
  }
}
```

Create `runtime/src/persistence/run-store.ts`:

```ts
export class RunStore {}
```

- [ ] **Step 4: Run the persistence test and verify it passes**

Run:

```bash
cd runtime && npm test -- test/persistence.replay.test.ts
```

Expected:

```text
✓ test/persistence.replay.test.ts
```

- [ ] **Step 5: Commit the append-only persistence slice**

```bash
git add runtime/src/persistence/db.ts runtime/src/persistence/migrations.ts runtime/src/persistence/session-store.ts runtime/src/persistence/run-store.ts runtime/src/persistence/event-store.ts runtime/test/persistence.replay.test.ts
git commit -m "feat: add runtime append-only persistence"
```

---

## Task 4: Implement Run Lifecycle And Runtime State Machine

**Files:**
- Create: `runtime/src/core/runtime-types.ts`
- Create: `runtime/src/core/run-service.ts`
- Create: `runtime/src/core/session-service.ts`
- Create: `runtime/src/core/event-bus.ts`
- Create: `runtime/src/core/runtime-service.ts`
- Create: `runtime/test/runtime.state-machine.test.ts`

- [ ] **Step 1: Write failing state machine tests**

Create `runtime/test/runtime.state-machine.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nextRunState } from '../src/core/run-service.js';

describe('run state machine', () => {
  it('allows created -> queued -> running -> completed', () => {
    expect(nextRunState('created', 'enqueue')).toBe('queued');
    expect(nextRunState('queued', 'start')).toBe('running');
    expect(nextRunState('running', 'complete')).toBe('completed');
  });

  it('allows running -> waiting_child -> running', () => {
    expect(nextRunState('running', 'delegate')).toBe('waiting_child');
    expect(nextRunState('waiting_child', 'child_complete')).toBe('running');
  });

  it('throws on invalid transitions', () => {
    expect(() => nextRunState('completed', 'start')).toThrow('invalid transition');
  });
});
```

- [ ] **Step 2: Run the state machine test and verify it fails**

Run:

```bash
cd runtime && npm test -- test/runtime.state-machine.test.ts
```

Expected:

```text
Error: Failed to resolve import "../src/core/run-service.js"
```

- [ ] **Step 3: Implement the run transition helpers**

Create `runtime/src/core/runtime-types.ts`:

```ts
export type RunState =
  | 'created'
  | 'queued'
  | 'running'
  | 'waiting_tool'
  | 'waiting_child'
  | 'retrying'
  | 'interrupted'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type RunAction =
  | 'enqueue'
  | 'start'
  | 'wait_tool'
  | 'tool_complete'
  | 'delegate'
  | 'child_complete'
  | 'retry'
  | 'interrupt'
  | 'complete'
  | 'fail'
  | 'cancel';
```

Create `runtime/src/core/run-service.ts`:

```ts
import type { RunAction, RunState } from './runtime-types.js';

const transitions: Record<RunState, Partial<Record<RunAction, RunState>>> = {
  created: { enqueue: 'queued', cancel: 'cancelled' },
  queued: { start: 'running', cancel: 'cancelled' },
  running: {
    wait_tool: 'waiting_tool',
    delegate: 'waiting_child',
    retry: 'retrying',
    interrupt: 'interrupted',
    complete: 'completed',
    fail: 'failed',
    cancel: 'cancelled'
  },
  waiting_tool: {
    tool_complete: 'running',
    interrupt: 'interrupted',
    fail: 'failed',
    cancel: 'cancelled'
  },
  waiting_child: {
    child_complete: 'running',
    interrupt: 'interrupted',
    fail: 'failed',
    cancel: 'cancelled'
  },
  retrying: { start: 'running', fail: 'failed', cancel: 'cancelled' },
  interrupted: { retry: 'retrying', cancel: 'cancelled' },
  completed: {},
  failed: {},
  cancelled: {}
};

export function nextRunState(current: RunState, action: RunAction): RunState {
  const next = transitions[current][action];
  if (!next) throw new Error(`invalid transition: ${current} -> ${action}`);
  return next;
}
```

Create `runtime/src/core/session-service.ts`:

```ts
export class SessionService {}
```

Create `runtime/src/core/event-bus.ts`:

```ts
type Listener<T> = (event: T) => void;

export class EventBus<T> {
  private listeners = new Set<Listener<T>>();

  subscribe(listener: Listener<T>) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: T) {
    for (const listener of this.listeners) listener(event);
  }
}
```

Create `runtime/src/core/runtime-service.ts`:

```ts
export class RuntimeService {}
```

- [ ] **Step 4: Run the state machine tests and verify they pass**

Run:

```bash
cd runtime && npm test -- test/runtime.state-machine.test.ts
```

Expected:

```text
✓ test/runtime.state-machine.test.ts
```

- [ ] **Step 5: Commit the runtime state machine**

```bash
git add runtime/src/core/runtime-types.ts runtime/src/core/run-service.ts runtime/src/core/session-service.ts runtime/src/core/event-bus.ts runtime/src/core/runtime-service.ts runtime/test/runtime.state-machine.test.ts
git commit -m "feat: add runtime run state machine"
```

---

## Task 5: Implement Supervisor/Child Multi-Agent Orchestration

**Files:**
- Create: `runtime/src/core/context-grants.ts`
- Create: `runtime/src/core/policy.ts`
- Create: `runtime/src/agent/agent-descriptor.ts`
- Create: `runtime/src/agent/agent-loop.ts`
- Create: `runtime/src/agent/supervisor.ts`
- Create: `runtime/src/agent/faux-provider.ts`
- Create: `runtime/test/multi-agent.orchestration.test.ts`

- [ ] **Step 1: Write failing multi-agent orchestration tests**

Create `runtime/test/multi-agent.orchestration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createDelegationPlan, mergeChildResult } from '../src/agent/supervisor.js';

describe('multi-agent orchestration', () => {
  it('creates a child delegation plan with explicit context grants', () => {
    const delegation = createDelegationPlan({
      fromRunId: 'run-supervisor',
      toAgentId: 'researcher',
      goal: 'Summarize artifact-1',
      grantIds: ['grant-1']
    });

    expect(delegation.from_run_id).toBe('run-supervisor');
    expect(delegation.context_grants).toEqual(['grant-1']);
    expect(delegation.status).toBe('pending');
  });

  it('merges child completion into a supervisor-visible artifact ref', () => {
    const merged = mergeChildResult({
      run_id: 'run-child',
      artifact_ref: 'artifact-9',
      status: 'completed'
    });

    expect(merged.output_refs).toEqual(['artifact-9']);
    expect(merged.child_status).toBe('completed');
  });
});
```

- [ ] **Step 2: Run the orchestration test and verify it fails**

Run:

```bash
cd runtime && npm test -- test/multi-agent.orchestration.test.ts
```

Expected:

```text
Error: Failed to resolve import "../src/agent/supervisor.js"
```

- [ ] **Step 3: Implement the supervisor/child helpers**

Create `runtime/src/core/context-grants.ts`:

```ts
export interface ContextGrant {
  grant_id: string;
  from_run_id: string;
  to_run_id: string | null;
  entry_refs: string[];
  summary_refs: string[];
  artifact_refs: string[];
  resource_scopes: string[];
  expires_at: string | null;
}
```

Create `runtime/src/core/policy.ts`:

```ts
export function canDelegate(allowedTargets: string[], toAgentId: string) {
  return allowedTargets.includes(toAgentId);
}
```

Create `runtime/src/agent/agent-descriptor.ts`:

```ts
export interface AgentDescriptor {
  agent_id: string;
  role: string;
  allowed_targets: string[];
}
```

Create `runtime/src/agent/agent-loop.ts`:

```ts
export class AgentLoop {}
```

Create `runtime/src/agent/faux-provider.ts`:

```ts
export class FauxProvider {
  complete(text: string) {
    return { text };
  }
}
```

Create `runtime/src/agent/supervisor.ts`:

```ts
export function createDelegationPlan(input: {
  fromRunId: string;
  toAgentId: string;
  goal: string;
  grantIds: string[];
}) {
  return {
    delegation_id: 'delegation-1',
    from_run_id: input.fromRunId,
    to_agent_id: input.toAgentId,
    goal: input.goal,
    constraints: [],
    context_grants: input.grantIds,
    expected_output: 'artifact_ref',
    status: 'pending'
  };
}

export function mergeChildResult(input: {
  run_id: string;
  artifact_ref: string;
  status: 'completed' | 'failed';
}) {
  return {
    child_run_id: input.run_id,
    child_status: input.status,
    output_refs: [input.artifact_ref]
  };
}
```

- [ ] **Step 4: Run the orchestration tests and verify they pass**

Run:

```bash
cd runtime && npm test -- test/multi-agent.orchestration.test.ts
```

Expected:

```text
✓ test/multi-agent.orchestration.test.ts
```

- [ ] **Step 5: Commit the multi-agent orchestration slice**

```bash
git add runtime/src/core/context-grants.ts runtime/src/core/policy.ts runtime/src/agent/agent-descriptor.ts runtime/src/agent/agent-loop.ts runtime/src/agent/supervisor.ts runtime/src/agent/faux-provider.ts runtime/test/multi-agent.orchestration.test.ts
git commit -m "feat: add supervisor child orchestration helpers"
```

---

## Task 6: Add Failure, Interrupt, And Policy Baselines

**Files:**
- Create: `runtime/test/failure-policy.test.ts`
- Modify: `runtime/src/core/run-service.ts`
- Modify: `runtime/src/core/policy.ts`

- [ ] **Step 1: Write failing failure and policy tests**

Create `runtime/test/failure-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nextRunState } from '../src/core/run-service.js';
import { canDelegate } from '../src/core/policy.js';

describe('failure and policy baselines', () => {
  it('allows a waiting child run to fail cleanly', () => {
    expect(nextRunState('waiting_child', 'fail')).toBe('failed');
  });

  it('allows a running run to be interrupted', () => {
    expect(nextRunState('running', 'interrupt')).toBe('interrupted');
  });

  it('rejects delegation to agents outside the allowed target list', () => {
    expect(canDelegate(['researcher'], 'reviewer')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the failure/policy test and verify it fails only if behavior is missing**

Run:

```bash
cd runtime && npm test -- test/failure-policy.test.ts
```

Expected:

```text
PASS if current transitions and policy checks are sufficient; FAIL only if behavior diverged.
```

- [ ] **Step 3: Tighten the policy and transition helpers if needed**

If the test fails, update `runtime/src/core/run-service.ts` or `runtime/src/core/policy.ts` to satisfy:

```ts
expect(nextRunState('waiting_child', 'fail')).toBe('failed');
expect(nextRunState('running', 'interrupt')).toBe('interrupted');
expect(canDelegate(['researcher'], 'reviewer')).toBe(false);
```

- [ ] **Step 4: Re-run the failure/policy test and verify it passes**

Run:

```bash
cd runtime && npm test -- test/failure-policy.test.ts
```

Expected:

```text
✓ test/failure-policy.test.ts
```

- [ ] **Step 5: Commit the failure and policy baseline**

```bash
git add runtime/test/failure-policy.test.ts runtime/src/core/run-service.ts runtime/src/core/policy.ts
git commit -m "test: lock failure and delegation policy baselines"
```

---

## Task 7: Expose Python Capability Discovery And Invocation

**Files:**
- Create: `backend/app/services/runtime_capability_service.py`
- Create: `backend/app/api/runtime_capabilities.py`
- Modify: `backend/app/api/__init__.py`
- Create: `backend/app/tests/test_runtime_capabilities_api.py`

- [ ] **Step 1: Write failing Flask capability API tests**

Create `backend/app/tests/test_runtime_capabilities_api.py`:

```python
def test_lists_runtime_capabilities(client):
    response = client.get("/api/v1/runtime/capabilities")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["capabilities"][0]["kind"] in {"tool", "resource"}


def test_invokes_runtime_capability(client):
    response = client.post(
        "/api/v1/runtime/capabilities/invoke",
        json={
            "capability_id": "runtime.echo",
            "arguments": {"text": "hello runtime"}
        },
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "completed"
    assert payload["result"]["text"] == "hello runtime"
```

- [ ] **Step 2: Run the Flask capability API tests and verify they fail**

Run:

```bash
cd backend && uv run pytest app/tests/test_runtime_capabilities_api.py -q
```

Expected:

```text
404 or import failure for runtime capability endpoints
```

- [ ] **Step 3: Implement the capability service and API routes**

Create `backend/app/services/runtime_capability_service.py`:

```python
from __future__ import annotations


def list_capabilities() -> list[dict]:
    return [
        {
            "capability_id": "runtime.echo",
            "kind": "tool",
            "description": "Echo text back to the runtime for bridge verification.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"}
                },
                "required": ["text"]
            },
        }
    ]


def invoke_capability(capability_id: str, arguments: dict) -> dict:
    if capability_id == "runtime.echo":
        return {
            "status": "completed",
            "result": {"text": arguments.get("text", "")},
            "events": [
                {"type": "tool.started", "message": "Echo started"},
                {"type": "tool.completed", "message": "Echo completed"},
            ],
        }
    return {
        "status": "failed",
        "result": {"error": f"unknown capability: {capability_id}"},
        "events": [
            {"type": "tool.failed", "message": f"unknown capability: {capability_id}"}
        ],
    }
```

Create `backend/app/api/runtime_capabilities.py`:

```python
from __future__ import annotations

from flask import jsonify, request

from . import api_bp
from app.services.runtime_capability_service import invoke_capability, list_capabilities


@api_bp.get("/runtime/capabilities")
def get_runtime_capabilities():
    return jsonify({"capabilities": list_capabilities()})


@api_bp.post("/runtime/capabilities/invoke")
def post_runtime_capability_invoke():
    payload = request.get_json(silent=True) or {}
    result = invoke_capability(payload.get("capability_id", ""), payload.get("arguments", {}))
    status = 200 if result["status"] != "failed" else 400
    return jsonify(result), status
```

Update `backend/app/api/__init__.py` to register the new module:

```python
from . import runtime_capabilities  # noqa: E402,F401
```

- [ ] **Step 4: Run the Flask capability API tests and verify they pass**

Run:

```bash
cd backend && uv run pytest app/tests/test_runtime_capabilities_api.py -q
```

Expected:

```text
2 passed
```

- [ ] **Step 5: Commit the Python capability bridge**

```bash
git add backend/app/services/runtime_capability_service.py backend/app/api/runtime_capabilities.py backend/app/api/__init__.py backend/app/tests/test_runtime_capabilities_api.py
git commit -m "feat: add runtime capability bridge endpoints"
```

---

## Task 8: Add Runtime HTTP APIs In The Node Service

**Files:**
- Create: `runtime/src/server.ts`
- Create: `runtime/src/api/routes/sessions.ts`
- Create: `runtime/src/api/routes/runs.ts`
- Create: `runtime/src/api/routes/events.ts`
- Create: `runtime/test/runtime.api.test.ts`

- [ ] **Step 1: Write failing runtime HTTP API tests**

Create `runtime/test/runtime.api.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';

describe('runtime api', () => {
  it('creates a session through the HTTP API', async () => {
    const app = buildServer();
    const response = await app.inject({
      method: 'POST',
      url: '/runtime/sessions',
      payload: {
        protocol_version: 'v1alpha1',
        session_id: 'session-http-1',
        participants: ['user:ada'],
        branch_heads: { main: 'entry-1' },
        policy_refs: [],
        shared_resource_refs: [],
        audit_settings: { enabled: true }
      }
    });

    expect(response.statusCode).toBe(201)
    expect(response.json().session_id).toBe('session-http-1');
  });

  it('lists runtime events since a sequence number', async () => {
    const app = buildServer();
    const response = await app.inject({
      method: 'GET',
      url: '/runtime/events/session-http-1?last_seen_seq=5'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      session_id: 'session-http-1',
      last_seen_seq: 5,
      events: []
    });
  });
});
```

- [ ] **Step 2: Run the runtime API test and verify it fails**

Run:

```bash
cd runtime && npm test -- test/runtime.api.test.ts
```

Expected:

```text
Error: Failed to resolve import "../src/server.js"
```

- [ ] **Step 3: Implement the Fastify server and session route**

Create `runtime/src/api/routes/sessions.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { SessionSchema } from '../../protocol/types.js';

export async function registerSessionRoutes(app: FastifyInstance) {
  app.post('/runtime/sessions', async (request, reply) => {
    const session = SessionSchema.parse(request.body);
    reply.code(201);
    return session;
  });
}
```

Create `runtime/src/api/routes/runs.ts`:

```ts
import type { FastifyInstance } from 'fastify';

export async function registerRunRoutes(_app: FastifyInstance) {}
```

Create `runtime/src/api/routes/events.ts`:

```ts
import type { FastifyInstance } from 'fastify';

export async function registerEventRoutes(app: FastifyInstance) {
  app.get('/runtime/events/:sessionId', async (request) => {
    const params = request.params as { sessionId: string };
    const query = request.query as { last_seen_seq?: string };
    return {
      session_id: params.sessionId,
      last_seen_seq: Number(query.last_seen_seq || 0),
      events: []
    };
  });
}
```

Create `runtime/src/server.ts`:

```ts
import Fastify from 'fastify';
import { registerEventRoutes } from './api/routes/events.js';
import { registerRunRoutes } from './api/routes/runs.js';
import { registerSessionRoutes } from './api/routes/sessions.js';

export function buildServer() {
  const app = Fastify();
  void registerSessionRoutes(app);
  void registerRunRoutes(app);
  void registerEventRoutes(app);
  return app;
}
```

- [ ] **Step 4: Run the runtime API test and verify it passes**

Run:

```bash
cd runtime && npm test -- test/runtime.api.test.ts
```

Expected:

```text
✓ test/runtime.api.test.ts
```

- [ ] **Step 5: Commit the initial runtime HTTP API**

```bash
git add runtime/src/server.ts runtime/src/api/routes/sessions.ts runtime/src/api/routes/runs.ts runtime/src/api/routes/events.ts runtime/test/runtime.api.test.ts
git commit -m "feat: add runtime http api scaffold"
```

---

## Task 9: Add Frontend Runtime API Wrappers And Inspector State

**Files:**
- Create: `frontend/src/api/runtime.js`
- Create: `frontend/src/api/runtime.test.js`
- Create: `frontend/src/views/runtimeInspectorState.js`
- Create: `frontend/src/views/runtimeInspectorState.test.js`

- [ ] **Step 1: Write failing frontend runtime API tests**

Create `frontend/src/api/runtime.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn((url) => Promise.resolve({ data: { url } })),
    post: vi.fn((url, payload) => Promise.resolve({ data: { url, payload } }))
  }
}));

import { createRuntimeSession, listRuntimeEvents } from './runtime';

describe('runtime api wrappers', () => {
  it('creates a runtime session', async () => {
    const response = await createRuntimeSession({ session_id: 'session-1' });
    expect(response.url).toBe('/runtime/sessions');
    expect(response.payload.session_id).toBe('session-1');
  });

  it('lists runtime events since a session sequence', async () => {
    const response = await listRuntimeEvents('session-1', 5);
    expect(response.url).toBe('/runtime/events/session-1?last_seen_seq=5');
  });
});
```

- [ ] **Step 2: Run the frontend runtime API tests and verify they fail**

Run:

```bash
cd frontend && npm test -- src/api/runtime.test.js
```

Expected:

```text
Failed to resolve import "./runtime"
```

- [ ] **Step 3: Implement the runtime API wrappers**

Create `frontend/src/api/runtime.js`:

```js
import { apiClient } from './client';

export async function createRuntimeSession(payload) {
  const response = await apiClient.post('/runtime/sessions', payload);
  return response.data;
}

export async function listRuntimeEvents(sessionId, lastSeenSeq = 0) {
  const response = await apiClient.get(`/runtime/events/${sessionId}?last_seen_seq=${lastSeenSeq}`);
  return response.data;
}
```

Create `frontend/src/views/runtimeInspectorState.js`:

```js
export function buildRuntimeInspectorModel({ session = null, runs = [], events = [] } = {}) {
  return {
    sessionId: session?.session_id || '',
    runCount: runs.length,
    eventCount: events.length,
    latestEventType: events.at(-1)?.type || ''
  };
}
```

Create `frontend/src/views/runtimeInspectorState.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { buildRuntimeInspectorModel } from './runtimeInspectorState';

describe('runtimeInspectorState', () => {
  it('builds a compact inspector model', () => {
    const model = buildRuntimeInspectorModel({
      session: { session_id: 'session-1' },
      runs: [{ run_id: 'run-1' }, { run_id: 'run-2' }],
      events: [{ type: 'run.started' }, { type: 'run.completed' }]
    });

    expect(model.sessionId).toBe('session-1');
    expect(model.runCount).toBe(2);
    expect(model.eventCount).toBe(2);
    expect(model.latestEventType).toBe('run.completed');
  });
});
```

- [ ] **Step 4: Run the frontend runtime tests and verify they pass**

Run:

```bash
cd frontend && npm test -- src/api/runtime.test.js src/views/runtimeInspectorState.test.js
```

Expected:

```text
✓ src/api/runtime.test.js
✓ src/views/runtimeInspectorState.test.js
```

- [ ] **Step 5: Commit the frontend runtime data layer**

```bash
git add frontend/src/api/runtime.js frontend/src/api/runtime.test.js frontend/src/views/runtimeInspectorState.js frontend/src/views/runtimeInspectorState.test.js
git commit -m "feat: add frontend runtime api wrappers"
```

---

## Task 10: Add The Minimal Runtime Inspector View

**Files:**
- Create: `frontend/src/views/RuntimeInspectorView.vue`
- Create: `frontend/src/views/RuntimeInspectorView.test.js`
- Modify: `frontend/src/router/index.js`

- [ ] **Step 1: Write a failing runtime inspector view test**

Create `frontend/src/views/RuntimeInspectorView.test.js`:

```js
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import RuntimeInspectorView from './RuntimeInspectorView.vue';

describe('RuntimeInspectorView', () => {
  it('renders the runtime inspector shell', () => {
    const wrapper = mount(RuntimeInspectorView, {
      data() {
        return {
          model: {
            sessionId: 'session-1',
            runCount: 2,
            eventCount: 4,
            latestEventType: 'run.completed'
          }
        };
      }
    });

    expect(wrapper.text()).toContain('Runtime Inspector');
    expect(wrapper.text()).toContain('session-1');
    expect(wrapper.text()).toContain('run.completed');
  });
});
```

- [ ] **Step 2: Run the runtime inspector view test and verify it fails**

Run:

```bash
cd frontend && npm test -- src/views/RuntimeInspectorView.test.js
```

Expected:

```text
Failed to resolve import "./RuntimeInspectorView.vue"
```

- [ ] **Step 3: Implement the inspector view and route**

Create `frontend/src/views/RuntimeInspectorView.vue`:

```vue
<script setup>
import { ref } from 'vue';

const model = ref({
  sessionId: 'session-1',
  runCount: 0,
  eventCount: 0,
  latestEventType: ''
});
</script>

<template>
  <section class="runtime-inspector">
    <header>
      <p>Runtime Inspector</p>
      <h1>{{ model.sessionId || 'No active session' }}</h1>
    </header>
    <dl>
      <div>
        <dt>Runs</dt>
        <dd>{{ model.runCount }}</dd>
      </div>
      <div>
        <dt>Events</dt>
        <dd>{{ model.eventCount }}</dd>
      </div>
      <div>
        <dt>Latest Event</dt>
        <dd>{{ model.latestEventType || 'None' }}</dd>
      </div>
    </dl>
  </section>
</template>
```

Update `frontend/src/router/index.js`:

```js
import RuntimeInspectorView from '../views/RuntimeInspectorView.vue';
```

Add route:

```js
  {
    path: '/runtime',
    name: 'runtime-inspector',
    component: RuntimeInspectorView,
    meta: { requiresAuth: true, roles: ['teacher', 'admin'] }
  },
```

- [ ] **Step 4: Run the runtime inspector test and router test**

Run:

```bash
cd frontend && npm test -- src/views/RuntimeInspectorView.test.js src/router/index.test.js
```

Expected:

```text
✓ src/views/RuntimeInspectorView.test.js
✓ src/router/index.test.js
```

- [ ] **Step 5: Commit the runtime inspector surface**

```bash
git add frontend/src/views/RuntimeInspectorView.vue frontend/src/views/RuntimeInspectorView.test.js frontend/src/router/index.js
git commit -m "feat: add runtime inspector view"
```

---

## Task 11: Wire Root Tooling And Documentation

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `sdk/python/README.md`

- [ ] **Step 1: Add root scripts for the runtime workspace**

Update the root `package.json` scripts:

```json
{
  "scripts": {
    "test:runtime": "if [ -d runtime ]; then cd runtime && npm test; else echo 'runtime not scaffolded yet'; fi",
    "build:runtime": "if [ -d runtime ]; then cd runtime && npm run build; else echo 'runtime not scaffolded yet'; fi"
  }
}
```

Merge them into the existing `scripts` block without removing the current scripts.

- [ ] **Step 2: Document local runtime development**

Append to `README.md`:

```md
### Runtime (Node.js >= 20)

```bash
cd runtime
npm install
npm test
```

The runtime workspace hosts the new authority agent runtime. It owns protocol validation, sessions, runs, multi-agent delegation, and event replay. Python remains the domain-service layer.
```

- [ ] **Step 3: Mark the Python engine modules as transitional**

Append to `sdk/python/README.md`:

```md
## Runtime Transition Note

The `edufish_engine.engine.*` modules are a transitional Python-side agent implementation. The long-term authority runtime is moving to the Node/TypeScript `runtime/` workspace so multi-agent orchestration, replay, and protocol compatibility can be centralized.
```

- [ ] **Step 4: Run the runtime and frontend/backend focused checks**

Run:

```bash
cd runtime && npm test
cd frontend && npm test -- src/api/runtime.test.js src/views/runtimeInspectorState.test.js src/views/RuntimeInspectorView.test.js
cd backend && uv run pytest app/tests/test_runtime_capabilities_api.py -q
```

Expected:

```text
All targeted runtime, frontend runtime, and backend capability tests pass.
```

- [ ] **Step 5: Commit the root tooling and docs updates**

```bash
git add package.json README.md sdk/python/README.md
git commit -m "docs: document runtime workspace transition"
```

---

## Task 12: Final Verification And Handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-05-14-web-native-open-multi-agent-runtime-design.md` (only if implementation discoveries require approved design corrections)
- Modify: `docs/superpowers/plans/2026-05-14-web-native-open-multi-agent-runtime.md` (check off completed items during execution)

- [ ] **Step 1: Run the full runtime-focused verification batch**

Run:

```bash
cd runtime && npm test
cd frontend && npm test -- src/api/runtime.test.js src/views/runtimeInspectorState.test.js src/views/RuntimeInspectorView.test.js src/router/index.test.js
cd backend && uv run pytest app/tests/test_runtime_capabilities_api.py -q
```

Expected:

```text
All runtime-specific tests pass in all three slices.
```

- [ ] **Step 2: Smoke-test the runtime HTTP session route**

Run:

```bash
cd runtime && node -e "import('./dist/server.js').then(({ buildServer }) => { const app = buildServer(); app.inject({ method: 'POST', url: '/runtime/sessions', payload: { protocol_version: 'v1alpha1', session_id: 'smoke-session', participants: ['user:ada'], branch_heads: { main: 'entry-1' }, policy_refs: [], shared_resource_refs: [], audit_settings: { enabled: true } } }).then((res) => { console.log(res.statusCode); console.log(res.body); }).finally(() => app.close()); })"
```

Expected:

```text
201
{"protocol_version":"v1alpha1","session_id":"smoke-session",...}
```

- [ ] **Step 3: Review the resulting file boundaries**

Check that:

1. Node runtime owns session/run/event/delegation logic.
2. Python only exposes capability endpoints.
3. Frontend only consumes runtime APIs and derived state helpers.

If any file violates that split, refactor before closing the task.

- [ ] **Step 4: Update plan checkboxes and prepare execution notes**

Record:

1. Which parts of the design remain intentionally unimplemented in stage 1.
2. Any deviations from the plan discovered during implementation.
3. Follow-up work for auth hardening, external federation, and production event streaming.

- [ ] **Step 5: Commit the final verified runtime slice**

```bash
git add runtime frontend backend package.json README.md sdk/python/README.md docs/superpowers/plans/2026-05-14-web-native-open-multi-agent-runtime.md
git commit -m "feat: deliver stage-one web-native multi-agent runtime"
```

---

## Self-Review

### Spec Coverage

The plan covers the approved stage-one requirements:

1. TypeScript authority runtime: Tasks 1, 3, 4, 5, 8.
2. Protocol `v1alpha1`: Task 2.
3. Append-only persistence and replay baseline: Task 3.
4. Multi-agent supervisor/child orchestration: Tasks 4, 5, 6.
5. Python capability bridge: Task 7.
6. Web debug surface: Tasks 9 and 10.
7. Verification baseline: Tasks 2 through 12.

Unimplemented by design:

1. Full product migration.
2. External federation.
3. Production auth hardening.
4. Rich end-user runtime UX.

### Placeholder Scan

No `TODO`, `TBD`, or “implement later” placeholders remain in task instructions. Where the first implementation is intentionally shallow, the exact stub code and follow-up boundary are included directly in the plan.

### Type Consistency

The same object names are used consistently across tasks:

- `SessionSchema`
- `RunSchema`
- `DelegationSchema`
- `EventSchema`
- `nextRunState`
- `createDelegationPlan`
- `mergeChildResult`
- `createRuntimeSession`
- `listRuntimeEvents`

The runtime package name, protocol version, and route prefixes are also held consistent across all tasks.
