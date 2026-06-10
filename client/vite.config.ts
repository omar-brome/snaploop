import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies API, uploads and websockets to the Express server so the
// client never needs absolute URLs or CORS in development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', changeOrigin: true, ws: true },
    },
  },
});
