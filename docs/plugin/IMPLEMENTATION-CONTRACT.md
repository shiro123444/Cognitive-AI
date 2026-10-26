# EduFish independent plugin v1 — implementation contract

This is the coordination contract for the current implementation. Scope: this repository only. Do not modify or connect Qingzhou, merge branches, publish, or deploy. Preserve existing uncommitted UI changes. The deliverable is a host-independent plugin package, real Python domain endpoints, and a standalone local host example.

## Wire protocol

- Plugin ID `edufish`, package `@edufish/plugin`, plugin version `0.1.0`, protocol version `1`.
- `GET /api/v1/plugin/manifest`: authenticated; response `{success:true,data:{id:"edufish",version:"0.1.0",protocol_version:1,operations:[{name,description,input_schema,mutates}]}}`.
- `POST /api/v1/plugin/invoke`: authenticated; JSON `{operation:string,arguments:object,request_id?:string}`. Reject unexpected envelope and operation argument keys.
- Success `{success:true,data:<operation output>}`. Failure `{success:false,error:{code:string,message:string}}` with appropriate HTTP status. No stack traces, paths, credentials, or private answer fields in read results.
- Use a real user Bearer JWT, resolve the user from the database, and derive attribution from the authenticated user. Reject runtime service tokens and identity/role override arguments or headers. No new token issuer or shared-secret impersonation path.
- Since the current data model has no course membership table, default visibility is published courses for authenticated users; teachers/admins can read drafts. Optional `PLUGIN_ALLOWED_COURSE_IDS` server config maps user IDs to course ID lists and, when configured, fails closed for missing users. Do not claim full institutional membership or tenant isolation. Refuse plugin use when MULTI_TENANT_ENABLED until real course tenancy exists.
- Include only global published knowledge plus current user's personal knowledge; never return other users' personal material/graph/quiz evidence. Validate chapter, concept and run relationships against the requested course.

## Operations (strict bounded arguments, snake_case wire format)

1. `edufish.course.read`: `{course_id}` → `{course:{id,title,summary,status},chapters:[{id,title,order,objectives}]}`.
2. `edufish.material.search`: `{course_id,query,limit?:1..20}` → `{results:[{chunk_id,material_id,course_id,filename,content,page_number,citation_locator,heading}],retrieval_method:"keyword"}`. Search real stored Chunk rows; deterministic keyword matching is acceptable and must be explicitly labelled. No fabricated fallback, external model requirement, raw local file paths or unfiltered vector hits. Bound content length and result count.
3. `edufish.graph.neighborhood`: `{course_id,concept_id?,depth?:1..2,limit?:1..100}` → `{nodes:[{id,label,definition}],edges:[{id,source_id,target_id,relationship,evidence}]}`. Bounded expansion, edges only between returned visible nodes.
4. `edufish.quiz.read`: `{course_id,chapter_id,limit?:1..20}` → `{items:[{id,prompt}]}`. Never return answer/explanation on this operation.
5. `edufish.quiz.submit`: `{course_id,chapter_id,answers:[{quiz_id,answer}]}` with 1..20 unique quiz IDs; envelope `request_id` required → `{submission_id,score,total,results:[{quiz_id,correct,feedback}]}`. Compare normalized answers deterministically, describe limits. Persist a ProgressEvent of type answered_quiz with course/chapter and result; request ID deduplication must persist across requests/restarts. Same key + different payload returns IDEMPOTENCY_CONFLICT 409; same key + same payload replays. Request scope is authenticated user + operation + request_id. Use a small dedicated SQL model/module if needed; do not rewrite shared models.py. Match quiz's material visibility as well as chapter/course. Do not count repeated answers as mastery.
6. `edufish.progress.read`: `{course_id}` → `{course_id,student_id,event_counts,quiz_submissions:[{submission_id,chapter_id,score,total,created_at}]}`. Current user's course-scoped data only.
7. `edufish.lab.start`: `{course_id,template_id,params?:object}` with envelope `request_id` required → `{run:<existing ExperimentService.serialize_run output>}`. Enforce current-user ownership, published template visibility, course association, payload bounds and stable request replay. Reuse real ExperimentService/queue; don't invent cancellation or restart guarantees. Persist run reservation + idempotency before enqueue, and handle replay without duplicate work.
8. `edufish.lab.status`: `{course_id,run_id}` → `{run:<existing serialized run>}`. Current-user owned run only, exact course match. Never expose local file paths; scrub artifact payloads as necessary or return opaque artifact references.

