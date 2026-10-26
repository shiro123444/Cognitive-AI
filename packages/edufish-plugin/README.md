# @edufish/plugin

Standalone TypeScript/Node 20+ atomic plugin for the EduFish domain API. It is
host-independent: no Qingzhou imports, no dependency on the custom Node Agent
Runtime, and no global registration or side effects.

The package exposes the eight v1 operations, strict Zod input/output schemas,
an immutable manifest with explicit agent discovery metadata, an injectable
transport, and an HTTP transport that forwards the real user JWT.

## Install

```bash
npm install @edufish/plugin
# or, inside this repository:
npm install ../../packages/edufish-plugin
```

`zod@3.24.1` is a runtime dependency. Node.js 20 or newer is required. The
package is ESM-only (`"type": "module"`); use `import`, not `require`.

For an in-repository build without installing dependencies, the local
validation config resolves the repository runtime's Zod/TypeScript/Vitest:

```bash
node ../../runtime/node_modules/typescript/bin/tsc -p tsconfig.local.json
node ../../runtime/node_modules/vitest/vitest.mjs run \
  --root . --config vitest.config.ts
```

A portable install instead uses `npm run build`, `npm test` and the declared
`devDependencies` (`typescript@5.8.2`, `vitest@2.1.9`).

## Usage

```ts
import {
  createEduFishPlugin,
  createHttpTransport,
  EDUFISH_OPERATION,
} from '@edufish/plugin';

const transport = createHttpTransport({
  baseUrl: 'https://edufish.example.edu',
  // Server-owned callback. Never read identity or tokens from tool arguments.
  getAccessToken: async (invocation) => {
    return authService.getUserJwt(invocation.scope.userId);
  },
  timeoutMs: 15_000,
});

const plugin = createEduFishPlugin({ transport });

const course = await plugin.invoke(
  EDUFISH_OPERATION.courseRead,
  { course_id: 'course-1' },
  {
    scope: { userId: 'user-1', sessionId: 'session-42' },
    requestId: 'read-7f4c',
    onEvent: (event) => logger.info(event),
  },
);

// Write operations require an idempotency key.
const submission = await plugin.invoke(
  EDUFISH_OPERATION.quizSubmit,
  {
    course_id: 'course-1',
    chapter_id: 'chapter-1',
    answers: [{ quiz_id: 'quiz-1', answer: 'working memory' }],
  },
  {
    scope: { userId: 'user-1', sessionId: 'session-42' },
    requestId: 'submit-4d1e-0001',
  },
);

plugin.dispose(); // disables future calls and aborts in-flight requests
```

Every operation definition is AtomicPlugin-shaped:

```ts
interface EduFishOperationDefinition {
  name: string;
  description: string;
  input: z.ZodTypeAny;
  output: z.ZodTypeAny;
  mutates: boolean;
  requiresRequestId: boolean;
  discovery: AgentDiscoveryMetadata; // explicit host/agent discovery
  execute(input, invocation): Promise<unknown>;
}
```

`EDUFISH_MANIFEST` is deeply frozen and mirrors the backend wire manifest while
adding `discovery` metadata per operation.

## Operations

| Operation | Mutates | Request ID | Notes |
| --- | --- | --- | --- |
| `edufish.course.read` | no | optional | Course and ordered chapters. |
| `edufish.material.search` | no | optional | Labelled deterministic keyword retrieval; no fabricated fallback. |
| `edufish.graph.neighborhood` | no | optional | Bounded graph expansion; edges only between returned nodes. |
| `edufish.quiz.read` | no | optional | Prompts only; answers/explanations are rejected by the output schema. |
| `edufish.quiz.submit` | yes | required | Deterministic grading; durable backend idempotency. |
| `edufish.progress.read` | no | optional | Current user's course-scoped progress only. |
| `edufish.lab.start` | yes | required | Persists reservation + idempotency before enqueueing. |
| `edufish.lab.status` | no | optional | Current user's run in the exact course only. |

Wire arguments use `snake_case`. `invocation.requestId` is forwarded verbatim
as envelope `request_id`; it is never inserted into operation arguments.

## Trust and validation

- Identity comes only from `invocation.scope`. Top-level identity/role keys are
  rejected by strict Zod objects; nested identity keys (including lab `params`)
  are rejected by a recursive guard.
- Request and response envelopes are exact. Extra keys, missing `data`/`error`,
  and malformed errors are rejected.
- Outputs are validated per operation. `quiz.read` output objects are strict,
  so an `answer` or `explanation` field makes the call fail with
  `INVALID_OUTPUT`.
- HTTP transport errors are redacted. Network errors never expose raw messages;
  server messages are bounded and scrubbed of bearer tokens, `token=`-style
  credentials and common absolute paths.
- The transport rejects redirects (`redirect: 'error'`), omits cookies
  (`credentials: 'omit'`) and never sends identity headers.
- Request bodies are capped at 256 KiB, response bodies at 2 MiB by default,
  lab `params` at 16 KiB, and the whole call (token lookup + request + body
  read) shares one timeout.

## Lifecycle and cancellation

- `invocation.signal` cancels token lookup, the in-flight request and body read.
- `transport.dispose()` / `plugin.dispose()` mark the instance disposed, abort
  all active requests and make future calls reject with `DISPOSED`.
- Disposal is local to the domain client only; it never deletes backend learning
  history.
- Events (`started`, `completed`, `failed`) contain only operation, request ID,
  session ID, timestamp, duration and error code. Answers, tokens, user IDs and
  operation arguments are not emitted.
- A throwing or rejecting `onEvent` sink cannot change operation semantics.

## Error codes

Server codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_ARGUMENT`,
`UNKNOWN_OPERATION`, `IDEMPOTENCY_CONFLICT`, `UNAVAILABLE`.

Client-side codes: `INVALID_OUTPUT`, `INVALID_RESPONSE`, `TIMEOUT`, `ABORTED`,
`DISPOSED`, `REQUEST_ID_REQUIRED`, `TRANSPORT_ERROR`. Unknown server codes are
mapped to `UNAVAILABLE`.

## Limits

- The backend has published-course visibility, not full course membership or
  tenant isolation. Deployments with `MULTI_TENANT_ENABLED` must refuse plugin
  use until real course tenancy exists.
- Material retrieval is deterministic keyword matching; it is not a vector or
  model-based retrieval system.
- Quiz grading compares normalized answers deterministically; repeated answers
  do not imply mastery.
- Lab execution reuses the existing Python service/queue. Cancellation and
  restart recovery are not guaranteed by this package.
- Artifact payloads are opaque to the plugin; the server remains responsible
  for scrubbing local paths.

## Tests

The test suite is network-free and uses injected fetch/token functions. It
covers all eight operations, cancelled token lookup, timeout and cancellation
during response body reads, disposal during in-flight requests, strict identity
rejection, malformed errors/outputs, request-ID preservation and missing write
idempotency keys.
