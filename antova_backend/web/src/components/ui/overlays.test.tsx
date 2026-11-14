import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Banner } from './Banner'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { Dialog } from './Dialog'

function Harness({ kind }: { kind: 'dialog' | 'sheet' }) {
  const [open, setOpen] = useState(false)
  const Overlay = kind === 'dialog' ? Dialog : BottomSheet
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Behind</button>
      <Overlay open={open} onClose={() => setOpen(false)} labelledBy="overlay-title">
        <h2 id="overlay-title">Share this brief?</h2>
        <button type="button">First</button>
        <button type="button" onClick={() => setOpen(false)}>
          Last
        </button>
      </Overlay>
    </>
  )
}

describe('Dialog', () => {
  it('dialog traps focus and Escape returns focus', async () => {
    const user = userEvent.setup()
    render(<Harness kind="dialog" />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await user.click(opener)

    const dialog = screen.getByRole('dialog', { name: 'Share this brief?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('returns focus to the opener when closed from inside', async () => {
    const user = userEvent.setup()
    render(<Harness kind="dialog" />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await user.click(opener)
    await user.click(screen.getByRole('button', { name: 'Last' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })
})

describe('BottomSheet', () => {
  it('bottom sheet closes on Escape', async () => {
    const user = userEvent.setup()
    render(<Harness kind="sheet" />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await user.click(opener)

    const sheet = screen.getByRole('dialog', { name: 'Share this brief?' })
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('has its own close button inside the trap', async () => {
    const user = userEvent.setup()
    render(<Harness kind="sheet" />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    // Close, First, Last: Tab from Last wraps to the sheet's Close button.
    screen.getByRole('button', { name: 'Last' }).focus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('locks the page scroll while open and restores it on close', async () => {
    const user = userEvent.setup()
    document.documentElement.style.overflow = 'clip'
    try {
      render(<Harness kind="sheet" />)
      await user.click(screen.getByRole('button', { name: 'Open' }))
      expect(document.documentElement.style.overflow).toBe('hidden')
      await user.keyboard('{Escape}')
      expect(document.documentElement.style.overflow).toBe('clip')
    } finally {
      document.documentElement.style.overflow = ''
    }
  })
})

describe('Button and Banner', () => {
  it('a button defaults to type="button" and shows loading as busy and disabled', () => {
    render(
      <>
        <Button>Save override</Button>
        <Button variant="secondary" loading>
          Mark verified
        </Button>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Save override' })).toHaveAttribute('type', 'button')
    const busy = screen.getByRole('button', { name: 'Mark verified' })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')
  })

  it('an error banner is an alert; a draft banner is not', () => {
    render(
      <>
        <Banner variant="draft">Draft. Only you can see this.</Banner>
        <Banner variant="error">Couldn't update the prices. Showing the last ones.</Banner>
      </>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't update the prices.")
    expect(screen.getByText('Draft. Only you can see this.').closest('[role="alert"]')).toBeNull()
  })
})
