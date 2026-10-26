# Qingzhou UI adapter preview guide

Updated 2026-10-26. This guide covers the developer harness in
`examples/qingzhou-ui-preview/`. It does not register anything in Qingzhou and
does not change the existing Vue frontend.

## What the preview proves

The default page is now the interactive **Laboratory**: real server-side
Hodgkin–Huxley/LIF simulation, parameter controls, comparison curves, ionic
currents/gating and an independent NiiVue brain surface/MRI tab. Start with
`npm run ui:actual` from the repository root. Nothing runs until you explicitly
choose Run. Select **API and component validation**, or append
`?view=validation`, to open the original eight-operation acceptance surface.
Details and verified results: [Laboratory acceptance](LAB-ACCEPTANCE.md).

The harness imports the **built** `@edufish/qingzhou-ui` and `@edufish/plugin`
packages and mounts them under the same host stack Qingzhou uses:

- `@lobehub/ui` `ThemeProvider` for appearance and primary color;
- `@lobehub/ui` `ConfigProvider` for host component configuration and locale;
- `react-i18next` `I18nextProvider` sharing one i18next instance.

Like Qingzhou's `AppTheme`, the harness sets explicit appearance and a shared
CSS-variable key on Lobe's ThemeProvider and imports Ant Design's own reset.
Lobe configures the Ant Design algorithm; there is no second Ant Design theme
provider. The primary-color control selects Lobe's existing named palettes,
using `customTheme.primaryColor` in the same way as the host.

Providers exist only in the harness. The adapter never creates
a ThemeProvider, ConfigProvider, I18nextProvider, global reset, palette or app
shell. The harness stylesheet contains layout only and inherits semantic
`--ant-*` host variables.

The preview shows:

- all eight immutable result snapshots (`course.read`, `material.search`,
  `graph.neighborhood`, `quiz.read`, `quiz.submit`, `progress.read`,
  `lab.start`, `lab.status`), including the accessible SVG graph;
- the real `QuizInteraction` and `LabLauncher` with explicit submit/start;
- a clearly labelled demo transport that counts only explicit writes;
- an actual HTTP mode against `examples/plugin-host/fixture_server.py`.

## Clean checkout setup

Prerequisites: Node.js >= 20, npm, and the backend virtualenv. The fixture
server is the production Flask app plus fixture seed/handshake routes; it does
not reimplement plugin operations.

Build order matters because the preview consumes package `dist` output:

```bash
# 1. Backend virtualenv (if it does not exist yet)
cd backend
python -m venv .venv
# Windows:
.venv/Scripts/python.exe -m pip install -r requirements.txt
# POSIX:
.venv/bin/python -m pip install -r requirements.txt
cd ..

# 2. Core plugin package
npm --prefix packages/edufish-plugin install
npm --prefix packages/edufish-plugin run build
npm --prefix packages/edufish-plugin test

# 3. Qingzhou UI adapter (needs the built core package)
npm --prefix packages/edufish-qingzhou-ui install
npm --prefix packages/edufish-qingzhou-ui run build
npm --prefix packages/edufish-qingzhou-ui test

# 4. Preview harness
npm --prefix examples/qingzhou-ui-preview install

# 5. Browser binary for acceptance (one time)
cd examples/qingzhou-ui-preview
npx playwright install chromium
```

The preview declares `file:` dependencies on the two local packages. Re-run the
adapter build after changing adapter sources; the preview imports `dist`, not
its source. Set `EDUFISH_PYTHON` if the backend interpreter lives elsewhere;
the orchestration script otherwise checks `backend/.venv/Scripts/python.exe`
and `backend/.venv/bin/python`.

## Commands

From `examples/qingzhou-ui-preview/`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite only, demo fixtures. Actual HTTP mode is disabled and explains how to enable it. |
| `npm run dev:actual` | Starts the Python fixture server and Vite on unique loopback ports, then prints only the Vite URL. The fixture uses a temporary database and is removed on shutdown. |
| `npm run build` | Production build of the harness. |
| `npm run validate:fixtures` | Parses every fixture with the real core output schemas. |
| `npm run check:http` | Starts the fixture backend directly and invokes all eight operations over real HTTP (no browser; useful when Playwright is unavailable). |
| `npm run check:neuron-http` | Real HH/LIF experiments, sodium blockade, maximum-duration payload and idempotent replay through production routes. |
| `npm run verify:browser` | Starts both servers and runs Playwright acceptance against actual HTTP. |
| `npm run verify:lab` | Verifies interactive simulation, SVG charts, themes/narrow layout, actual WebGL surface rotation and on-demand MRI. |

Preview only:

```bash
npm --prefix examples/qingzhou-ui-preview run dev
```

Actual mode (do not open Vite directly; the proxy needs the fixture URL and
per-run handshake):

