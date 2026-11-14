import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { createQueryClient } from '../../api/queryClient'
import { copy } from '../../content/copy'
import { TENDER_ID, TEST_REVIEW_TOKEN } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { OverrideForm, parseEuroInput } from './OverrideForm'

const CELL = { paramId: 'PARAM-05', vendorId: 'vendor-c' }
const MESSAGE = 'Use digits only, e.g. 18500 or 18500.50'

function renderForm(props: Partial<Parameters<typeof OverrideForm>[0]> = {}) {
  const client = createQueryClient({ retryDelay: 0 })
  return render(
    <QueryClientProvider client={client}>
      <OverrideForm
        tenderId={TENDER_ID}
        token={TEST_REVIEW_TOKEN}
        cell={CELL}
        override={undefined}
        locked={false}
        {...props}
      />
    </QueryClientProvider>,
  )
}

describe('parseEuroInput', () => {
  it('rejects comma and three-digit-dot amounts', () => {
    for (const raw of [
      '18.500',
      '1,600',
      '1.600,00',
      '18500.505',
      '-5',
      '1e3',
      '',
      '.5',
      '123456789',
    ]) {
      expect(parseEuroInput(raw)).toEqual({ ok: false, message: MESSAGE })
    }
    expect(parseEuroInput('18500.5')).toEqual({ ok: true, cents: 1850050 })
    expect(parseEuroInput('18500')).toEqual({ ok: true, cents: 1850000 })
    expect(parseEuroInput('18500.50')).toEqual({ ok: true, cents: 1850050 })
    expect(parseEuroInput('0.07')).toEqual({ ok: true, cents: 7 })
    expect(parseEuroInput('99999999.99')).toEqual({ ok: true, cents: 9999999999 })
  })
})

describe('OverrideForm', () => {
  it('amount and note errors set aria-invalid and aria-describedby', async () => {
    const user = userEvent.setup()
    let puts = 0
    server.use(
      http.put('/api/review/tenders/:tenderId/overrides/:paramId/:vendorId', () => {
        puts += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderForm()
    const amount = screen.getByLabelText(copy.review.override.label)
    const note = screen.getByLabelText(copy.review.override.why)
    expect(amount).not.toHaveAttribute('aria-invalid')
    expect(note).toHaveAttribute('placeholder', copy.review.override.whyPlaceholder)

    await user.type(amount, '1,600')
    await user.click(screen.getByRole('button', { name: copy.review.override.save }))
    expect(amount).toHaveAttribute('aria-invalid', 'true')
    expect(amount).toHaveAccessibleDescription(MESSAGE)
    expect(note).toHaveAttribute('aria-invalid', 'true')
    expect(note).toHaveAccessibleDescription(copy.review.override.noteError)
    expect(amount).toHaveFocus()
    expect(puts).toBe(0)

    await user.clear(amount)
    await user.type(amount, '1600')
    await user.type(note, 'Vendor clarification')
    await user.click(screen.getByRole('button', { name: copy.review.override.save }))
    await waitFor(() => expect(puts).toBe(1))
    expect(amount).not.toHaveAttribute('aria-invalid')
    expect(note).not.toHaveAttribute('aria-invalid')
    expect(await screen.findByText(copy.review.override.saved)).toBeInTheDocument()
  })

  it('a 409 says to withdraw the brief first', async () => {
    const user = userEvent.setup()
    server.use(
      http.put('/api/review/tenders/:tenderId/overrides/:paramId/:vendorId', () =>
        HttpResponse.json(
          { detail: 'Withdraw the brief before changing overrides' },
          { status: 409 },
        ),
      ),
    )
    renderForm()
    await user.type(screen.getByLabelText(copy.review.override.label), '1600')
    await user.type(screen.getByLabelText(copy.review.override.why), 'Vendor clarification')
    await user.click(screen.getByRole('button', { name: copy.review.override.save }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Withdraw the brief before changing overrides',
    )
  })

  it('prefills an existing override and offers to remove it', () => {
    renderForm({
      override: { param_id: 'PARAM-05', vendor_id: 'vendor-c', adder_eur: '2600.00', note: 'FAT' },
    })
    expect(screen.getByLabelText(copy.review.override.label)).toHaveValue('2600.00')
    expect(screen.getByLabelText(copy.review.override.why)).toHaveValue('FAT')
    expect(screen.getByRole('button', { name: copy.review.override.remove })).toBeInTheDocument()
  })
})
