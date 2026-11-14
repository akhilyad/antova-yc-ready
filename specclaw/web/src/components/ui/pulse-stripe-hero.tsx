import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import styles from './PulseStripeHero.module.css'

export interface StatItem {
  value: number
  decimals?: number
  prefix?: string
  suffix?: string
  label: string
}

export interface CtaLink {
  label: string
  href?: string
  onClick?: () => void
}

export interface Palette {
  from: string
  to: string
  glow: string
  ink: string
}

export const PALETTES: Record<string, Palette> = {
  specclaw: {
    from: '#FAF8F5',
    to: '#F3EFE6',
    glow: '#9E2B1F', // Signature Oxblood
    ink: '#16130F',
  },
  paper: {
    from: '#F2EBDD',
    to: '#E3D8C3',
    glow: '#D6421D',
    ink: '#1A1612',
  },
  sodium: {
    from: '#1C140C',
    to: '#070605',
    glow: '#FFA64D',
    ink: '#F5E9D6',
  },
  mercury: {
    from: '#151A20',
    to: '#06080B',
    glow: '#D6E4F2',
    ink: '#EDF2F7',
  },
}

export interface PulseStripeHeroProps {
  eyebrow?: string
  title?: string
  description?: string
  cta?: CtaLink
  stats?: readonly StatItem[]
  logos?: readonly string[]
  statement?: string
  statementLabel?: string
  palette?: 'sodium' | 'paper' | 'mercury' | 'specclaw' | Palette
  stripes?: number
  height?: string
  className?: string
  children?: ReactNode
  afterCard?: ReactNode
}

