import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import baseCss from '../design/base.css?raw'
import { AppShell } from '../router'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell />
    </MemoryRouter>,
  )
}

describe('routing shell', () => {
  it('renders the not-found page for unknown routes', async () => {
    renderAt('/nope')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/')
  })

  it('sets the document title per route', async () => {
    renderAt('/nope')
    await waitFor(() => expect(document.title).toBe('Page not found · SpecClaw'))
  })

  it('app shell has a skip link to main', async () => {
    renderAt('/nope')
    await screen.findByRole('heading', { level: 1 })
    const skip = screen.getByRole('link', { name: 'Skip to content' })
    expect(skip).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('keeps anchored content clear of the sticky nav', () => {
    expect(baseCss).toContain('scroll-padding-top: var(--nav-height-total)')
  })
})