```bash
npm --prefix examples/qingzhou-ui-preview run dev:actual
```

Browser acceptance:

```bash
npm --prefix examples/qingzhou-ui-preview run verify:browser
```

Screenshots are written to `examples/qingzhou-ui-preview/output/playwright/`
(`light.png`, `dark.png`, `narrow.png`, `actual.png`) and the directory is
ignored by git.

An existing Chromium executable can be used without downloading another browser:

```bash
npm --prefix examples/qingzhou-ui-preview run verify:browser -- --browser-executable "C:/path/to/chrome.exe"
```

Alternatively set `EDUFISH_BROWSER_EXECUTABLE`. Development dependencies pin
`@lobehub/ui@5.14.0` and compatible `@lobehub/icons@5.19.3`; installing a newer
icons release can require a newer UI package. Use the checked-in lockfiles,
without `--force` or `--legacy-peer-deps`.

## Actual HTTP mode and credentials

`scripts/dev-with-fixture.mjs` uses `scripts/orchestrate.mjs` to:

1. generate a random per-run handshake secret;
2. start `fixture_server.py` with `--port 0` and a temporary database;
3. read its single JSON readiness line (no token);
4. start Vite on a free port with `EDUFISH_FIXTURE_URL` and the handshake in
   the **server process environment**;
5. stop Vite, then POST `/__fixture__/shutdown` and await the Python process;
   an exit hook kills leftovers if the parent exits unexpectedly.

The browser never receives the handshake secret. Vite proxies
`/api/v1/plugin/**` and `/__fixture__/**` to loopback; the proxy adds
`X-Fixture-Handshake` only to fixture requests. The browser calls the existing
`GET /__fixture__/token?user_id=fixture-student`, then keeps the returned JWT in
module memory. It is not written to localStorage, sessionStorage, cookies, the
DOM or logs. The actual client uses the real `createHttpTransport` +
`createEduFishPlugin` from `@edufish/plugin`, so schemas, idempotency request
IDs and error mapping are the production ones.

Every actual read is behind an explicit button. Quiz submit and lab start are
performed only by the real components' explicit controls. Reload and history
replay issue no writes; the browser test counts write requests before and after
reload.

## Browser acceptance coverage

`scripts/browser-verify.mjs` uses a real Chromium and real libraries (no mocks).
It checks:

- no console errors or page exceptions;
- all eight snapshot cards render and the graph produces an SVG;
- light/dark changes computed host surface and adapter SVG text colors;
- the primary-color control changes the computed color of a host primary
  button;
- switching to `zh-CN` changes rendered copy through the shared i18next
  instance and back to English;
- a 390 px viewport has no horizontal overflow;
- answer fields are keyboard focusable and Enter on the focused submit button
  submits;
- zero writes on initial mount (StrictMode is enabled) and after reload;
- exactly two actual writes (quiz submit, lab start) and real HTTP responses
  for course, search, graph, quiz, submit, progress, lab start and lab status;
- no JWT-shaped text, cookies or token-keyed browser storage.

If Chromium or preview dependencies are missing, the script exits with an
actionable message; the coordinator can run it after installation.

## Future Qingzhou registration seam

Qingzhou currently exposes internal, statically registered builtin tool UI
types rather than a public dynamic UI SDK. This work does not claim that host
registration exists.

The adapter is intentionally structural: it exports render, inspector and
streaming maps keyed by the eight short operation names, plus the provider and
component API in `src/contracts.ts`. A future static host integration would:

1. register identifier `edufish` + `apiName` entries in Qingzhou's static
   render/inspector/streaming maps, reusing the exported maps;
2. supply `EduFishUIProvider` from the host with a host-owned client,
   trusted `getInvocation`, identity key and optional `createRequestId`;
3. keep ThemeProvider, ConfigProvider, i18next resources and locale in the
   host, exactly as this harness does;
4. merge `edufishUIResources` into the host's i18next instance under the
   `edufish` namespace.

No `@lobechat/types`, `@lobechat/shared-tool-ui`, host module or runtime
registration is imported here.

## Limitations

- This is a developer harness, not a product UI or a Qingzhou theme.
- Actual mode is fixture-only: dev seed data, dev token handshake and a
  temporary database. It must never be deployed or pointed at production.
- The proxy and in-memory token require the Vite dev server; a static build
  cannot use actual HTTP mode without a host-provided client and token source.
- The fixture JWT has a one-hour TTL and is re-minted only by reloading; there
  is no refresh flow.
- Lab execution is asynchronous. Actual status may legitimately be pending;
  cancellation is local wait cancellation, not remote rollback.
- Playwright assumes English accessible labels for submit/start controls; the
  checks run after switching back to English.
- The adapter's visual quality still depends on the host's real Qingzhou
  context beyond the pinned token/library contract; host registration and
  package publication remain deferred.
