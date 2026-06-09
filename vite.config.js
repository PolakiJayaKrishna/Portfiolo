import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Portfiolo/',
  build: { 
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  }
});
