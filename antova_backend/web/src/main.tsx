import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { createQueryClient } from './api/queryClient'
import './design/fonts.css'
import './design/tokens.css'
import './design/base.css'
import { AppShell } from './router'

const root = document.getElementById('root')
if (!root) throw new Error('#root is missing from index.html')

const queryClient = createQueryClient()

const app = (
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)

// dist/index.html carries the prerendered landing page (scripts/prerender.ts), which React
// takes over in place. Every other route is served the empty shell, dist/app.html.
if (location.pathname === '/' && root.firstElementChild !== null) {
  hydrateRoot(root, app)
} else {
  createRoot(root).render(app)
}
