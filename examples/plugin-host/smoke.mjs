#!/usr/bin/env node
/**
 * End-to-end smoke test for the independent plugin example.
 *
 * It starts the real Python fixture backend (a Flask app using the production
 * SQLAlchemy models, JWT helpers and ExperimentService), obtains dev-only
 * tokens through the explicit fixture handshake, then drives the **built**
 * `@edufish/plugin` package over HTTP.
 *
 * It covers: catalog, course read, real stored evidence search, quiz answer
 * hiding, submit/progress, idempotent replay and conflict, identity-argument
 * and runtime-token rejection, course grants, and a real Lumen/neuron
 * experiment via ExperimentService.
 *
 * Tokens are held in memory, never printed, and never written to disk.
 */

import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  buildInvocation,
  createHttpTransportFromModule,
  createPluginFromModule,
  describeError,
  errorLooksLike,
  EXAMPLE_DIR,
  invokeOperation,
  loadPluginPackage,
} from "./lib/plugin-package.mjs";

const PYTHON_CANDIDATES = [
  process.env.EDUFISH_PYTHON,
  path.join(EXAMPLE_DIR, "..", "..", "backend", ".venv", "Scripts", "python.exe"),
  path.join(EXAMPLE_DIR, "..", "..", "backend", ".venv", "bin", "python"),
].filter(Boolean);

const PATH_KEYS = new Set([
  "path",
  "file_path",
  "filepath",
  "local_path",
  "storage_path",
  "dataset_path",
  "output_path",
  "upload_path",
  "absolute_path",
]);

const REQUEST_TIMEOUT_MS = 15000;

let fixtureProcess = null;
let fixtureBaseUrl = "";
let fixtureHandshake = "";
let fixtureStderr = "";
const transports = [];
const checks = [];

function record(label) {
  checks.push(label);
  process.stdout.write(`[ok] ${label}\n`);
}

function check(condition, label, detail) {
  if (!condition) {
    throw new Error(`${label}${detail ? ` — ${detail}` : ""}`);
  }
  record(label);
}

function unwrap(result) {
  if (result && typeof result === "object" && result.success === true && "data" in result) {
    return result.data;
  }
  return result;
}

function assertNoAnswerKeys(value, label, trail = "") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoAnswerKeys(item, label, `${trail}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "answer" || key === "explanation") {
        throw new Error(`${label}: leaked quiz field ${trail}.${key}`);
      }
      assertNoAnswerKeys(item, label, `${trail}.${key}`);
    }
  }
}

function assertNoPathKeys(value, label, trail = "") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPathKeys(item, label, `${trail}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (
        PATH_KEYS.has(String(key).toLowerCase()) &&
        typeof item === "string" &&
        item !== "" &&
        item !== "[redacted]"
      ) {
        throw new Error(`${label}: leaked path at ${trail}.${key}`);
      }
      assertNoPathKeys(item, label, `${trail}.${key}`);
    }
  }
}

function hasAnyKey(value, keys, trail = "") {
  if (Array.isArray(value)) {
    return value.some((item, index) => hasAnyKey(item, keys, `${trail}[${index}]`));
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (keys.has(key)) return `${trail}.${key}`;
      const found = hasAnyKey(item, keys, `${trail}.${key}`);
      if (found) return found;
    }
  }
  return null;
}

async function captureError(fn) {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}

async function expectFailure(label, fn, matcher) {
  const error = await captureError(fn);
  check(error !== null, `${label}: rejected`);
  check(
    matcher(error),
    `${label}: expected error code/status`,
    JSON.stringify(describeError(error)),
  );
}

function pickPython() {
  for (const candidate of PYTHON_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    "Could not find the backend virtualenv Python. Set EDUFISH_PYTHON to an interpreter " +
      "with the backend requirements installed.",
  );
}