All IDs nonempty strings <=200 chars, query <=2000, answer <=4000, request_id <=200. Enforce configured request body size or a small route-specific bound. Meaningful error codes: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, INVALID_ARGUMENT, UNKNOWN_OPERATION, IDEMPOTENCY_CONFLICT, UNAVAILABLE.

## TypeScript plugin package

Own `packages/edufish-plugin/`. Export `createEduFishPlugin`, `createHttpTransport`, operation names/types, `EduFishPluginError` and immutable manifest. Return an AtomicPlugin-shaped object `{id,version,operations}` where each operation has name, description, Zod input/output, execute(input, invocation), and explicit agent discovery metadata. Do not import any Qingzhou code or add a host runtime dependency. No auto-registration or global side effects.

Trusted invocation: `{scope:{userId,sessionId},signal?,requestId?,onEvent?}`. An injected transport has `invoke(operation, arguments, invocation): Promise<unknown>` and optional dispose. HTTP transport accepts baseUrl + `getAccessToken(invocation)` (server-owned callback), optional injected fetch, timeout; forwards the actual user JWT and request_id, never trusts identity in tool args. `requestId` is required for write operations. Validate input, output and error envelopes, use bounded timeouts, preserve cancellation, and redact transport errors. Explicit dispose disables future calls and cancels outstanding requests; never delete domain history. Events started/completed/failed contain operation and request metadata but no credentials or answers. Prove behavior with network-free tests; test timeout, cancellation, malformed backend output, retry identity, lifecycle and authorization argument rejection.

## Standalone example

UI direction (user requirement, 2026-10-26): any future Qingzhou-facing UI must reuse the host React components, theme providers, tokens and interaction conventions. Keep this core package headless. The existing Vue application's shell and styling are not the Qingzhou plugin UI deliverable. See QINGZHOU-UI-CONTRACT.md for verified host interfaces and the distinction between existing internal APIs and proposed public SDK work. This requirement does not authorize integration into Qingzhou in the current phase.

Own `examples/plugin-host/` and `docs/plugin/README.md`. Provide a simple Node CLI host using the built TypeScript package and authenticated HTTP backend. Commands: catalog, course, search, quiz, submit, progress, lab-start, lab-status; parameters match wire operations. Credentials read from environment, never printed/persisted. Explain setup/build/run, grant configuration, visibility limits, existing v1 backend auth, and honest worker/retrieval limits. Include a Python dev-only fixture server binding loopback with a temporary database, sample users/course/chapter/chunks/quiz/graph, and deterministic examples; isolate from normal backend instance/config and clean up on shutdown. Dev tokens only through explicit local development output/request, no production auth changes. Include a smoke script invoking the actual built plugin against this local backend, proving read → submit → progress, replay and denied identity input. No new production frontend route or changes to existing Vue UI.

## Ownership

- backend Claude: `backend/app/plugin/**`, `backend/app/api/plugin.py`, one import in `backend/app/api/__init__.py`, `backend/app/tests/test_plugin_api.py` (additional plugin-specific tests allowed).
- package Claude: `packages/edufish-plugin/**` only.
- example Claude: `examples/plugin-host/**`, `docs/plugin/README.md` only.
- Coordinator owns this contract, orchestration artifacts, integration fixes and final validation. Other agents may read all repository code, but must not edit others' files. No commits, pushes, branch switching, destructive cleanup, system configuration or credential-file inspection.
