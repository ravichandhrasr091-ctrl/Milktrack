import { defineConfig } from 'vite';

export default defineConfig({
  root: 'release-site',
  base: './',
  build: {
    outDir: '../release-site-dist',
    emptyOutDir: true,
  },
});