async function startFixture() {
  const python = pickPython();
  const serverScript = path.join(EXAMPLE_DIR, "fixture_server.py");
  fixtureHandshake = randomBytes(32).toString("hex");

  fixtureProcess = spawn(python, [serverScript, "--port", "0"], {
    cwd: EXAMPLE_DIR,
    env: {
      ...process.env,
      EDUFISH_FIXTURE_HANDSHAKE: fixtureHandshake,
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const ready = new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      reject(new Error(`fixture startup timed out after 60s${fixtureStderr ? `: ${fixtureStderr.slice(-500)}` : ""}`));
    }, 60000);

    fixtureProcess.stdout.setEncoding("utf8");
    fixtureProcess.stdout.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("{")) continue;
        try {
          const message = JSON.parse(line);
          if (message.status === "ready" && message.base_url) {
            clearTimeout(timer);
            resolve(message);
          }
        } catch {
          // Ignore non-JSON output.
        }
      }
    });
    fixtureProcess.stderr.setEncoding("utf8");
    fixtureProcess.stderr.on("data", (chunk) => {
      fixtureStderr += chunk;
      if (fixtureStderr.length > 8000) fixtureStderr = fixtureStderr.slice(-8000);
    });
    fixtureProcess.once("exit", (code) => {
      clearTimeout(timer);
      reject(
        new Error(
          `fixture exited before readiness (code ${code})${fixtureStderr ? `: ${fixtureStderr.slice(-800)}` : ""}`,
        ),
      );
    });
  });

  const message = await ready;
  fixtureBaseUrl = message.base_url.replace(/\/+$/, "");
  record(`fixture started at ${fixtureBaseUrl} (temporary database)`);
  return message;
}

async function fetchFixtureToken(userId) {
  const url = `${fixtureBaseUrl}/__fixture__/token?user_id=${encodeURIComponent(userId)}`;
  const response = await fetch(url, {
    headers: { "X-Fixture-Handshake": fixtureHandshake },
  });
  if (!response.ok) {
    throw new Error(`fixture token handshake for ${userId} failed with HTTP ${response.status}`);
  }
  const body = await response.json();
  const token = body?.data?.token;
  if (typeof token !== "string" || !token) {
    throw new Error(`fixture token handshake for ${userId} returned no token`);
  }
  return token;
}

function pluginFor(token) {
  const transport = createHttpTransportFromModule(pkg, {
    baseUrl: fixtureBaseUrl,
    getAccessToken: async () => token,
    timeoutMs: REQUEST_TIMEOUT_MS,
  });
  transports.push(transport);
  return createPluginFromModule(pkg, transport);
}

function invocationFor(userId, requestId) {
  return buildInvocation({
    userId,
    sessionId: "plugin-host-smoke",
    requestId,
  });
}

async function stopFixture() {
  if (!fixtureProcess) return;
  try {
    await fetch(`${fixtureBaseUrl}/__fixture__/shutdown`, {
      method: "POST",
      headers: { "X-Fixture-Handshake": fixtureHandshake },
    });
  } catch {
    // Best effort; fall back to killing below.
  }
  const exited = await waitForExit(fixtureProcess, 15000);
  if (!exited) {
    fixtureProcess.kill();
    await waitForExit(fixtureProcess, 5000);
  }
  fixtureProcess = null;
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve(true);
      return;
    }
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(value);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
  });
}

let pkg;

