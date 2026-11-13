import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_RATES } from '../../api/client'
import type { Rates } from '../../api/schemas'
import { copy } from '../../content/copy'
import { SensitivitySliders } from './SensitivitySliders'

function Harness({ onReset, onChange }: { onReset: () => void; onChange: (r: Rates) => void }) {
  const [rates, setRates] = useState<Rates>(DEFAULT_RATES)
  return (
    <SensitivitySliders
      rates={rates}
      onChange={(next) => {
        onChange(next)
        setRates(next)
      }}
      onReset={onReset}
    />
  )
}

describe('SensitivitySliders', () => {
  it('reset restores DEFAULT_RATES and fires onReset', () => {
    const onReset = vi.fn()
    const onChange = vi.fn()
    render(<Harness onReset={onReset} onChange={onChange} />)

    fireEvent.change(screen.getByRole('slider', { name: copy.brief.rates.copper }), {
      target: { value: '1.85' },
    })
    fireEvent.change(screen.getByRole('slider', { name: copy.brief.rates.labour }), {
      target: { value: '120' },
    })
    expect(onChange).toHaveBeenLastCalledWith({ copper: 1.85, labour: 120, freight: 1 })
    expect(screen.getByRole('slider', { name: copy.brief.rates.labour })).toHaveValue('120')

    fireEvent.click(screen.getByRole('button', { name: copy.brief.rates.reset }))
    expect(onChange).toHaveBeenLastCalledWith(DEFAULT_RATES)
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('slider', { name: copy.brief.rates.copper })).toHaveValue(
      String(DEFAULT_RATES.copper),
    )
    expect(screen.getByRole('slider', { name: copy.brief.rates.labour })).toHaveValue(
      String(DEFAULT_RATES.labour),
    )
    expect(screen.getByRole('slider', { name: copy.brief.rates.freight })).toHaveAttribute(
      'aria-valuetext',
      '1.00 times the rate table',
    )
  })
})
