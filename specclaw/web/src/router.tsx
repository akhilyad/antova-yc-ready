import { lazy, Suspense, useRef, type ComponentType } from 'react'
import { Link, Route, Routes } from 'react-router'
import { copy } from './content/copy'

// Spec §5.3. Each page is its own chunk.
const LazyLanding = lazy(() => import('./pages/Landing'))
const Brief = lazy(() => import('./pages/Brief'))
const ReviewIndex = lazy(() => import('./pages/ReviewIndex'))
const ReviewBrief = lazy(() => import('./pages/ReviewBrief'))
const Legal = lazy(() => import('./pages/Legal'))
const NotFound = lazy(() => import('./pages/NotFound'))

export type AppRoutesProps = {
  /**
   * The landing page component: its lazy chunk unless given. The prerender passes the page
   * itself, because a server render to a string cannot wait for a lazy import.
   */
  landing?: ComponentType
}

export function AppRoutes({ landing: Landing = LazyLanding }: AppRoutesProps) {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/b/:shareId" element={<Brief />} />
      <Route path="/review" element={<ReviewIndex />} />
      <Route path="/review/:tenderId" element={<ReviewBrief />} />
      <Route path="/impressum" element={<Legal page="impressum" />} />
      <Route path="/privacy" element={<Legal page="privacy" />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

/** Page chrome shared by every route. Wrap in a router (BrowserRouter, MemoryRouter, StaticRouter). */
export function AppShell({ landing }: AppRoutesProps) {
  const mainRef = useRef<HTMLElement>(null)
  return (
    <>
      {/*
       * The skip link focuses main itself instead of following "#main": on a brief the URL
       * hash is the selected footnote, and the skip link must not overwrite it.
       */}
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault()
          mainRef.current?.focus()
        }}
      >
        {copy.shell.skipLink}
      </a>
      <header className="site-header">
        <nav aria-label={copy.shell.navLabel} className="site-header__nav">
          <Link className="site-header__home" to="/">
            {copy.meta.siteName}
          </Link>
        </nav>
      </header>
      <main id="main" tabIndex={-1} ref={mainRef}>
        <Suspense fallback={null}>
          <AppRoutes landing={landing} />
        </Suspense>
      </main>
      <footer className="site-footer">
        <p>{copy.shell.footer}</p>
        {/* On every route: the Impressum must be reachable from each page (German §5 DDG). */}
        <ul className="site-footer__links">
          <li>
            <Link to="/impressum">{copy.legal.impressum}</Link>
          </li>
          <li>
            <Link to="/privacy">{copy.legal.privacy}</Link>
          </li>
        </ul>
      </footer>
    </>
  )
}
