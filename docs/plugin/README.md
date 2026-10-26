# EduFish independent plugin — local development example

This directory contains the host-side example for the standalone `@edufish/plugin`
package and the authenticated Python backend plugin API. It is intentionally
host-independent: it does not import Qingzhou, the custom Node Agent Runtime, or
the Vue frontend.

- **Wire contract:** [`docs/plugin/IMPLEMENTATION-CONTRACT.md`](./IMPLEMENTATION-CONTRACT.md)
- **Qingzhou UI direction:** [host components, theme and rendering contracts](./QINGZHOU-UI-CONTRACT.md)
- **TypeScript package:** `packages/edufish-plugin` (exports `createEduFishPlugin`,
  `createHttpTransport`, `EduFishPluginError`, operation schemas/metadata)
- **Production Python API:** `backend/app/api/plugin.py` plus `backend/app/plugin/**`
- **Example host:** `examples/plugin-host/**` (Node CLI, dev fixture backend, smoke test)

The fixture backend is **not** a second implementation. It builds a temporary
Flask app around the *production* `app.api.api_bp` blueprint, so
`/api/v1/plugin/manifest` and `/api/v1/plugin/invoke` are the real production
functions, schema, visibility rules, idempotency store and error mapping. The
fixture adds only deterministic seed data, a dev-only token handshake, and
health/shutdown routes.

---

## 1. Prerequisites

- Node.js >= 20 (the example uses built-in `fetch`, `parseArgs`, ESM).
- The backend virtualenv with backend requirements installed:
  - Windows: `backend/.venv/Scripts/python.exe`
  - POSIX: `backend/.venv/bin/python`
- A built TypeScript package at `packages/edufish-plugin/dist`:

```bash
cd packages/edufish-plugin
npm install
npm run build
```

The example needs **no install of its own** for the zero-install path: the CLI
resolves the package's built `dist` entry directly from
`../../packages/edufish-plugin`. You can also run `npm install` in
`examples/plugin-host` (it declares a file dependency on
`../../packages/edufish-plugin`) and import it through normal Node resolution.
Set `EDUFISH_PLUGIN_ENTRY` to override the built entry file.

---

## 2. Run the dev fixture backend

The fixture server binds loopback only, uses a temporary SQLite database,
temporary uploads and a temporary Flask instance path, and deletes all of it on
shutdown. It never writes to `backend/instance`, the normal runtime config, or
your production data.

```bash
export EDUFISH_FIXTURE_HANDSHAKE="$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
backend/.venv/Scripts/python.exe examples/plugin-host/fixture_server.py --port 8765
```

It prints one JSON readiness line containing `base_url` (no token):

```json
{"fixture":"edufish-plugin","status":"ready","base_url":"http://127.0.0.1:8765",...}
```

Useful flags:

- `--port 0` — pick a free port.
- `--no-grants` — disable `PLUGIN_ALLOWED_COURSE_IDS` and use the default
  published-course visibility rules.
- `--keep-temp` — keep the temporary directory for debugging (it is still a
  random temp directory, never production data).
- `--verbose` — show fixture request warnings (bodies/tokens are never logged).

### Dev-only token handshake

Tokens are emitted **only** by this explicit endpoint:

```text
GET /__fixture__/token?user_id=fixture-student
X-Fixture-Handshake: <EDUFISH_FIXTURE_HANDSHAKE>
```

It is loopback-only, requires the per-run handshake secret, returns
`Cache-Control: no-store`, and is never logged. The fixture server prints no
tokens. The CLI and smoke test fetch tokens into memory and never print them.

Seeded users:

| User ID | Role | Default course grant |
| --- | --- | --- |
| `fixture-student` | student | published fixture course |
| `fixture-other-student` | student | published fixture course |
| `fixture-teacher` | teacher | published + draft fixture courses |
| `fixture-admin` | admin | published + draft fixture courses |
| `fixture-unlisted` | student | none (fails closed) |
| `fixture-runtime` | runtime | rejected by the plugin |

The default fixture enables `PLUGIN_ALLOWED_COURSE_IDS` so the grant and
fail-closed behavior is exercised. Use `--no-grants` to exercise the
published/draft default instead.