async function main() {
  pkg = await loadPluginPackage();
  check(typeof pkg.createEduFishPlugin === "function", "package exports createEduFishPlugin");
  check(typeof pkg.createHttpTransport === "function", "package exports createHttpTransport");

  await startFixture();

  const tokens = {
    student: await fetchFixtureToken("fixture-student"),
    other: await fetchFixtureToken("fixture-other-student"),
    teacher: await fetchFixtureToken("fixture-teacher"),
    unlisted: await fetchFixtureToken("fixture-unlisted"),
    runtime: await fetchFixtureToken("fixture-runtime"),
  };
  record("dev-only fixture handshake issued tokens (not printed)");

  // The backend manifest route is a production route mounted by the fixture.
  const manifestResponse = await fetch(`${fixtureBaseUrl}/api/v1/plugin/manifest`, {
    headers: { authorization: `Bearer ${tokens.student}` },
  });
  check(manifestResponse.status === 200, "backend manifest: authenticated route responds");
  const manifestBody = await manifestResponse.json();
  check(manifestBody.success === true, "backend manifest: success envelope");
  check(manifestBody.data.id === "edufish", "backend manifest: plugin id");
  check(manifestBody.data.version === "0.1.0", "backend manifest: plugin version");
  check(
    manifestBody.data.operations.length === 8,
    "backend manifest: eight operations",
  );
  const anonymousManifest = await fetch(`${fixtureBaseUrl}/api/v1/plugin/manifest`);
  check(anonymousManifest.status === 401, "backend manifest: unauthenticated request rejected");

  const studentPlugin = pluginFor(tokens.student);
  const otherPlugin = pluginFor(tokens.other);
  const teacherPlugin = pluginFor(tokens.teacher);
  const unlistedPlugin = pluginFor(tokens.unlisted);
  const runtimePlugin = pluginFor(tokens.runtime);
  const noTokenPlugin = pluginFor("");

  // 1. Catalog -----------------------------------------------------------------
  check(studentPlugin.id === "edufish", "catalog: plugin id is edufish");
  check(studentPlugin.version === "0.1.0", "catalog: plugin version is 0.1.0");
  const operationNames = new Set(studentPlugin.operations.map((item) => item.name));
  for (const name of [
    "edufish.course.read",
    "edufish.material.search",
    "edufish.graph.neighborhood",
    "edufish.quiz.read",
    "edufish.quiz.submit",
    "edufish.progress.read",
    "edufish.lab.start",
    "edufish.lab.status",
  ]) {
    check(operationNames.has(name), `catalog: exposes ${name}`);
  }

  // 2. Course read -------------------------------------------------------------
  const courseData = unwrap(
    await invokeOperation(
      studentPlugin,
      "edufish.course.read",
      { course_id: "course-fixture-published" },
      invocationFor("fixture-student"),
    ),
  );
  check(courseData.course.id === "course-fixture-published", "course read: real seeded course");
  check(
    courseData.chapters.some((chapter) => chapter.id === "chapter-fixture-search"),
    "course read: seeded chapters",
  );

  // 3. Real evidence search ----------------------------------------------------
  const searchData = unwrap(
    await invokeOperation(
      studentPlugin,
      "edufish.material.search",
      {
        course_id: "course-fixture-published",
        query: "estimates which states are more promising",
      },
      invocationFor("fixture-student"),
    ),
  );
  check(searchData.retrieval_method === "keyword", "search: explicitly reports keyword retrieval");
  const evidence = searchData.results.find((item) => item.chunk_id === "chunk-fixture-heuristic-1");
  check(Boolean(evidence), "search: returns the seeded stored Chunk row");
  check(
    evidence.content.includes("estimates which states are more promising"),
    "search: returns real chunk text",
  );
  check(evidence.citation_locator === "p.3 §1.2", "search: returns citation locator");
  check(!("path" in evidence), "search: no raw local file path");
  assertNoPathKeys(searchData, "search");

  const personalSearch = unwrap(
    await invokeOperation(
      studentPlugin,
      "edufish.material.search",
      { course_id: "course-fixture-published", query: "private note" },
      invocationFor("fixture-student"),
    ),
  );
  const personalIds = new Set(personalSearch.results.map((item) => item.chunk_id));
  check(personalIds.has("chunk-fixture-personal-1"), "search: current user's personal chunk visible");
  check(
    !personalIds.has("chunk-fixture-other-personal-1") &&
      personalSearch.results.every((item) => !item.content.includes("secret study plan")),
    "search: other users' personal chunks are hidden",
  );

  // 4. Graph neighborhood ------------------------------------------------------
  const graphData = unwrap(
    await invokeOperation(
      studentPlugin,
      "edufish.graph.neighborhood",
      {
        course_id: "course-fixture-published",
        concept_id: "concept-fixture-heuristic",
        depth: 2,
        limit: 50,
      },
      invocationFor("fixture-student"),
    ),
  );
  const graphIds = new Set(graphData.nodes.map((node) => node.id));
  check(graphIds.has("concept-fixture-astar"), "graph: expands seeded neighbors");
  check(graphIds.has("concept-fixture-personal"), "graph: includes own personal concept");
  check(!graphIds.has("concept-fixture-other-personal"), "graph: hides other personal concept");
  check(!graphIds.has("concept-fixture-draft"), "graph: hides unpublished concept");
  check(
    graphData.edges.every((edge) => graphIds.has(edge.source_id) && graphIds.has(edge.target_id)),
    "graph: edges only between returned nodes",
  );

  // 5. Quiz answer hiding ------------------------------------------------------
  const quizData = unwrap(
    await invokeOperation(
      studentPlugin,
      "edufish.quiz.read",
      { course_id: "course-fixture-published", chapter_id: "chapter-fixture-search" },
      invocationFor("fixture-student"),
    ),
  );
  check(
    quizData.items.some((item) => item.id === "quiz-fixture-heuristic"),
    "quiz read: returns seeded prompt",
  );
  check(
    !quizData.items.some((item) => item.id === "quiz-fixture-hidden"),
    "quiz read: hides quiz attached to another student's material",
  );
  check(hasAnyKey(quizData, new Set(["answer", "explanation"])) === null, "quiz read: no answer/explanation fields");
  assertNoAnswerKeys(quizData, "quiz read");

  // 6. Submit + replay + conflict ---------------------------------------------
  const submitArguments = {
    course_id: "course-fixture-published",
    chapter_id: "chapter-fixture-search",
    answers: [
      { quiz_id: "quiz-fixture-heuristic", answer: "it estimates which states are more promising." },
    ],
  };
  const submitData = unwrap(
    await invokeOperation(
      studentPlugin,
      "edufish.quiz.submit",
      submitArguments,
      invocationFor("fixture-student", "smoke-quiz-1"),
    ),
  );
  check(submitData.score === 1 && submitData.total === 1, "submit: deterministic score");
  check(submitData.results[0].correct === true, "submit: normalized answer accepted");
  check(!("answer" in submitData.results[0]), "submit: feedback does not echo the answer");
  const submissionId = submitData.submission_id;

  const replayData = unwrap(
    await invokeOperation(
      studentPlugin,
      "edufish.quiz.submit",
      submitArguments,
      invocationFor("fixture-student", "smoke-quiz-1"),
    ),
  );
  check(replayData.submission_id === submissionId, "submit: same request_id + payload replays");

  await expectFailure(
    "submit: same request_id + different payload conflicts",
    () =>
      invokeOperation(
        studentPlugin,
        "edufish.quiz.submit",
        {
          ...submitArguments,
          answers: [{ quiz_id: "quiz-fixture-heuristic", answer: "a different answer" }],
        },
        invocationFor("fixture-student", "smoke-quiz-1"),
      ),
    (error) => errorLooksLike(error, { code: "IDEMPOTENCY_CONFLICT", status: 409 }),
  );

  // 7. Progress ----------------------------------------------------------------
  const progressData = unwrap(
    await invokeOperation(
      studentPlugin,
      "edufish.progress.read",
      { course_id: "course-fixture-published" },
      invocationFor("fixture-student"),
    ),
  );
  check(progressData.student_id === "fixture-student", "progress: scoped to current user");
  check((progressData.event_counts.answered_quiz ?? 0) >= 1, "progress: answered_quiz event recorded");
  check(
    progressData.quiz_submissions.some((item) => item.submission_id === submissionId),
    "progress: submission visible after submit",
  );
  check(
    progressData.quiz_submissions.length === 1,
    "progress: replay did not duplicate the submission",
  );

  // 8. Identity / auth negatives ----------------------------------------------
  await expectFailure(
    "identity override argument is rejected",
    () =>
      invokeOperation(
        studentPlugin,
        "edufish.course.read",
        { course_id: "course-fixture-published", user_id: "fixture-other-student" },
        invocationFor("fixture-student"),
      ),
    (error) =>
      errorLooksLike(error, { code: "INVALID_ARGUMENT", status: 400 }) ||
      error?.name === "ZodError" ||
      Array.isArray(error?.issues),
  );

  await expectFailure(
    "missing token is rejected",
    () =>
      invokeOperation(
        noTokenPlugin,
        "edufish.course.read",
        { course_id: "course-fixture-published" },
        invocationFor("fixture-student"),
      ),
    (error) =>
      errorLooksLike(error, { code: "UNAUTHORIZED", status: 401 }) ||
      /unauthor|authenticat|token/i.test(describeError(error).message),
  );

  await expectFailure(
    "runtime service token is rejected",
    () =>
      invokeOperation(
        runtimePlugin,
        "edufish.course.read",
        { course_id: "course-fixture-published" },
        invocationFor("fixture-runtime"),
      ),
    (error) => errorLooksLike(error, { code: "FORBIDDEN", status: 403 }),
  );

  await expectFailure(
    "missing course grant fails closed",
    () =>
      invokeOperation(
        unlistedPlugin,
        "edufish.course.read",
        { course_id: "course-fixture-published" },
        invocationFor("fixture-unlisted"),
      ),
    (error) => errorLooksLike(error, { code: "FORBIDDEN", status: 403 }),
  );

  const teacherDraft = unwrap(
    await invokeOperation(
      teacherPlugin,
      "edufish.course.read",
      { course_id: "course-fixture-draft" },
      invocationFor("fixture-teacher"),
    ),
  );
  check(teacherDraft.course.status === "draft", "visibility: teacher can read a draft course");

  await expectFailure(
    "visibility: student cannot read a draft course",
    () =>
      invokeOperation(
        studentPlugin,
        "edufish.course.read",
        { course_id: "course-fixture-draft" },
        invocationFor("fixture-student"),
      ),
    (error) => errorLooksLike(error, { code: "NOT_FOUND", status: 404 }),
  );

  // 9. Real experiment ---------------------------------------------------------
  const labArguments = {
    course_id: "course-fixture-published",
    template_id: "exp-neuron-spike",
    params: { stimulus: { stimulus_current: 8, duration_ms: 120 } },
  };
  const labData = unwrap(
    await invokeOperation(
      studentPlugin,
      "edufish.lab.start",
      labArguments,
      invocationFor("fixture-student", "smoke-lab-1"),
    ),
  );
  const run = labData.run;
  check(run.status === "completed", "lab start: real ExperimentService run completed");
  check(run.student_id === "fixture-student", "lab start: run owned by current user");
  check(run.course_id === "course-fixture-published", "lab start: run bound to the course");
  check(Array.isArray(run.artifacts) && run.artifacts.length > 0, "lab start: real artifacts persisted");
  check(run.report?.status === "ready", "lab start: report persisted");
  assertNoPathKeys(run, "lab start");

  const labReplay = unwrap(
    await invokeOperation(
      studentPlugin,
      "edufish.lab.start",
      labArguments,
      invocationFor("fixture-student", "smoke-lab-1"),
    ),
  );
  check(labReplay.run.id === run.id, "lab start: replay returns the same run");

  await expectFailure(
    "lab start: same request_id + different params conflicts",
    () =>
      invokeOperation(
        studentPlugin,
        "edufish.lab.start",
        { ...labArguments, params: { stimulus: { stimulus_current: 9, duration_ms: 120 } } },
        invocationFor("fixture-student", "smoke-lab-1"),
      ),
    (error) => errorLooksLike(error, { code: "IDEMPOTENCY_CONFLICT", status: 409 }),
  );

  const labStatus = unwrap(
    await invokeOperation(
      studentPlugin,
      "edufish.lab.status",
      { course_id: "course-fixture-published", run_id: run.id },
      invocationFor("fixture-student"),
    ),
  );
  check(labStatus.run.id === run.id, "lab status: returns the owned run");

  await expectFailure(
    "lab status: another user cannot read the run",
    () =>
      invokeOperation(
        otherPlugin,
        "edufish.lab.status",
        { course_id: "course-fixture-published", run_id: run.id },
        invocationFor("fixture-other-student"),
      ),
    (error) => errorLooksLike(error, { code: "NOT_FOUND", status: 404 }),
  );

  const finalProgress = unwrap(
    await invokeOperation(
      studentPlugin,
      "edufish.progress.read",
      { course_id: "course-fixture-published" },
      invocationFor("fixture-student"),
    ),
  );
  check((finalProgress.event_counts.ran_lab ?? 0) >= 1, "progress: ran_lab event recorded");

  process.stdout.write(`\n[smoke] ${checks.length} checks passed against the built plugin + fixture backend\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`\n[smoke] FAILED\n${JSON.stringify(describeError(error), null, 2)}\n`);
  if (fixtureStderr) {
    process.stderr.write(`\n[fixture stderr]\n${fixtureStderr.slice(-2000)}\n`);
  }
  process.exitCode = 1;
} finally {
  await stopFixture().catch(() => {});
  for (const transport of transports) {
    if (typeof transport?.dispose === "function") {
      try {
        await transport.dispose();
      } catch {
        // Ignore disposal errors; never print credentials.
      }
    }
  }
}
