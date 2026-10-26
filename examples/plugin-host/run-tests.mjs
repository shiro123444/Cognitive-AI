#!/usr/bin/env node
/**
 * Run the Python fixture tests with the backend virtualenv.
 *
 * Usage: node run-tests.mjs [pytest args...]
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { EXAMPLE_DIR } from "./lib/plugin-package.mjs";

const PYTHON_CANDIDATES = [
  process.env.EDUFISH_PYTHON,
  path.join(EXAMPLE_DIR, "..", "..", "backend", ".venv", "Scripts", "python.exe"),
  path.join(EXAMPLE_DIR, "..", "..", "backend", ".venv", "bin", "python"),
].filter(Boolean);

const python = PYTHON_CANDIDATES.find((candidate) => existsSync(candidate));
if (!python) {
  process.stderr.write(
    "Could not find backend/.venv Python. Set EDUFISH_PYTHON to an interpreter with " +
      "the backend requirements installed.\n",
  );
  process.exit(2);
}

const child = spawn(python, ["-m", "pytest", "tests", "-q", ...process.argv.slice(2)], {
  cwd: EXAMPLE_DIR,
  stdio: "inherit",
  windowsHide: true,
});

child.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
