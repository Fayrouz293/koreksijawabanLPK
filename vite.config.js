import { defineConfig } from 'vite';

export default defineConfig({
  server: { proxy: { '/api': 'http://localhost:8787' }, host: true },
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 16000, target: 'es2020' },
});
