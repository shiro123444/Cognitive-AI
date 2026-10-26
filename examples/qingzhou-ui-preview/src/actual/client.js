import { createEduFishPlugin, createHttpTransport } from '@edufish/plugin';

export const DEV_USER_ID = 'fixture-student';

/** Set by Vite at build time; false when the loopback proxy is not running. */
export const HTTP_AVAILABLE =
  typeof __EDUFISH_PREVIEW_HTTP__ !== 'undefined' && __EDUFISH_PREVIEW_HTTP__ === true;

let plugin = null;
let cachedToken = null;
let tokenRequest = null;

/**
 * Dev-only handshake against the existing fixture endpoint.
 *
 * Vite adds the per-run handshake header server-side. The JWT is kept in this
 * module's memory for the lifetime of the page: no localStorage, no cookies,
 * no logging and no token in the URL beyond the seeded fixture user id.
 */
async function getDevToken() {
  if (cachedToken) return cachedToken;
  if (!tokenRequest) {
    tokenRequest = (async () => {
      const response = await fetch(
        `/__fixture__/token?user_id=${encodeURIComponent(DEV_USER_ID)}`,
        {
          method: 'GET',
          headers: { accept: 'application/json' },
          cache: 'no-store',
          credentials: 'omit',
        },
      );
      let body = null;
      try {
        body = await response.json();
      } catch {
        throw new Error('Fixture token handshake returned a non-JSON response.');
      }
      const token = body?.data?.token;
      if (!response.ok || body?.success !== true || typeof token !== 'string' || !token) {
        throw new Error('Fixture token handshake was rejected.');
      }
      cachedToken = token;
      return token;
    })().finally(() => {
      tokenRequest = null;
    });
  }
  return tokenRequest;
}

/** Create (or reuse) the real plugin over the loopback HTTP proxy. */
function getActualPlugin() {
  if (plugin) return plugin;

  const transport = createHttpTransport({
    baseUrl: window.location.origin,
    getAccessToken: () => getDevToken(),
    timeoutMs: 20_000,
  });

  plugin = createEduFishPlugin({ transport });
  return plugin;
}

// Stable business client, lazy transport creation. React StrictMode may clean
// up and replay effects on initial mount; never retain a disposed plugin in
// the provider's memoized value after that replay.
const actualClient = {
  invoke(operation, input, invocation) {
    return getActualPlugin().invoke(operation, input, invocation);
  },
};

export function getActualClient() {
  return actualClient;
}

/** Drop in-memory credentials and transport state on mode change. */
export function disposeActualClient() {
  plugin?.dispose();
  plugin = null;
  cachedToken = null;
  tokenRequest = null;
}