---

## 3. Run the Node CLI

Credentials are environment-only and are never printed or persisted.

| Environment variable | Meaning |
| --- | --- |
| `EDUFISH_BASE_URL` | Backend origin (default `http://127.0.0.1:8765`) |
| `EDUFISH_TOKEN` | Real user Bearer JWT (production or manual use) |
| `EDUFISH_USER_ID` | Host-side `invocation.scope.userId` (default `fixture-student`) |
| `EDUFISH_SESSION_ID` | Host-side `invocation.scope.sessionId` |
| `EDUFISH_API_TIMEOUT_MS` | Request timeout (default 15000) |
| `EDUFISH_FIXTURE_HANDSHAKE` | If `EDUFISH_TOKEN` is unset, fetch a dev fixture token in memory |
| `EDUFISH_PLUGIN_ENTRY` | Override the built package entry |
| `EDUFISH_PYTHON` | Python interpreter used by `smoke.mjs` / `run-tests.mjs` |

`EDUFISH_USER_ID` is host metadata only. The backend ignores it and derives the
identity from the Bearer JWT and database row.

### Catalog (no network, no token)

```bash
node examples/plugin-host/cli.mjs catalog
```

### Eight operations

Start the fixture server in another shell and export the handshake secret. The
CLI will fetch a short-lived fixture token itself:

```bash
export EDUFISH_FIXTURE_HANDSHAKE="<the same value>"
export EDUFISH_BASE_URL="http://127.0.0.1:8765"

# 1. course.read
node examples/plugin-host/cli.mjs course \
  --course-id course-fixture-published

# 2. material.search (keyword retrieval; real stored Chunk rows)
node examples/plugin-host/cli.mjs search \
  --course-id course-fixture-published \
  --query "estimates which states are more promising" --limit 5

# 3. graph.neighborhood (bounded visible graph expansion)
node examples/plugin-host/cli.mjs graph \
  --course-id course-fixture-published \
  --concept-id concept-fixture-heuristic \
  --depth 2 --limit 50

# 4. quiz.read (answers/explanations are never returned)
node examples/plugin-host/cli.mjs quiz \
  --course-id course-fixture-published \
  --chapter-id chapter-fixture-search

# 5. quiz.submit (request_id is required for writes)
node examples/plugin-host/cli.mjs submit \
  --course-id course-fixture-published \
  --chapter-id chapter-fixture-search \
  --answer "quiz-fixture-heuristic=It estimates which states are more promising." \
  --request-id demo-quiz-1

# Replay the same request_id and payload: same submission_id, no duplicate event.
node examples/plugin-host/cli.mjs submit \
  --course-id course-fixture-published \
  --chapter-id chapter-fixture-search \
  --answer "quiz-fixture-heuristic=It estimates which states are more promising." \
  --request-id demo-quiz-1

# Same request_id + different payload: HTTP 409 IDEMPOTENCY_CONFLICT.
node examples/plugin-host/cli.mjs submit \
  --course-id course-fixture-published \
  --chapter-id chapter-fixture-search \
  --answer "quiz-fixture-heuristic=a different answer" \
  --request-id demo-quiz-1

# 6. progress.read
node examples/plugin-host/cli.mjs progress \
  --course-id course-fixture-published

# 7. lab.start (real ExperimentService run; the fixture runs jobs synchronously)
node examples/plugin-host/cli.mjs lab-start \
  --course-id course-fixture-published \
  --template-id exp-neuron-spike \
  --params '{"stimulus":{"stimulus_current":8,"duration_ms":120}}' \
  --request-id demo-lab-1

# 8. lab.status
node examples/plugin-host/cli.mjs lab-status \
  --course-id course-fixture-published \
  --run-id "<run id from lab-start>"
```

Additional CLI behavior:

- `--answers '<json array>'` is accepted instead of repeated `--answer`.
- `--events` prints redacted operation lifecycle events to stderr.
- Write commands generate a random `request_id` if one is omitted and print
  only that ID to stderr.
- The CLI never prints `EDUFISH_TOKEN` or the fixture handshake secret.

---

## 4. End-to-end smoke test

```bash
node examples/plugin-host/smoke.mjs
```

