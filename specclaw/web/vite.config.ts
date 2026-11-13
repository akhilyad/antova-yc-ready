import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * `npm run preview` serves routes the way the deployed site does: dist/index.html (the
 * prerendered landing) at `/` only, and the empty shell dist/app.html for every other page.
 */
function appShellFallback(): Plugin {
  return {
    name: 'antova-app-shell-fallback',
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = (req.url ?? '/').split('?')[0] ?? '/'
        const page = req.method === 'GET' && !path.includes('.') && !path.startsWith('/api/')
        if (page && path !== '/') req.url = '/app.html'
        next()
      })
    },
  }
}

export default defineConfig(({ isSsrBuild = false }) => ({
  plugins: [react(), appShellFallback()],
  build: isSsrBuild
    ? {
        // The server bundle (npm run prerender) imports the landing page directly, where the
        // browser's router loads it lazily; that is intended, so no warning about it.
        rolldownOptions: { checks: { ineffectiveDynamicImport: false } },
      }
    : {
        // scripts/prerender.ts reads it to link the landing chunk's CSS, then deletes it.
        manifest: true,
      },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    // Vitest blanks CSS by default; let `?raw` imports through so tests can assert on tokens.
    css: { include: [/\.css\?raw$/] },
    // `npm run test:coverage` (ruling R16) measures the domain layer; the target is 100 % lines.
    coverage: {
      provider: 'v8',
      include: ['src/domain/**'],
      exclude: ['src/**/*.test.{ts,tsx}'],
      reporter: [['text', { skipFull: false }]],
    },
  },
}))
