import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3025,
    allowedHosts: ['edufish.wbuai.me'],
    proxy: {
      '/api': 'http://127.0.0.1:5001',
      '/health': 'http://127.0.0.1:5001'
    }
  },
  preview: {
    port: 3025
  }
});