The smoke script:

1. builds/loads the **actual built** `@edufish/plugin` package;
2. starts this real Python fixture backend on a loopback ephemeral port;
3. obtains fixture tokens through the explicit handshake without printing them;
4. verifies the production `GET /api/v1/plugin/manifest` route (including the
   unauthenticated 401) and then drives all eight operations through the
   plugin's own validation/transport: catalog, course read, real stored-chunk
   search, graph expansion, quiz read, submit, progress, lab start/status;
5. proves quiz answers/explanations are absent from read output, another
   student's personal material is hidden, and identity-override arguments are
   rejected;
6. proves submit replay (same `request_id` + payload) and conflict (same key +
   different payload → 409) across a durable idempotency table;
7. proves runtime service tokens, missing tokens, and missing course grants are
   rejected;
8. runs a real `exp-neuron-spike` experiment through `ExperimentService` and
   verifies ownership + exact course association on `lab.status`;
9. shuts the fixture down and deletes its temporary database.

If the package has not been built, the loader fails with the exact build
command rather than attempting a fake backend.

---

## 5. Tests

Fixture tests (production routes on a temporary database):

```bash
backend/.venv/Scripts/python.exe -m pytest examples/plugin-host/tests -q
```

or, with automatic virtualenv discovery:

```bash
node examples/plugin-host/run-tests.mjs
```

Node syntax checks:

```bash
node --check examples/plugin-host/cli.mjs
node --check examples/plugin-host/smoke.mjs
node --check examples/plugin-host/lib/plugin-package.mjs
```

From `examples/plugin-host`, the packaged scripts are:

```bash
npm run check          # node --check on all example modules
npm run test:fixture   # Python tests through the backend venv
npm run smoke          # end-to-end smoke (requires built package)
```

---

## 6. Grant and visibility semantics (exact)

These rules come from the production `backend/app/plugin/visibility.py` and
operations modules; the fixture exercises them rather than reimplementing them.

### Authentication and identity

- Every plugin manifest/invoke request requires `Authorization: Bearer <jwt>`.
- The JWT is verified by the existing `app.auth` middleware; the user is then
  loaded from the database. The token's role claim must match the database role.
- Runtime service tokens (`role: "runtime"` or user id `runtime`) are rejected
  with `FORBIDDEN`.
- Identity/role override headers are rejected: `X-User-Id`, `X-User-Role`,
  `X-Runtime-User-Id`, `X-Runtime-User-Role`, `X-Actor-Id`, `X-Actor-Role`,
  `X-Forwarded-User`, `X-Impersonate-User`.
- Identity/role override arguments are rejected by strict schemas and the
  package's recursive identity guard (for example `user_id`, `student_id`,
  `owner_id`, `role`, `scope`, tokens).
- No new token issuer or shared-secret impersonation path exists.

### Courses and grants

- `PLUGIN_ALLOWED_COURSE_IDS` is an optional JSON object mapping user IDs to
  course-ID arrays. It is read from Flask config or the environment.
- When configured:
  - users missing from the map get `403 FORBIDDEN`;
  - courses missing from a user's grant list get `404 NOT_FOUND` (non-leaking).
- When not configured:
  - authenticated users can read published courses;
  - teachers and admins can also read draft courses.
- The data model has **no course-membership table**, so this is not full
  institutional membership or tenant isolation.
- `MULTI_TENANT_ENABLED=true` makes the plugin return `503 UNAVAILABLE`.

### Knowledge/material scope

- Visible knowledge is course-global plus the current user's own
  `student_personal` rows.
- Other users' personal materials, concepts, graph edges, quizzes and personal
  knowledge are never returned.
- Quiz items attached to another user's personal material are treated as
  invisible.
- Graph edges are returned only when both endpoints are visible returned nodes.
- Chapter/concept/quiz relationships and lab runs are validated against the
  requested course.
- Quiz read never returns `answer` or `explanation`; submit feedback may
  include the quiz's explanation, but never an `answer` field.

---

## 7. Search limitations (honest)

- Retrieval is **deterministic keyword matching**, explicitly labelled
  `retrieval_method: "keyword"`.
