import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    // Views are lazy-loaded via the router; the heavy libs below are split
    // into stable vendor chunks so they (a) only load when their view is
    // visited and (b) cache independently from app code.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/echarts')) return 'vendor-echarts';
          if (id.includes('node_modules/@niivue')) return 'vendor-niivue';
          if (id.includes('node_modules/three')) return 'vendor-three';
          if (id.includes('node_modules/gsap')) return 'vendor-gsap';
          if (id.includes('node_modules/d3')) return 'vendor-d3';
        },
      },
    },
  },
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
