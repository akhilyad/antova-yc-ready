import { describe, expect, it } from 'vitest'
import tokensCss from './tokens.css?raw'

// Spec §8.1 colours and the design-skill scales: check them verbatim.
const colours: Record<string, string> = {
  '--paper': '#FAF8F5',
  '--surface': '#FFFFFF',
  '--band': '#F3EFE6',
  '--ink': '#16130F',
  '--ink-2': '#4A443C',
  '--ink-3': '#675F55',
  '--rule': '#E7E5E4',
  '--edge': '#8F877A',
  '--ox': '#9E2B1F',
  '--ox-wash': '#F7EAE6',
}

describe('design tokens', () => {
  it.each(Object.entries(colours))('defines %s as %s', (name, value) => {
    expect(tokensCss).toContain(`${name}: ${value};`)
  })

  // Tailwind's steps only (design-skill B1): nothing in between.
  it.each([12, 14, 16, 18, 20, 24, 30, 36, 48, 60])('has the %i px type step', (px) => {
    expect(tokensCss).toContain(`--text-${px}: ${px}px;`)
  })

  it('defines no off-scale type step', () => {
    const steps = [...tokensCss.matchAll(/--text-(\d+): (\d+)px;/g)].map((m) => Number(m[2]))
    expect(steps.every((px) => [12, 14, 16, 18, 20, 24, 30, 36, 48, 60].includes(px))).toBe(true)
  })

  it('uses one typeface, Geist, for display and UI', () => {
    expect(tokensCss).toMatch(/--font-display: 'Geist Variable'/)
    expect(tokensCss).toMatch(/--font-sans: 'Geist Variable'/)
  })

  it.each([
    ['--duration-hover', '300ms'],
    ['--duration-swap', '300ms'],
    ['--duration-settle', '500ms'],
    ['--duration-stamp', '500ms'],
    ['--duration-reveal', '700ms'],
  ])('defines %s as %s', (name, value) => {
    expect(tokensCss).toContain(`${name}: ${value};`)
  })

  it('uses the design-skill easing and removes motion for reduced-motion users', () => {
    expect(tokensCss).toContain('--ease: cubic-bezier(0.22, 1, 0.36, 1);')
    expect(tokensCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*--duration-hover: 0ms;/,
    )
  })

  it('has no green anywhere', () => {
    expect(tokensCss).not.toMatch(/green/i)
  })
})
