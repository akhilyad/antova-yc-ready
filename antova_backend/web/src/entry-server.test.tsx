import { QueryClientProvider } from '@tanstack/react-query'
import { act, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from './api/queryClient'
import { render } from './entry-server'
import { AppShell } from './router'

let root: Root | undefined
let container: HTMLElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  vi.restoreAllMocks()
})

describe('entry-server', () => {
  // Development React reports every hydration mismatch (text and attributes) through
  // console.error or onRecoverableError; the production preview reports far less.
  it('the browser hydrates the prerendered landing without a mismatch', async () => {
    const consoleError = vi.spyOn(console, 'error')
    const recoverable: unknown[] = []
    container = document.createElement('div')
    container.innerHTML = render('/')
    document.body.append(container)
    const serverHeading = container.querySelector('h1')
    expect(serverHeading).not.toBeNull()

    await act(async () => {
      root = hydrateRoot(
        container!,
        <StrictMode>
          <QueryClientProvider client={createQueryClient()}>
            <MemoryRouter initialEntries={['/']}>
              <AppShell />
            </MemoryRouter>
          </QueryClientProvider>
        </StrictMode>,
        { onRecoverableError: (error) => recoverable.push(error) },
      )
    })
    // The landing chunk is lazy in the browser: wait until React has taken over its heading.
    await waitFor(() => {
      expect(Object.keys(serverHeading!).some((key) => key.startsWith('__reactFiber'))).toBe(true)
    })

    expect(container.querySelector('h1')).toBe(serverHeading)
    expect(recoverable).toEqual([])
    expect(consoleError).not.toHaveBeenCalled()
  })
})
