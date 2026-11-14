/**
 * The server render of the landing page, used by scripts/prerender.ts after `vite build`
 * (spec §5.1). It renders the same tree as main.tsx, with StaticRouter in place of
 * BrowserRouter and the landing page imported directly instead of as a lazy chunk, so the
 * HTML is complete and the browser can hydrate it without a mismatch. Nothing here, and
 * nothing the landing page renders, may touch window or document.
 */
import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { createQueryClient } from './api/queryClient'
import Landing from './pages/Landing'
import { AppShell } from './router'

/** React's marker for a Suspense boundary whose server render threw (it falls back to the client). */
const CLIENT_RENDER_MARKER = '<!--$!-->'

/**
 * The app's HTML at `url`. Only `/` is prerendered; other routes render in the browser.
 * Throws if any part of the page failed to render on the server: React would otherwise
 * hand that part to the browser silently, and the prerendered page would be empty.
 */
export function render(url: string): string {
  const html = renderToString(
    <StrictMode>
      <QueryClientProvider client={createQueryClient()}>
        <StaticRouter location={url}>
          <AppShell landing={Landing} />
        </StaticRouter>
      </QueryClientProvider>
    </StrictMode>,
  )
  if (html.includes(CLIENT_RENDER_MARKER)) {
    const reason = /data-msg="([^"]*)"/.exec(html)?.[1] ?? 'unknown error'
    throw new Error(`The server render of ${url} failed: ${reason}`)
  }
  return html
}
