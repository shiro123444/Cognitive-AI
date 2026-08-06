import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'EduFishVue',
      fileName: (format) => `edufish-vue.${format}.js`,
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: ['vue', 'd3', 'gsap', 'd3-force'],
      output: {
        globals: {
          vue: 'Vue',
          d3: 'd3',
          gsap: 'gsap',
          'd3-force': 'd3',
        },
        assetFileNames: 'edufish-graph.[ext]',
      },
    },
    cssCodeSplit: false,
  },
});