/** Formats a numeric stat with commas and optional decimals, prefix, and suffix. */
export function formatStat(value: number, decimals = 0, prefix = '', suffix = ''): string {
  const fixed = Math.max(0, value).toFixed(decimals)
  const [whole, dec] = fixed.split('.')
  const withCommas = (whole ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${prefix}${withCommas}${dec ? `.${dec}` : ''}${suffix}`
}

/** Calculates staggering animation delay for vertical stripe light beams. */
function stripeDelay(index: number, total: number, duration = 4.2): number {
  if (total <= 0) return 0
  return -((index / total) * duration * 1.5) % duration
}

/** Parses markdown-style *words* into italic highlighted text. */
function parseRuns(text: string): { text: string; em: boolean }[] {
  return text
    .split('*')
    .map((chunk, i) => ({ text: chunk, em: i % 2 === 1 }))
    .filter((chunk) => chunk.text.length > 0)
}

const LOGO_TYPO_STYLES: readonly CSSProperties[] = [
  { fontWeight: 700, letterSpacing: '-0.03em' },
  { fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: '0.85em' },
  { fontStyle: 'italic', fontWeight: 500 },
  { fontWeight: 400, letterSpacing: '0.04em' },
  { fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase' },
  { fontFamily: 'var(--font-mono, monospace)', fontWeight: 500, letterSpacing: '0.02em' },
]

function AnimatedStatValue({ stat, isVisible }: { stat: StatItem; isVisible: boolean }) {
  const [value, setValue] = useState(stat.value)
  const hasAnimatedRef = useRef(false)

  useEffect(() => {
    if (hasAnimatedRef.current) return
    if (typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    if (!isVisible) return

    hasAnimatedRef.current = true
    let startTimestamp: number | null = null
    const duration = 1600

    const step = (timestamp: number) => {
      if (startTimestamp === null) {
        startTimestamp = timestamp
      }
      const progress = Math.min((timestamp - startTimestamp) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(eased * stat.value)
      if (progress < 1) {
        requestAnimationFrame(step)
      } else {
        setValue(stat.value)
      }
    }

    const rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, [stat.value, isVisible])

  return (
    <span
      className={styles.num}
      aria-label={formatStat(stat.value, stat.decimals, stat.prefix, stat.suffix)}
    >
      {formatStat(value, stat.decimals, stat.prefix, stat.suffix)}
    </span>
  )
}

function StatementReveal({
  statement,
  statementLabel,
}: {
  statement: string
  statementLabel?: string
}) {
  const statementRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(1)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const el = statementRef.current
    if (!el) return

    const onScroll = () => {
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight
      const start = vh * 0.88
      const end = vh * 0.35
      const p = Math.min(Math.max((start - rect.top) / (start - end), 0), 1)
      setProgress(p)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    const rafId = requestAnimationFrame(onScroll)
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  const words = statement.split(/\s+/).filter(Boolean)

  return (
    <div ref={statementRef} className={styles.say}>
      {statementLabel && <span className={styles.sayLab}>{statementLabel}</span>}
      {/* The sentence is read once, whole, from the hidden copy; the animated words are decoration.
          (aria-label is not allowed on a <p>, so it cannot carry the sentence.) */}
      <p className={styles.statementText}>
        <span className={styles.srOnly}>{statement}</span>
        {words.map((word, i) => {
          const threshold = i / Math.max(words.length - 1, 1)
          const isLit = progress >= threshold
          return (
            <Fragment key={i}>
              <span className={`${styles.word} ${isLit ? styles.wordLit : ''}`} aria-hidden="true">
                {word}
              </span>{' '}
            </Fragment>
          )
        })}
      </p>
    </div>
  )
}

export function PulseStripeHero({
  eyebrow,
  title,
  description,
  cta,
  stats,
  logos,
  statement,
  statementLabel,
  palette = 'specclaw',
  stripes = 16,
  height,
  className = '',
  children,
  afterCard,
}: PulseStripeHeroProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const statsRef = useRef<HTMLDListElement>(null)
  const [mounted, setMounted] = useState(false)
  const [statsVisible, setStatsVisible] = useState(false)

  const activePalette =
    typeof palette === 'string' ? (PALETTES[palette] ?? PALETTES.specclaw) : palette

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const statsEl = statsRef.current
    if (!statsEl || typeof IntersectionObserver === 'undefined') {
      const raf = requestAnimationFrame(() => setStatsVisible(true))
      return () => cancelAnimationFrame(raf)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting) {
          setStatsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    observer.observe(statsEl)
    return () => observer.disconnect()
  }, [stats])

  const stripeCount = Math.max(1, Math.round(stripes))
  const paletteStyles = {
    '--psh-from': activePalette?.from,
    '--psh-to': activePalette?.to,
    '--psh-glow': activePalette?.glow,
    '--psh-ink': activePalette?.ink,
  } as CSSProperties

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${mounted ? styles.in : ''} ${className}`}
      style={paletteStyles}
    >
      <div className={styles.card} style={height ? { minHeight: height } : undefined}>
        {/* Animated pulsing vertical stripes */}
        <div className={styles.stripes} aria-hidden="true">
          {Array.from({ length: stripeCount }, (_, i) => (
            <span
              key={i}
              className={styles.col}
              style={{
                transitionDelay: `${0.2 + Math.abs(i - (stripeCount - 1) / 2) * 0.04}s`,
              }}
            >
              <i
                className={styles.pulse}
                style={{ animationDelay: `${stripeDelay(i, stripeCount)}s` }}
              />
            </span>
          ))}
        </div>

        {/* Ambient lighting & texture overlays */}
        <div className={styles.lamp} aria-hidden="true" />
        <div className={styles.shade} aria-hidden="true" />
        <div className={styles.grain} aria-hidden="true" />

        {/* Inner Content */}
        <div className={styles.inner}>
          {children ? (
            children
          ) : (
            <div className={styles.top}>
              {eyebrow && (
                <div className={`${styles.eyebrow} ${styles.fade}`}>
                  <span className={styles.eyebrowDot} aria-hidden="true" />
                  <span>{eyebrow}</span>
                </div>
              )}

              {title && (
                <h1 className={styles.h}>
                  <span className={styles.line}>
                    <span>
                      {parseRuns(title).map((run, i) =>
                        run.em ? (
                          <em key={i}>{run.text}</em>
                        ) : (
                          <Fragment key={i}>{run.text}</Fragment>
                        ),
                      )}
                    </span>
                  </span>
                </h1>
              )}

              {description && <p className={`${styles.desc} ${styles.fade}`}>{description}</p>}

              {cta && (
                <a
                  href={cta.href ?? '#'}
                  onClick={cta.onClick}
                  className={`${styles.cta} ${styles.fade}`}
                >
                  <span>{cta.label}</span>
                  <span className={styles.ctaIcon} aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M3 8h10M9 4l4 4-4 4"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </a>
              )}
            </div>
          )}

          {/* Stats Bar */}
          {stats && stats.length > 0 && (
            <dl ref={statsRef} className={styles.stats}>
              {stats.map((stat, i) => (
                <div key={i} className={styles.stat}>
                  <dt className={styles.lab}>{stat.label}</dt>
                  <dd style={{ margin: 0 }}>
                    <AnimatedStatValue stat={stat} isVisible={statsVisible} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      {afterCard}

      {/* Drifting Marquee Logo/Vendor Band */}
      {logos && logos.length > 0 && (
        <div className={styles.band} aria-label="Key Documents & Bidders">
          <div className={styles.track}>
            {[0, 1].map((copyIdx) => (
              <div
                key={copyIdx}
                className={styles.trackGroup}
                aria-hidden={copyIdx === 1 ? 'true' : undefined}
              >
                {logos.map((logo, i) => (
                  <span
                    key={`${copyIdx}-${i}`}
                    className={styles.mark}
                    style={LOGO_TYPO_STYLES[i % LOGO_TYPO_STYLES.length]}
                  >
                    {logo}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scroll-Driven Statement Reveal */}
      {statement && <StatementReveal statement={statement} statementLabel={statementLabel} />}
    </div>
  )
}

export default PulseStripeHero
