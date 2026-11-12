import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: { host: true, port: 5210, strictPort: true, allowedHosts: true },
  preview: { host: true, port: 5210, allowedHosts: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
