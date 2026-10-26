# Qingzhou-native EduFish UI implementation contract

Scope: implement a React UI adapter in this repository only, without modifying Qingzhou, registering host routes, publishing, or changing the existing Vue frontend. Read QINGZHOU-UI-CONTRACT.md and the existing core package. Use the current configured Claude model. Preserve all existing edits and plugin work.

## Package and host boundaries

New package: `@edufish/qingzhou-ui`, directory `packages/edufish-qingzhou-ui`, version 0.1.0, private / UNLICENSED, ESM + declarations. Core remains `@edufish/plugin` with no React/Vue dependency. Use React 19, @lobehub/ui ^5.14.0, antd ^6.3.5, antd-style ^4.1.0, lucide-react and react-i18next as peers. The coordinator owns initial package/config/dependency installation. Do not symlink, copy, alter, or vendor Qingzhou node_modules.

The production adapter must NOT create a ThemeProvider, ConfigProvider, I18nextProvider, global stylesheet/reset, custom palette, root navigation/sidebar/login, persistent credential storage, or an independent app shell. Use host library components and `createStaticStyles` + semantic `cssVar.*`; SVG diagram colors must inherit those tokens. Component spacing may follow host defaults/semantic patterns; no custom branding. Preview/test harnesses alone create the same host providers to verify inheritance. Do not mock @lobehub/ui/antd/antd-style in acceptance tests.

Qingzhou currently has internal, statically registered UI types, not a public dynamic UI SDK. Provide structural compatible render/inspector/streaming maps and document the future registration seam; do not pretend host registration already exists. Do not import private @lobechat/types or @lobechat/shared-tool-ui as public npm packages. Do not change the host repository.

## Shared source API

`src/contracts.ts` is coordinator-owned and pinned. Foundation owns `src/provider.tsx`, `src/actions.ts`, `src/registry.tsx`, `src/i18n.ts`, `src/index.ts`, and `test/foundation*.test.tsx`; components owns `src/components/**` and `test/components*.test.tsx`; preview owns `examples/qingzhou-ui-preview/**` and `docs/plugin/QINGZHOU-UI-GUIDE.md`. Do not edit another role's files. Root can make integration corrections.

Foundation exports:

- `EduFishUIProvider` from provider.tsx; business dependency injection only, no styling/i18n provider. Props match contracts.ts. Optional context access for snapshot callbacks; strict access for interactive actions.
- `useEduFishAction<O>(operation)` from actions.ts; return `EduFishActionState<O>` from contracts. API calls only from explicit `run(input)`, never provider/hook mount. Validate inputs/outputs with core schemas. Require trusted getInvocation; no tool args determine identity.
- Cancellation/unmount/scope replacement must abort local requests and suppress stale results/errors. `identityKey` replacement must immediately hide old user's state; client/factory replacement must not let stale closures write into the new scope. Abort is local cancellation, not a promise of undoing backend work.
- Writes obtain a request ID from trusted invocation or `createRequestId` / crypto.randomUUID. Retain the same ID for failed retries of the same normalized payload and identity; changed payload/identity/reset creates a new ID. Suppress double-click concurrent writes. Successful repeats require explicit reset/new action. No automatic retries or submits on mount/history replay.
- `EduFishRenders`, `EduFishInspectors`, `EduFishStreaming` maps keyed by the eight short names (`course.read` etc), plus `EduFishToolResult` and `normalizeEduFishOperation`. Parse pluginState (or content JSON when state absent), optionally unwrap success/data envelope, then validate against the appropriate core output schema. Invalid/error snapshots show generic host UI states without exposing raw payloads, answers, stacks or credentials. Renderers never call client operations.
- `edufishUIResources` = `{ 'en-US': {edufish: ...}, 'zh-CN': {edufish: ...} }`; export resources only, no global i18n initialization. Components use `useTranslation('edufish')`; coordinate keys via the component source at final integration. Include all rendered strings.
- Barrel exports all public contracts, provider/hooks, registries and component exports. No side effects.

Components export from `src/components/index.ts`:

- `CourseResult`, `MaterialSearchResult`, `GraphResult`, `QuizResult`, `QuizSubmissionResult`, `ProgressResult`, `LabResult` with typed ResultProps<Data> from contracts (LabResult uses ExperimentRun inside `{run}`).
- Results are immutable snapshots. Use real @lobehub/ui (Block, Flexbox, Button, Empty, Icon, etc.) and antd form/status components where appropriate, with token-based layouts. Material citations call an optional explicit `onOpenReference` callback, never derive arbitrary hrefs or filesystem URLs. No network fetches from result renders.
- `GraphResult`: a bounded, accessible SVG graph with deterministic layout and a readable node/edge list or selection details; no Vue imports. Colors inherit host tokens, layout remains usable at narrow widths.
- `QuizInteraction`: props from contracts. Use real host Input/TextArea/Button and antd Form where useful; display provided quiz prompts, collect answers, submit only explicit user action through `useEduFishAction('edufish.quiz.submit')`. Failures preserve answers and retry identity; display result/feedback after success. Never autofill canonical answers or auto-submit on mount, rerender or StrictMode. Scope/course/chapter changes reset private form data; validate blank/oversized answers and prevent double clicks.
- `LabLauncher`: explicit start/retry through `useEduFishAction('edufish.lab.start')`; show returned run via LabResult. Cancellation must be described as local wait cancellation. No false remote-cancel or recovery claim.
- Tests must verify real rendered UI, user interaction, invalid/empty/loading states as relevant, no writes on render/StrictMode, explicit submit, duplicate click protection, failed retry ID preservation, scope change and accessible labels. Keep components focused; avoid giant files.

## Preview and verification

`examples/qingzhou-ui-preview/` is a developer harness, not another product UI. Use the real adapter and same @lobehub/ui ThemeProvider/ConfigProvider with an i18next instance. Provide light/dark, primary color, language and narrow viewport checks using host components. No independent token set or global resets beyond the host's own reset.

Include deterministic fixtures matching actual core schemas for all eight result operations. Include an injectable transport demo that counts explicit quiz/lab calls, plus an actual HTTP mode using the existing temporary backend fixture for read -> quiz submit -> progress and a small lab. In actual HTTP mode, a dev-server proxy can forward `/api/v1/plugin` and dev-only handshake endpoints to the loopback fixture so no production CORS/auth changes are needed. Use environment variables, no printed or persisted JWTs. Do not recreate backend operation logic. Read actual exports and core schemas.

Provide Vite dev/build and Playwright browser verification scripts, or a clear runnable browser test command with a real browser. Capture light/dark/narrow screenshots to an ignored output directory. Verify semantic token/computed-style change, not only screenshot existence. Assert no browser console/runtime errors, no writes on mount/history rendering, explicit submit/progress, and keyboard access. The coordinator will run actual browser acceptance.

Preview owns its config, examples, fixtures, browser tests and guide; it may import built adapter dist. It must not edit adapter files or core/backend/frontend. Coordinate any required exports through this pinned API and report mismatches. No commits, pushes, branch changes, dependency installation or system config changes from agents; coordinator installs dependencies and runs any denied commands.

## Bounded completion

Implement the assigned files, run feasible focused checks, and report remaining issues honestly. Use Read/Glob/Grep; avoid chained Bash helpers needing approval. Prefer single `node`, `npm run`, or backend venv commands. Do not endlessly expand scope or re-review after checks pass. The deliverable is this adapter and validated preview; host integration remains deferred.