- It searches real persisted `Chunk` rows (text and heading) joined to visible
  `Material` rows. There is no embedding, vector-store, LLM, or external-model
  requirement in this operation.
- A SQL `ILIKE` candidate window (bounded to 2000 chunks) is scored in Python;
  result count is bounded to 1..20 (default 20), and returned content is
  truncated to 1200 characters.
- Results are ordered deterministically by score, filename, page number, and
  chunk ID.
- If nothing matches, the result is an empty list. There is no fabricated
  fallback and no sample/demo citation.
- Raw local material paths are never returned; only filename, page, citation
  locator and heading.

---

## 8. Quiz and idempotency limitations

- `edufish.quiz.read` is a projection: strict output schemas exclude
  `answer`/`explanation`, and the backend never serializes them for reads.
- `edufish.quiz.submit` compares answers by deterministic normalized exact
  match: Unicode NFKC, trim, case folding, and whitespace collapsing.
  Punctuation, word order and synonyms remain significant.
- 1..20 unique quiz IDs per submission; each quiz must belong to the requested
  chapter and be visible (including its optional material).
- Feedback is either `Correct.`/`Incorrect.` plus at most 500 characters of the
  stored explanation. It does not expose a canonical `answer` field.
- Each accepted submission appends one `answered_quiz` `ProgressEvent`.
  There is **no mastery calculation**: repeated attempts with new request IDs
  are separate events, not mastery evidence.
- Idempotency scope is `(authenticated user, operation, request_id)`, persisted
  in the production `plugin_idempotency` table:
  - same key + same canonical arguments → replay the stored response, no
    duplicate progress event;
  - same key + different arguments → `409 IDEMPOTENCY_CONFLICT`;
  - replay survives process/app restarts because it is database-backed.
- `request_id` is required for both write operations and is bounded to 200
  characters.

---

## 9. Lab/worker limitations (honest)

- `edufish.lab.start` uses the real `ExperimentService`:
  - validates the published template and adapter parameters;
  - persists an idempotency reservation before enqueuing;
  - creates the `ExperimentRun` and `ran_lab` progress event via
    `create_pending_run`;
  - stores a replayable response before enqueueing, so a retry cannot enqueue a
    duplicate job.
- The fixture sets `TESTING=True`, so the in-process job queue runs synchronously
  and `lab.start` returns a terminal `completed` run. A production backend may
  return `pending`/`running` first; poll `edufish.lab.status`.
- The production queue is a process-local thread pool backed by the `Job` table.
  It does **not** provide:
  - recovery of queued/running work after a process restart;
  - automatic retry;
  - cancellation or restart guarantees.
  Do not promise these to hosts or users.
- `lab.status` requires the current user to own the run and requires an exact
  course match. Staff do not get an implicit override on another user's run.
- Serialized run payloads are scrubbed recursively: path-shaped keys and
  path-shaped strings are removed/replaced. Scientific artifact data remains,
  but local filesystem locations are not exposed.
- Templates are global in the current data model (there is no template
  `course_id`); the run is bound to the requested visible course.

---

## 10. Using the CLI against a real backend

The fixture is only for local development. For a real deployment, start the
backend normally and set:

```bash
export EDUFISH_BASE_URL="https://your-edufish.example"
export EDUFISH_TOKEN="<real user JWT from your normal login flow>"
export EDUFISH_USER_ID="<that user's id>"
node examples/plugin-host/cli.mjs course --course-id <course>
```

The backend still derives identity from the JWT/database; `EDUFISH_USER_ID` is
only invocation-scope metadata. Never commit tokens or credentials, and never
point the CLI at a fixture handshake endpoint outside local development.

---

## 11. Safety boundaries of this example

- Fixture server binds `127.0.0.1`/`::1` only and refuses other addresses.
- Temporary SQLite DB, uploads and instance paths are deleted on shutdown
  (`--keep-temp` is debugging-only).
- It does not read or write `backend/instance/runtime_config.json`, production
  databases, `.env` files, or credential files.
- Tokens are emitted only through the handshake endpoint, never logged, and
  never printed by the CLI/smoke test.
- The example does not modify the existing Vue frontend, shared contract,
  Qingzhou, root package scripts, or production auth.
