/**
 * Load the independently built `@edufish/plugin` package.
 *
 * The example is designed to run with zero installs: it imports the package's
 * built `dist` entry directly from `../../packages/edufish-plugin`.  If the
 * package has been installed into `node_modules` (via the file dependency in
 * this example's package.json), that path is used as a fallback.
 */

import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EXAMPLE_DIR = path.resolve(HERE, "..");
export const REPO_ROOT = path.resolve(EXAMPLE_DIR, "..", "..");
export const DEFAULT_PACKAGE_DIR = path.join(REPO_ROOT, "packages", "edufish-plugin");

const TOKEN_LIKE_KEYS = /(authorization|token|secret|password|cookie|api[-_]?key)/i;
const JWT_LIKE_VALUE = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;

function firstString(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = firstString(item);
      if (resolved) return resolved;
    }
  }
  if (value && typeof value === "object") {
    // Prefer ESM entry points in a stable order.
    for (const key of ["import", "module", "node", "default", "require"]) {
      if (key in value) {
        const resolved = firstString(value[key]);
        if (resolved) return resolved;
      }
    }
  }
  return null;
}

async function exists(filePath) {
  try {
    await access(filePath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeModule(namespace) {
  if (namespace && typeof namespace.createEduFishPlugin === "function") return namespace;
  const fallback = namespace?.default;
  if (fallback && typeof fallback.createEduFishPlugin === "function") return fallback;
  return namespace;
}

function sanitizeText(value) {
  return String(value ?? "")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-token]")
    .slice(0, 800);
}

/**
 * Resolve and import the plugin package.
 *
 * @param {object} [options]
 * @param {string} [options.entry] Explicit entry file (or `EDUFISH_PLUGIN_ENTRY`).
 * @param {string} [options.packageDir] Package root override.
 * @returns {Promise<object>} the package namespace with `createEduFishPlugin`
 *   and `createHttpTransport`.
 */
export async function loadPluginPackage(options = {}) {
  const packageDir = path.resolve(
    options.packageDir ?? process.env.EDUFISH_PLUGIN_PACKAGE_DIR ?? DEFAULT_PACKAGE_DIR,
  );
  const explicitEntry = options.entry ?? process.env.EDUFISH_PLUGIN_ENTRY ?? "";

  const candidates = [];
  if (explicitEntry) {
    candidates.push(path.resolve(explicitEntry));
  }

  let packageJson = null;
  const packageJsonPath = path.join(packageDir, "package.json");
  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  } catch {
    // Not fatal: fall back to well-known dist layout.
  }

  if (packageJson) {
    const exportTarget = firstString(
      packageJson.exports && typeof packageJson.exports === "object"
        ? packageJson.exports["."] ?? packageJson.exports
        : packageJson.exports,
    );
    for (const target of [exportTarget, packageJson.module, packageJson.main]) {
      if (typeof target === "string" && target.trim()) {
        candidates.push(path.resolve(packageDir, target));
      }
    }
  }

  for (const relative of [
    "dist/index.js",
    "dist/index.mjs",
    "dist/esm/index.js",
    "dist/index.cjs",
  ]) {
    candidates.push(path.join(packageDir, relative));
  }

  const attempted = [];
  for (const filePath of candidates) {
    if (!(await exists(filePath))) {
      attempted.push(`${filePath} (missing)`);
      continue;
    }
    try {
      const namespace = normalizeModule(await import(pathToFileURL(filePath).href));
      validateNamespace(namespace);
      return namespace;
    } catch (error) {
      attempted.push(`${filePath}: ${sanitizeText(error?.message ?? error)}`);
    }
  }

  // Last resort: normal Node resolution. This works after
  // `npm install` in examples/plugin-host (file:../../packages/edufish-plugin).
  try {
    const namespace = normalizeModule(await import("@edufish/plugin"));
    validateNamespace(namespace);
    return namespace;
  } catch (error) {
    attempted.push(`@edufish/plugin: ${sanitizeText(error?.message ?? error)}`);
  }

  throw new Error(
    [
      "Could not load the built @edufish/plugin package.",
      `Looked in: ${packageDir}`,
      "Build it first: cd packages/edufish-plugin && npm install && npm run build",
      "Or set EDUFISH_PLUGIN_ENTRY to the built entry file.",
      "Attempts:",
      ...attempted.map((item) => `  - ${item}`),
    ].join("\n"),
  );
}

function validateNamespace(namespace) {
  if (typeof namespace?.createEduFishPlugin !== "function") {
    throw new Error("module does not export createEduFishPlugin");
  }
  if (typeof namespace?.createHttpTransport !== "function") {
    throw new Error("module does not export createHttpTransport");
  }
}

/**
 * The package factory takes `{ transport }`; a positional transport is accepted
 * as a compatibility fallback for older builds.
 */
export function createPluginFromModule(namespace, transport) {
  const attempts = [
    () => namespace.createEduFishPlugin({ transport }),
    () => namespace.createEduFishPlugin(transport),
    () => namespace.createEduFishPlugin({ transport, manifest: namespace.manifest }),
  ];
  const failures = [];
  for (const attempt of attempts) {
    try {
      const plugin = attempt();
      if (isPlugin(plugin)) return plugin;
      failures.push("factory returned an object without operations");
    } catch (error) {
      failures.push(sanitizeText(error?.message ?? error));
    }
  }
  throw new Error(
    `createEduFishPlugin did not return a plugin with operations: ${failures.join("; ")}`,
  );
}

function isPlugin(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.id === "string" &&
      Array.isArray(value.operations) &&
      value.operations.length > 0,
  );
}

