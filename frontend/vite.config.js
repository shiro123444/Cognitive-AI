import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3025,
    allowedHosts: ['edufish.wbuai.me'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001',
        rewrite: (path) => path.replace(/^\/api/, '/api/v1')
      },
      '/health': 'http://127.0.0.1:5001',
      '/runtime': 'http://127.0.0.1:4000'
    }
  },
  preview: {
    port: 3025
  }
});
