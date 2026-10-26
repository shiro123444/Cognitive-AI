# @edufish/qingzhou-ui

Qingzhou-native React adapter for the host-independent EduFish plugin. The
package is private (`UNLICENSED`, version `0.1.0`), ESM-only and has no
stylesheet, theme, i18n bootstrap or app-shell side effects.

## Boundaries

- `@edufish/plugin` remains the only protocol/validation layer. This package
  imports its operation names, schemas and errors but never reimplements them.
- The host supplies `ThemeProvider`, `ConfigProvider` and the i18next instance.
  The adapter only adds business dependencies through `EduFishUIProvider`.
- Snapshot renderers are read-only. They cannot call `client.invoke`.
- No host registration is performed. Qingzhou currently uses a build-time,
  internal renderer registry rather than a public dynamic UI SDK.

## Usage

```tsx
import { useCallback, useMemo } from 'react';
import {
  EduFishUIProvider,
  EduFishRenders,
  edufishUIResources,
} from '@edufish/qingzhou-ui';

// Inside the host component, memoize these by the authenticated session.
const client = useMemo(() => ({
  invoke: (operation, input, invocation) => transport.invoke(operation, input, invocation),
}), [transport]);
const getInvocation = useCallback(() => ({
  scope: { userId: session.userId, sessionId: session.id },
}), [session.userId, session.id]);
const CourseRender = EduFishRenders['course.read'];

<EduFishUIProvider
  client={client}
  getInvocation={getInvocation}
  identityKey={`${session.userId}:${session.id}`}
  createRequestId={() => crypto.randomUUID()}
  onOpenReference={(reference) => openSourceViewer(reference)}
>
  <CourseRender
    apiName="edufish.course.read"
    identifier="edufish"
    args={{}}
    content={null}
    messageId="message-1"
    pluginState={snapshot}
  />
</EduFishUIProvider>
```

`getInvocation` is the only identity source. Tool arguments never establish a
user. `identityKey` must identify the same user as the trusted invocation
scope; changing it immediately hides the previous user's actions state.
Include the session identity as well to clear private drafts on session changes.
Keep `client` and `getInvocation` stable with React memoization: replacing either
aborts the local pending request and suppresses its late result. Issued write
IDs survive source replacement for safe retries under the same identity/payload.

`edufishUIResources` exports `{ 'en-US': { edufish }, 'zh-CN': { edufish } }`.
It includes the flat keys consumed by the result components (`courseTitle`,
`quizSubmit`, `labLauncherDescription`, …). Register it with the host's
i18next under the `edufish` namespace. No global initialisation is performed
here.

## Actions

`useEduFishAction<O>(operation)` accepts a full operation name such as
`edufish.quiz.submit`.

- No request is issued on mount, rerender, history replay or StrictMode replay.
  Only an explicit `run(input)` calls the client.
- Inputs and outputs are validated with the core Zod schemas, including strict
  unknown-key rejection.
- Writes get a request id from the trusted invocation, `createRequestId`, or
  `crypto.randomUUID`. Failed retries of the same normalised payload and
  identity reuse the id; a changed payload, identity or `reset()` creates a new
  one. A successful repeat is suppressed until `reset()`.
- Concurrent explicit submissions are suppressed while one request is pending.
- `cancel()`, unmount and scope/client replacement abort the local request and
  suppress late results and errors. Cancellation only stops the local wait; it
  does not undo backend work.
- Errors are redacted `EduFishPluginError` values. Raw thrown values and stacks
  are never copied.

## Registries

All eight short operation names are present:

`course.read`, `material.search`, `graph.neighborhood`, `quiz.read`,
`quiz.submit`, `progress.read`, `lab.start`, `lab.status`.

- `EduFishRenders` — validated snapshot views (`CourseResult`,
  `MaterialSearchResult`, `GraphResult`, `QuizResult`, `QuizSubmissionResult`,
  `ProgressResult`, `LabResult`).
- `EduFishInspectors` — compact title/status only; never raw args or payloads.
- `EduFishStreaming` — presentational waiting state.
- `EduFishToolResult` — generic dispatcher accepting the structural host
  `BuiltinRenderProps` subset; unknown identifiers render a generic invalid
  state.
- `normalizeEduFishOperation` — maps `edufish.*` or short names to a stable
  short name.

Snapshots are decoded in this order: `pluginState` (or `content` when state is
absent) → optional JSON string → optional strict `{success, data}` envelope →
the matching core output schema. Invalid, error and empty snapshots render
generic host UI states without echoing the payload, answers, stacks or
credentials. Parsed snapshots are deep-frozen.

## Host registration seam (future)

A host adapter should register, per short operation name, the entries from
`EduFishRenders`, `EduFishInspectors` and `EduFishStreaming` against the
identifier `edufish` and api name `edufish.<area>.<action>`. This mirrors
Qingzhou's static `builtin-tools` registry shape; it is not a published dynamic
SDK. Do not import private `@lobechat/*` packages.

## Interactive laboratory

`NeuronWorkbench` uses the same trusted business provider for explicit HH/LIF
runs, bounded status polling and up to three completed-run comparisons. It
renders validated voltage/current/gating data with lazy ECharts SVG charts;
parameter edits never trigger writes. `BrainViewer` separately provides a lazy
NiiVue WebGL2 surface/MRI viewer using host-supplied asset URLs. Standard anatomy
is not mapped to the single-cell simulation. Both inherit host theme and locale.

```tsx
<NeuronWorkbench courseId={courseId} />
<BrainViewer meshes={hostSurfaceAssets} volume={hostTemplateVolume} />
```

Merge `edufishLabResources[locale].edufish` and the matching
`BRAIN_EN_DEFAULTS` / `BRAIN_ZH_DEFAULTS` into the host `edufish` namespace.
ECharts 6 and NiiVue 0.68.2 are normal engine dependencies, loaded when their
views are used. They do not install a second UI system. The browser UI package
uses TypeScript's Bundler resolution for these frontend dependencies; the core
protocol package retains its independent Node ESM configuration.

See [laboratory acceptance](../../docs/plugin/LAB-ACCEPTANCE.md) and
[neuroimaging API](../../docs/plugin/NEUROIMAGING.md).

## Layout and checks

- `src/provider.tsx` — business dependency context.
- `src/actions.ts` — explicit action hook, validation, retries, cancellation.
- `src/registry.tsx` — snapshot decoding and the three maps plus
  `EduFishToolResult`.
- `src/i18n.ts` — full English/Chinese resources.
- `src/index.ts` — side-effect-free barrel, including component exports.
- `src/components/**` — owned by the components role.

Tests use the real component libraries (no UI mocks) and injected business
clients:

```bash
npm run typecheck
npm test
```

Dependencies are installed by the repository coordinator. Browser acceptance
and the developer preview live in `examples/qingzhou-ui-preview/` and are not
part of this adapter.

## Known limits

- Qingzhou does not currently expose a public dynamic UI registration API.
- Locale and theme come from the host; the adapter verifies neither.
- Lab cancellation is local only and is labelled as such.
- No production CORS, credential storage or backend changes are included.
