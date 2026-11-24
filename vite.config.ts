import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  // Public-directory files bypass Vite's filesystem deny filter.
  publicDir: false,
  // https://vite.dev/config/server-options#server-host
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    cors: false,
    // Preserve Vite defaults and keep local exports off static/module routes.
    // https://vite.dev/config/server-options#server-fs-deny
    fs: {
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem,key,p12,pfx,cer,der}',
        '.npmrc',
        '.yarnrc.yml',
        '**/.git/**',
        '**/local/**',
        '**/*-schema.json',
        '**/dexie-cloud.json',
      ],
    },
    // Preserve Host and browser-origin context for the backend request guard.
    // https://vite.dev/config/server-options#server-proxy
    proxy: {
      '/api/': { target: 'http://127.0.0.1:3001', changeOrigin: false },
    },
  },
});