/**
 * Build the HTTP transport exported by the plugin package.
 */
export function createHttpTransportFromModule(namespace, options) {
  if (!options || typeof options !== "object") {
    throw new Error("createHttpTransportFromModule requires options");
  }
  if (typeof options.baseUrl !== "string" || !options.baseUrl.trim()) {
    throw new Error("baseUrl is required");
  }
  if (typeof options.getAccessToken !== "function") {
    throw new Error("getAccessToken callback is required");
  }

  const timeoutMs =
    Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 15000;
  const transportOptions = {
    baseUrl: options.baseUrl.replace(/\/+$/, ""),
    getAccessToken: options.getAccessToken,
    timeoutMs,
  };
  const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
  if (fetchImpl) transportOptions.fetch = fetchImpl;
  return namespace.createHttpTransport(transportOptions);
}

/**
 * Invoke one operation through the plugin's own validation/execute path.
 */
export async function invokeOperation(plugin, name, input, invocation) {
  const operation = plugin.operations.find((item) => item?.name === name);
  if (!operation) {
    const available = plugin.operations.map((item) => item?.name).filter(Boolean).join(", ");
    throw new Error(`Unknown operation "${name}". Available: ${available}`);
  }
  if (typeof operation.execute !== "function") {
    throw new Error(`Operation "${name}" does not expose execute().`);
  }
  return operation.execute(input, invocation);
}

export function buildInvocation({
  userId,
  sessionId,
  requestId,
  signal,
  onEvent,
} = {}) {
  if (!userId) throw new Error("invocation scope.userId is required");
  if (!sessionId) throw new Error("invocation scope.sessionId is required");
  const invocation = { scope: { userId, sessionId } };
  if (requestId !== undefined && requestId !== null && requestId !== "") {
    invocation.requestId = requestId;
  }
  if (signal) invocation.signal = signal;
  if (onEvent) invocation.onEvent = onEvent;
  return invocation;
}

function redact(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return value;
  if (typeof value === "string") {
    return JWT_LIKE_VALUE.test(value) ? "[redacted-token]" : value.slice(0, 2000);
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (typeof value === "object") {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (TOKEN_LIKE_KEYS.test(key)) {
        output[key] = "[redacted]";
      } else {
        output[key] = redact(item, depth + 1);
      }
    }
    return output;
  }
  return value;
}

/**
 * Return a safe, printable error description (no credentials/headers).
 */
export function describeError(error) {
  const info = {
    name: typeof error?.name === "string" ? error.name : "Error",
    message: sanitizeText(error?.message ?? error),
  };
  for (const key of ["code", "status", "statusCode", "operation", "requestId"]) {
    if (error?.[key] !== undefined && error?.[key] !== null) info[key] = error[key];
  }
  if (error?.details && typeof error.details === "object") {
    info.details = redact(error.details);
  }
  if (Array.isArray(error?.issues)) {
    info.issues = error.issues.slice(0, 20).map((issue) => ({
      path: Array.isArray(issue?.path) ? issue.path.join(".") : String(issue?.path ?? ""),
      message: sanitizeText(issue?.message ?? ""),
      code: issue?.code,
    }));
  }
  return info;
}

export function errorCode(error) {
  const candidates = [
    error?.code,
    error?.error?.code,
    error?.details?.code,
    error?.cause?.code,
    error?.response?.code,
  ];
  return candidates.find((value) => typeof value === "string" && value) ?? null;
}

export function errorStatus(error) {
  const candidates = [
    error?.status,
    error?.statusCode,
    error?.details?.status,
    error?.cause?.status,
    error?.response?.status,
  ];
  return candidates.find((value) => Number.isInteger(value)) ?? null;
}

export function errorLooksLike(error, { code, status } = {}) {
  const actualCode = errorCode(error);
  const actualStatus = errorStatus(error);
  if (code && actualCode === code) return true;
  if (status && actualStatus === status) return true;
  if (code) {
    const serialized = JSON.stringify(describeError(error));
    if (serialized.includes(code)) return true;
    if (String(error?.message ?? "").includes(code)) return true;
  }
  return false;
}
