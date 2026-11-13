import { describe, expect, it } from 'vitest'
import { formatAdder, formatEur, toCents, toDecimalString } from './money'

describe('toCents', () => {
  it('rounds half-up at the third decimal', () => {
    expect(toCents('8.505')).toBe(851)
    expect(toCents('8.504')).toBe(850)
  })

  it('rounds half away from zero for negatives', () => {
    expect(toCents('-8.505')).toBe(-851)
    expect(toCents('-8.504')).toBe(-850)
  })

  it('accepts numbers without float error', () => {
    expect(toCents(8.505)).toBe(851)
    expect(toCents(1.005)).toBe(101)
    expect(toCents(482800)).toBe(48280000)
    expect(toCents(0)).toBe(0)
  })

  it('accepts numeric strings as the backend sends Decimals', () => {
    expect(toCents('1600.00')).toBe(160000)
    expect(toCents('1600.5')).toBe(160050)
    expect(toCents('.5')).toBe(50)
    expect(toCents('1e3')).toBe(100000)
  })

  it('never returns negative zero (decimal.js-light has no -0)', () => {
    expect(Object.is(toCents('-0.001'), 0)).toBe(true)
    expect(Object.is(toCents(-0), 0)).toBe(true)
  })

  it.each([NaN, Infinity, -Infinity])('throws RangeError on %s', (value) => {
    expect(() => toCents(value)).toThrow(RangeError)
  })

  it.each(['abc', '', ' 8.5', 'NaN', 'Infinity', '0x10', '1,600'])(
    'throws RangeError on the string %j',
    (value) => {
      expect(() => toCents(value)).toThrow(RangeError)
    },
  )

  it('throws RangeError when the cents exceed the safe-integer range', () => {
    expect(() => toCents('1e20')).toThrow(RangeError)
  })
})

describe('formatEur', () => {
  it('shows whole euros without decimals', () => {
    expect(formatEur(48280000)).toBe('€482,800')
    expect(formatEur(100)).toBe('€1')
    expect(formatEur(0)).toBe('€0')
  })

  it('shows two decimals when there are cents', () => {
    expect(formatEur(160050)).toBe('€1,600.50')
    expect(formatEur(5)).toBe('€0.05')
    expect(formatEur(99)).toBe('€0.99')
  })

  it('groups thousands with commas', () => {
    expect(formatEur(99900)).toBe('€999')
    expect(formatEur(100000)).toBe('€1,000')
    expect(formatEur(123456789012)).toBe('€1,234,567,890.12')
  })

  it('prefixes negatives with U+2212 before the euro sign', () => {
    expect(formatEur(-160050)).toBe('−€1,600.50')
    expect(formatEur(-48280000)).toBe('−€482,800')
  })

  it('formats negative zero as zero', () => {
    expect(formatEur(-0)).toBe('€0')
  })

  it.each([1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'throws RangeError on non-integer cents %s',
    (value) => {
      expect(() => formatEur(value)).toThrow(RangeError)
    },
  )
})

describe('formatAdder', () => {
  it('prefixes positive adders with a plus sign', () => {
    expect(formatAdder(1850000)).toBe('+€18,500')
    expect(formatAdder(160050)).toBe('+€1,600.50')
  })

  it('shows zero without a sign', () => {
    expect(formatAdder(0)).toBe('€0')
    expect(formatAdder(-0)).toBe('€0')
  })

  it('shows negatives with U+2212', () => {
    expect(formatAdder(-160050)).toBe('−€1,600.50')
  })

  it('throws RangeError on non-integer cents', () => {
    expect(() => formatAdder(0.5)).toThrow(RangeError)
  })
})

describe('toDecimalString', () => {
  it('writes two decimal places from integer cents', () => {
    expect(toDecimalString(1850050)).toBe('18500.50')
    expect(toDecimalString(1850000)).toBe('18500.00')
    expect(toDecimalString(7)).toBe('0.07')
    expect(toDecimalString(0)).toBe('0.00')
    expect(toDecimalString(-250)).toBe('-2.50')
  })

  it('round-trips through toCents', () => {
    for (const cents of [1, 99, 100, 160000, 9999999999]) {
      expect(toCents(toDecimalString(cents))).toBe(cents)
    }
  })

  it('rejects non-integer cents', () => {
    expect(() => toDecimalString(1.5)).toThrow(RangeError)
    expect(() => toDecimalString(Number.NaN)).toThrow(RangeError)
  })
})
