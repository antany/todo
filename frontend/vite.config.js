import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Served under this path (the backend's server.servlet.context-path), so a reverse proxy can route on it.
const base = '/todo/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Todo',
        short_name: 'Todo',
        description: 'Todo lists that work offline and can be shared.',
        start_url: `${base}all`,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#eef2fa',
        theme_color: '#3949ab',
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the app shell is cached. API calls always go to the network, and their
        // URLs must never be answered with index.html.
        navigateFallback: `${base}index.html`,
        // /oauth2 and /login/oauth2 are the Google sign-in redirects: the server must answer them, never index.html.
        navigateFallbackDenylist: [/^\/todo\/api\//, /^\/todo\/oauth2\//, /^\/todo\/login\/oauth2\//],
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        importScripts: [`${base}notification-click.js`],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  server: {
    proxy: {
      [`${base}api`]: 'http://localhost:8080',
      [`${base}oauth2`]: 'http://localhost:8080',
      [`${base}login/oauth2`]: 'http://localhost:8080',
    },
  },
});
