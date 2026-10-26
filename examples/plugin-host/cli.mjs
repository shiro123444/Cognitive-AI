#!/usr/bin/env node
/**
 * Standalone Node CLI host for the independent `@edufish/plugin` package.
 *
 * Credentials are read from the environment only:
 *
 *   EDUFISH_BASE_URL          default http://127.0.0.1:8765
 *   EDUFISH_TOKEN             real user Bearer JWT (never printed/persisted)
 *   EDUFISH_USER_ID           host-side invocation scope userId (default fixture-student)
 *   EDUFISH_SESSION_ID        host-side session id (default plugin-host-<pid>)
 *   EDUFISH_API_TIMEOUT_MS    request timeout (default 15000)
 *   EDUFISH_FIXTURE_HANDSHAKE dev-only fixture handshake secret (alternative to EDUFISH_TOKEN)
 *   EDUFISH_PLUGIN_ENTRY      override the built plugin entry file
 *
 * Commands map to the eight wire operations; see `--help`.
 */

import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import {
  buildInvocation,
  createHttpTransportFromModule,
  createPluginFromModule,
  describeError,
  invokeOperation,
  loadPluginPackage,
} from "./lib/plugin-package.mjs";

const DEFAULT_BASE_URL = "http://127.0.0.1:8765";

const OPTIONS = {
  "base-url": { type: "string" },
  "timeout-ms": { type: "string" },
  "course-id": { type: "string" },
  "chapter-id": { type: "string" },
  "concept-id": { type: "string" },
  query: { type: "string" },
  limit: { type: "string" },
  depth: { type: "string" },
  "template-id": { type: "string" },
  "run-id": { type: "string" },
  params: { type: "string" },
  answers: { type: "string" },
  answer: { type: "string", multiple: true },
  "request-id": { type: "string" },
  "session-id": { type: "string" },
  "user-id": { type: "string" },
  "fixture-handshake": { type: "string" },
  events: { type: "boolean" },
  help: { type: "boolean", short: "h" },
};

const COMMANDS = new Set([
  "catalog",
  "course",
  "search",
  "graph",
  "quiz",
  "submit",
  "progress",
  "lab-start",
  "lab-status",
]);

const HELP = `EduFish independent plugin CLI

Usage:
  node cli.mjs <command> [options]

Commands:
  catalog       Print the plugin id/version/operations (no network call)
  course        edufish.course.read        --course-id <id>
  search        edufish.material.search    --course-id <id> --query <text> [--limit 1..20]
  graph         edufish.graph.neighborhood --course-id <id> [--concept-id <id>]
                                           [--depth 1..2] [--limit 1..100]
  quiz          edufish.quiz.read          --course-id <id> --chapter-id <id> [--limit 1..20]
  submit        edufish.quiz.submit        --course-id <id> --chapter-id <id>
                                           (--answers '<json>' | --answer quiz_id=answer ...)
                                           [--request-id <id>]
  progress      edufish.progress.read      --course-id <id>
  lab-start     edufish.lab.start          --course-id <id> --template-id <id>
                                           [--params '<json>'] [--request-id <id>]
  lab-status    edufish.lab.status         --course-id <id> --run-id <id>

Shared options:
  --base-url <url>          default $EDUFISH_BASE_URL or ${DEFAULT_BASE_URL}
  --timeout-ms <ms>         default $EDUFISH_API_TIMEOUT_MS or 15000
  --user-id <id>            invocation scope.userId (default $EDUFISH_USER_ID or fixture-student)
  --session-id <id>         invocation scope.sessionId
  --request-id <id>         idempotency key; generated for write commands when omitted
  --events                  print redacted operation lifecycle events to stderr
  --help, -h                show this help

Credentials:
  Set EDUFISH_TOKEN to a real user Bearer JWT. For the dev fixture only, set
  EDUFISH_FIXTURE_HANDSHAKE and omit EDUFISH_TOKEN; the CLI will fetch a
  short-lived token from GET /__fixture__/token without printing it.

The CLI never prints or persists tokens.
`;

