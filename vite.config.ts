import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Relative base so the build works from a GitHub Pages project subpath.
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 8000,
    rolldownOptions: {
      input: {
        game: resolve(import.meta.dirname, 'index.html'),
        editor: resolve(import.meta.dirname, 'editor/index.html'),
      },
    },
  },
});
