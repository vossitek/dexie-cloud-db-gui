import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  // https://vite.dev/config/server-options#server-host
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    cors: false,
    // Preserve Host and browser-origin context for the backend request guard.
    // https://vite.dev/config/server-options#server-proxy
    proxy: {
      '/api/': { target: 'http://127.0.0.1:3001', changeOrigin: false },
    },
  },
});