function requireOption(values, name) {
  const value = values[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`--${name} is required for this command`);
  }
  return value;
}

function optionalInt(values, name, fallback) {
  if (values[name] === undefined) return fallback;
  const parsed = Number(values[name]);
  if (!Number.isInteger(parsed)) throw new Error(`--${name} must be an integer`);
  return parsed;
}

function parseJsonObject(raw, label) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed;
}

function buildAnswers(values) {
  if (values.answers !== undefined) {
    let parsed;
    try {
      parsed = JSON.parse(values.answers);
    } catch {
      throw new Error("--answers must be valid JSON");
    }
    if (!Array.isArray(parsed)) throw new Error("--answers must be a JSON array");
    return parsed;
  }
  const pairs = values.answer ?? [];
  if (pairs.length === 0) {
    throw new Error("provide --answers '<json>' or at least one --answer quiz_id=answer");
  }
  return pairs.map((pair) => {
    const index = pair.indexOf("=");
    if (index <= 0) throw new Error("--answer must use quiz_id=answer");
    return { quiz_id: pair.slice(0, index), answer: pair.slice(index + 1) };
  });
}

function buildInput(command, values) {
  switch (command) {
    case "course":
      return { course_id: requireOption(values, "course-id") };
    case "search": {
      const input = {
        course_id: requireOption(values, "course-id"),
        query: requireOption(values, "query"),
      };
      const limit = optionalInt(values, "limit", undefined);
      if (limit !== undefined) input.limit = limit;
      return input;
    }
    case "quiz": {
      const input = {
        course_id: requireOption(values, "course-id"),
        chapter_id: requireOption(values, "chapter-id"),
      };
      const limit = optionalInt(values, "limit", undefined);
      if (limit !== undefined) input.limit = limit;
      return input;
    }
    case "graph": {
      const input = { course_id: requireOption(values, "course-id") };
      if (values["concept-id"] !== undefined) input.concept_id = values["concept-id"];
      const depth = optionalInt(values, "depth", undefined);
      if (depth !== undefined) input.depth = depth;
      const limit = optionalInt(values, "limit", undefined);
      if (limit !== undefined) input.limit = limit;
      return input;
    }
    case "submit":
      return {
        course_id: requireOption(values, "course-id"),
        chapter_id: requireOption(values, "chapter-id"),
        answers: buildAnswers(values),
      };
    case "progress":
      return { course_id: requireOption(values, "course-id") };
    case "lab-start": {
      const input = {
        course_id: requireOption(values, "course-id"),
        template_id: requireOption(values, "template-id"),
      };
      if (values.params !== undefined) {
        input.params = parseJsonObject(values.params, "--params");
      }
      return input;
    }
    case "lab-status":
      return {
        course_id: requireOption(values, "course-id"),
        run_id: requireOption(values, "run-id"),
      };
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

const OPERATION_BY_COMMAND = {
  course: "edufish.course.read",
  search: "edufish.material.search",
  graph: "edufish.graph.neighborhood",
  quiz: "edufish.quiz.read",
  submit: "edufish.quiz.submit",
  progress: "edufish.progress.read",
  "lab-start": "edufish.lab.start",
  "lab-status": "edufish.lab.status",
};

const WRITE_COMMANDS = new Set(["submit", "lab-start"]);

async function fetchFixtureToken(baseUrl, handshake, userId, timeoutMs) {
  const url = new URL("/__fixture__/token", baseUrl);
  url.searchParams.set("user_id", userId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "X-Fixture-Handshake": handshake },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`fixture token handshake failed with HTTP ${response.status}`);
    }
    const body = await response.json();
    const token = body?.data?.token;
    if (typeof token !== "string" || !token) {
      throw new Error("fixture token handshake did not return a token");
    }
    return token;
  } finally {
    clearTimeout(timer);
  }
}

