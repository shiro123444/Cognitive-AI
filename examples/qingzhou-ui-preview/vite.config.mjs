import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The harness is intentionally same-origin with its Vite dev server.
 *
 * In actual HTTP mode the orchestration script starts
 * examples/plugin-host/fixture_server.py and passes EDUFISH_FIXTURE_URL plus
 * the per-run EDUFISH_FIXTURE_HANDSHAKE. Vite proxies the production plugin
 * route and the fixture's dev-only handshake route to loopback. The handshake
 * secret never reaches the browser; the minted token stays in page memory.
 */
export default defineConfig(() => {
  const fixtureUrl = process.env.EDUFISH_FIXTURE_URL;
  const handshake = process.env.EDUFISH_FIXTURE_HANDSHAKE;
  const httpMode = Boolean(fixtureUrl && handshake);

  const proxy = httpMode
    ? {
        '/__fixture__': {
          target: fixtureUrl,
          changeOrigin: true,
          configure(instance) {
            instance.on('proxyReq', (proxyReq, request) => {
              // Only the dev token handshake needs the secret. Other fixture
              // routes remain unreachable without their own credentials.
              if (request.url?.startsWith('/__fixture__/token')) {
                proxyReq.setHeader('X-Fixture-Handshake', handshake);
              }
            });
          },
        },
        '/api/v1/plugin': {
          target: fixtureUrl,
          changeOrigin: true,
        },
      }
    : undefined;

  return {
    plugins: [react()],
    define: {
      __EDUFISH_PREVIEW_HTTP__: JSON.stringify(httpMode),
    },
    resolve: {
      // The adapter is a local file: dependency (symlinked) and has its own
      // devDependencies. Force one host copy so React context, antd
      // ConfigProvider and the i18next instance are shared at runtime.
      dedupe: [
        '@edufish/plugin',
        '@lobehub/ui',
        'antd',
        'antd-style',
        'i18next',
        'lucide-react',
        'react',
        'react-dom',
        'react-i18next',
      ],
    },
    server: {
      host: '127.0.0.1',
      port: Number(process.env.EDUFISH_PREVIEW_PORT || 5174),
      strictPort: false,
      proxy,
    },
    preview: {
      host: '127.0.0.1',
      port: Number(process.env.EDUFISH_PREVIEW_PORT || 4174),
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
