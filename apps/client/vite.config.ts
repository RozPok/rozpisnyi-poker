import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

// Resolve the shared package to its TypeScript source directly.
// This means Vite always reads the latest code without any pre-bundle caching.
// Using the dist/ CJS output via optimizeDeps.include is unreliable because
// Vite's cache invalidation doesn't track changes to individual dist files.
const sharedSrc = fileURLToPath(
  new URL('../../packages/shared/src/index.ts', import.meta.url),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@rozpisnyi-poker/shared': sharedSrc,
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/health': 'http://localhost:3001',
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