function onEventPrinter(enabled) {
  if (!enabled) return undefined;
  return (event) => {
    const safe = {
      type: event?.type ?? event?.event ?? "event",
      operation: event?.operation ?? event?.name,
      status: event?.status,
      requestId: event?.requestId,
    };
    process.stderr.write(`${JSON.stringify(safe)}\n`);
  };
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs({ options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    process.stderr.write(`Invalid arguments: ${error.message}\n\n${HELP}`);
    return 2;
  }
  const { values, positionals } = parsed;

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const command = positionals[0];
  if (!command || !COMMANDS.has(command)) {
    process.stderr.write(`${command ? `Unknown command: ${command}` : "Missing command"}\n\n${HELP}`);
    return 2;
  }

  const baseUrl =
    values["base-url"] ?? process.env.EDUFISH_BASE_URL ?? DEFAULT_BASE_URL;
  const timeoutMs = optionalInt(
    { "timeout-ms": values["timeout-ms"] ?? process.env.EDUFISH_API_TIMEOUT_MS },
    "timeout-ms",
    15000,
  );
  const userId =
    values["user-id"] ?? process.env.EDUFISH_USER_ID ?? "fixture-student";
  const sessionId =
    values["session-id"] ?? process.env.EDUFISH_SESSION_ID ?? `plugin-host-${process.pid}`;
  const handshake =
    values["fixture-handshake"] ?? process.env.EDUFISH_FIXTURE_HANDSHAKE ?? "";

  let transport;
  try {
    const packageNamespace = await loadPluginPackage();

    let token = process.env.EDUFISH_TOKEN ?? "";
    if (!token && handshake && command !== "catalog") {
      token = await fetchFixtureToken(baseUrl, handshake, userId, timeoutMs);
    }

    transport = createHttpTransportFromModule(packageNamespace, {
      baseUrl,
      getAccessToken: async () => token,
      timeoutMs,
    });
    const plugin = createPluginFromModule(packageNamespace, transport);

    if (command === "catalog") {
      const manifest = plugin.manifest;
      process.stdout.write(
        JSON.stringify(
          {
            id: plugin.id,
            version: plugin.version,
            protocol_version: manifest?.protocol_version ?? plugin.protocolVersion,
            operations: (manifest?.operations ?? plugin.operations).map((operation) => ({
              name: operation.name,
              description: operation.description,
              mutates: operation.mutates ?? null,
              requires_request_id: operation.requires_request_id ?? operation.requiresRequestId ?? null,
            })),
          },
          null,
          2,
        ) + "\n",
      );
      return 0;
    }

    if (!token) {
      throw new Error(
        "No credential available. Set EDUFISH_TOKEN, or set EDUFISH_FIXTURE_HANDSHAKE " +
          "to use the dev-only fixture token handshake.",
      );
    }

    const input = buildInput(command, values);
    const operation = OPERATION_BY_COMMAND[command];
    let requestId = values["request-id"];
    if (!requestId && WRITE_COMMANDS.has(command)) {
      requestId = randomUUID();
      process.stderr.write(`request_id: ${requestId}\n`);
    }

    const invocation = buildInvocation({
      userId,
      sessionId,
      requestId,
      onEvent: onEventPrinter(Boolean(values.events)),
    });

    const result = await invokeOperation(plugin, operation, input, invocation);

    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  } catch (error) {
    const description = describeError(error);
    process.stderr.write(
      JSON.stringify({ success: false, command, error: description }, null, 2) + "\n",
    );
    return error?.name === "AbortError" ? 124 : 1;
  } finally {
    if (transport && typeof transport.dispose === "function") {
      try {
        await transport.dispose();
      } catch {
        // Dispose must not mask the command result; never print credentials.
      }
    }
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`${describeError(error).message}\n`);
    process.exitCode = 1;
  });
