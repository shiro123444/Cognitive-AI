#!/usr/bin/env node
/**
 * Start the existing Python fixture server and Vite on unique loopback ports.
 *
 * - The fixture picks its own free port and its own temporary database.
 * - The handshake secret is generated per run and passed only to the Python
 *   process and the Vite proxy process environment. It never reaches the page.
 * - Every child is stopped and awaited by `withServers`, and a last-resort
 *   exit hook kills anything still alive.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PREVIEW_DIR = resolve(HERE, '..');
export const REPO_ROOT = resolve(PREVIEW_DIR, '..', '..');
const FIXTURE_SERVER = join(REPO_ROOT, 'examples', 'plugin-host', 'fixture_server.py');
const VITE_BIN = join(PREVIEW_DIR, 'node_modules', 'vite', 'bin', 'vite.js');

const liveChildren = new Set();
let exitHookInstalled = false;

function installExitHook() {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.on('exit', () => {
    for (const child of liveChildren) {
      try {
        child.kill();
      } catch {
        // Best effort during process exit.
      }
    }
  });
}

export function resolvePython() {
  const candidates = [
    process.env.EDUFISH_PYTHON,
    join(REPO_ROOT, 'backend', '.venv', 'Scripts', 'python.exe'),
    join(REPO_ROOT, 'backend', '.venv', 'bin', 'python'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    `No backend virtualenv Python found. Set EDUFISH_PYTHON or create backend/.venv. Checked: ${candidates.join(', ')}`,
  );
}

export function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

function collectStderr(child, sink, limit = 16_384) {
  child.stderr?.on('data', (chunk) => {
    sink.text = (sink.text + chunk.toString()).slice(-limit);
  });
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolveExit) => {
    const timer = setTimeout(() => resolveExit(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolveExit(true);
    });
  });
}

export async function startFixture() {
  installExitHook();
  if (!existsSync(FIXTURE_SERVER)) {
    throw new Error(`Fixture server not found at ${FIXTURE_SERVER}.`);
  }

  const python = resolvePython();
  const handshake = randomBytes(24).toString('hex');
  const stderr = { text: '' };
  const child = spawn(
    python,
    [FIXTURE_SERVER, '--host', '127.0.0.1', '--port', '0'],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        EDUFISH_FIXTURE_HANDSHAKE: handshake,
        PYTHONUNBUFFERED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  liveChildren.add(child);
  collectStderr(child, stderr);

  const ready = await new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(() => {
      rejectReady(new Error(`Fixture server did not become ready.\n${stderr.text}`));
    }, 40_000);

    const fail = (message) => {
      clearTimeout(timer);
      rejectReady(new Error(`${message}\n${stderr.text}`));
    };

    child.once('error', (error) => fail(`Failed to start fixture Python: ${error.message}`));
    child.once('exit', (code) => fail(`Fixture server exited before readiness (code ${code}).`));

    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message?.status === 'ready' && typeof message.base_url === 'string') {
        clearTimeout(timer);
        resolveReady(message);
      }
    });
  }).catch(async (error) => {
    try {
      child.kill('SIGKILL');
    } catch {
      // Ignore.
    }
    liveChildren.delete(child);
    throw error;
  });

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;

    try {
      await fetch(`${ready.base_url}/__fixture__/shutdown`, {
        method: 'POST',
        headers: { 'X-Fixture-Handshake': handshake },
        signal: AbortSignal.timeout(2_000),
      });
    } catch {
      // The graceful shutdown route may already be gone; fall through to kill.
    }

    if (!(await waitForExit(child, 5_000))) {
      try {
        child.kill('SIGTERM');
      } catch {
        // Ignore.
      }
      if (!(await waitForExit(child, 3_000))) {
        try {
          child.kill('SIGKILL');
        } catch {
          // Ignore.
        }
      }
    }
    liveChildren.delete(child);
  };

  return {
    baseUrl: ready.base_url,
    handshake,
    pid: child.pid,
    stop,
  };
}

export async function startVite(fixture) {
  installExitHook();
  if (!existsSync(VITE_BIN)) {
    throw new Error(
      `Vite is not installed in the preview package. Run npm install in ${PREVIEW_DIR}.`,
    );
  }

  const port = await getFreePort();
  const stderr = { text: '' };
  const child = spawn(
    process.execPath,
    [VITE_BIN, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: PREVIEW_DIR,
      env: {
        ...process.env,
        EDUFISH_FIXTURE_URL: fixture.baseUrl,
        EDUFISH_FIXTURE_HANDSHAKE: fixture.handshake,
        EDUFISH_PREVIEW_PORT: String(port),
      },
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    },
  );
  liveChildren.add(child);
  collectStderr(child, stderr);
  let spawnError = null;
  child.once('error', (error) => {
    spawnError = error;
  });

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (spawnError) {
      liveChildren.delete(child);
      throw new Error(`Failed to start Vite: ${spawnError.message}`);
    }
    if (child.exitCode !== null) {
      throw new Error(`Vite exited before readiness.\n${stderr.text}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        return {
          url,
          port,
          pid: child.pid,
          stop: async () => {
            try {
              child.kill('SIGTERM');
            } catch {
              // Ignore.
            }
            if (!(await waitForExit(child, 5_000))) {
              try {
                child.kill('SIGKILL');
              } catch {
                // Ignore.
              }
            }
            liveChildren.delete(child);
          },
        };
      }
      lastError = new Error(`Vite returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 400));
  }

  try {
    child.kill('SIGTERM');
  } catch {
    // Ignore.
  }
  throw new Error(
    `Vite did not become ready at ${url}: ${lastError?.message ?? 'timeout'}\n${stderr.text}`,
  );
}

/** Run a callback with both servers, always stopping Vite then the fixture. */
export async function withServers(callback) {
  const fixture = await startFixture();
  let vite = null;
  try {
    vite = await startVite(fixture);
    return await callback({ fixture, vite });
  } finally {
    if (vite) await vite.stop();
    await fixture.stop();
  }
}
