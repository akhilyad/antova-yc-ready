import { animate } from 'motion'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { copy } from '../../content/copy'
import type { VendorLevel } from '../../domain/leveling'
import { formatEur } from '../../domain/money'
import { motionOk } from '../../lib/motionOk'
import { settleMs } from '../../lib/settleMs'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { layoutFlip, pricedLevels, rankChanges } from '../../domain/ranking'
import { MoneyFigure } from '../brief/MoneyFigure'
import { flipSchedule, type FlipProgress } from './flipTimeline'
import styles from './RankingFlip.module.css'

export type RankingFlipProps = {
  levels: readonly VendorLevel[]
  /** Minimum height of the plotted range in px (labels sit inside it); grows with bidders. */
  height?: number
  /**
   * Play the flip once, when half the chart is on screen (the landing's hero). Readers who ask
   * for reduced motion, and browsers without IntersectionObserver, get the final chart.
   */
  play?: boolean
}

/**
 * A label is up to four lines: the name (wrapping to three on a phone, so a full company
 * name isn't cut short) over the price. This keeps neighbours from touching.
 */
const MIN_GAP_PX = 76
/** From 600 px a name is clamped to two lines (RankingFlip.module.css), so labels need less. */
const WIDE_MIN_GAP_PX = 60
const WIDE = '(min-width: 600px)'
/**
 * Room above and below the range: half the tallest label (three name lines over a price), so
 * the first and last labels clear the column heads and the figure's edge.
 */
const PAD_PX = 40
const DASH = '6 4'

/** The flip's pacing around `--duration-settle` (see flipTimeline). */
const FLIP_START_MS = 200
const FLIP_STAGGER_MS = 120
const FLIP_BEAT_MS = 160
/** How much of the chart must be on screen before the flip plays. */
const PLAY_THRESHOLD = 0.5
/** The design system's easing, `--ease`, as motion's bezier array. */
const EASE = [0.22, 1, 0.36, 1] as const

/**
 * Where the flip is. `armed`: the prerendered page, hidden parts waiting for script.
 * `waiting`: in the browser, until the chart is on screen. `playing`: the timeline runs.
 * `rest`: the final chart, which is all a chart without `play` ever shows.
 */
type Stage = 'armed' | 'waiting' | 'playing' | 'rest'

/** Neither value below changes once the page runs, so there is nothing to subscribe to. */
const noSubscription = () => () => {}

function byPrice(levels: VendorLevel[], price: (l: VendorLevel) => number): VendorLevel[] {
  // Array.prototype.sort is stable: equal prices keep tender order.
  return [...levels].sort((a, b) => price(a) - price(b))
}

/**
 * Bid order against evaluated order as a slope chart (spec §7.3). Every value is labelled
 * directly, so there is no axis. A bidder whose rank worsens gets an oxblood, dashed line and
 * a "1st → 3rd" label, so the change never rests on colour. The drawing is hidden from
 * screen readers; two ordered lists carry the same information. Vendors without a bid price
 * take no part.
 *
 * With `play` (landing proposal, step 2) the chart first shows only the bid column. Then each
 * line grows from its bid dot, its evaluated label appears as it lands and the price counts up
 * from the bid; the bidder that falls lands last and its rank change follows. Once settled the
 * markup is exactly the static chart's. The prerendered page ships the hidden state, so the
 * final chart never flashes before the flip; `index.html` shows it at once without script.
 */
export function RankingFlip({ levels, height: minHeight = 160, play = false }: RankingFlipProps) {
  const bidListId = useId()
  const evalListId = useId()
  const [hoveredVendor, setHoveredVendor] = useState<string | null>(null)
  // Narrow is the safe fallback (prerender, jsdom): three-line names fit either way.
  const gap = useMediaQuery(WIDE, false) ? WIDE_MIN_GAP_PX : MIN_GAP_PX
  const { priced, height, ranks, bidY, evalY } = useMemo(() => {
    const priced = pricedLevels(levels)
    // Grow to fit every gap: layoutFlip would otherwise spread the labels over each other.
    const height = Math.max(minHeight, (priced.length - 1) * gap)
    return {
      priced,
      height,
      ranks: new Map(rankChanges(priced).map((r) => [r.vendorId, r])),
      bidY: layoutFlip(
        priced.map((l) => l.headlineCents),
        height,
        gap,
      ),
      evalY: layoutFlip(
        priced.map((l) => l.evaluatedCents),
        height,
        gap,
      ),
    }
  }, [levels, minHeight, gap])

  // The prerender assumes motion is allowed and arms the chart; the browser decides.
  const allowed = useSyncExternalStore(noSubscription, motionOk, () => true)
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  )
  const [trigger, setTrigger] = useState<'idle' | 'playing' | 'done'>('idle')
  const [progress, setProgress] = useState<Readonly<Record<string, FlipProgress>>>({})
  const stage: Stage =
    !play || !allowed || trigger === 'done'
      ? 'rest'
      : trigger === 'playing'
        ? 'playing'
        : hydrated
          ? 'waiting'
          : 'armed'

  const figureRef = useRef<HTMLElement>(null)
  const lines = useRef(new Map<string, SVGLineElement>())
  const drawn = useRef(new Set<string>())
  const tweens = useRef<{ stop: () => void }[]>([])

  // Wait for the chart to be on screen: at once in a desktop hero, on scroll on a short phone.
  const waiting = stage === 'waiting'
  useEffect(() => {
    const figure = figureRef.current
    if (!waiting || figure === null) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        setTrigger('playing')
      },
      { threshold: PLAY_THRESHOLD },
    )
    observer.observe(figure)
    return () => observer.disconnect()
  }, [waiting])

  // Run the timeline: each step moves one vendor on; the last settles the chart.
  const playing = stage === 'playing'
  useEffect(() => {
    if (!playing) return
    const { steps, end } = flipSchedule(
      byPrice(priced, (l) => l.headlineCents).map((l) => ({
        vendorId: l.vendorId,
        worsened: ranks.get(l.vendorId)?.worsened === true,
      })),
      { start: FLIP_START_MS, stagger: FLIP_STAGGER_MS, beat: FLIP_BEAT_MS, settle: settleMs() },
    )
    const timers = steps.map((step) =>
      window.setTimeout(
        () => setProgress((p) => ({ ...p, [step.vendorId]: step.progress })),
        step.at,
      ),
    )
    timers.push(window.setTimeout(() => setTrigger('done'), end))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [playing, priced, ranks])

  // Draw each line from its bid dot as its vendor starts, before the browser paints it whole.
  useLayoutEffect(() => {
    if (stage === 'rest') {
      if (drawn.current.size === 0) return
      // Settled: every line exactly as rendered, whatever a tween last wrote.
      for (const tween of tweens.current) tween.stop()
      tweens.current.length = 0
      drawn.current.clear()
      priced.forEach((l, i) => {
        const line = lines.current.get(l.vendorId)
        line?.setAttribute('x2', '100')
        line?.setAttribute('y2', String(evalY[i] ?? 0))
      })
      return
    }
    if (stage !== 'playing') return
    const seconds = settleMs() / 1000
    priced.forEach((l, i) => {
      const line = lines.current.get(l.vendorId)
      if (!line || (progress[l.vendorId] ?? 0) < 1 || drawn.current.has(l.vendorId)) return
      drawn.current.add(l.vendorId)
      const y1 = bidY[i] ?? 0
      const y2 = evalY[i] ?? 0
      // Moving the end point, not pathLength, so the worsened line keeps its dashes.
      const draw = (p: number) => {
        line.setAttribute('x2', String(100 * p))
        line.setAttribute('y2', String(y1 + (y2 - y1) * p))
      }
      draw(0)
      tweens.current.push(animate(0, 1, { duration: seconds, ease: [...EASE], onUpdate: draw }))
    })
  }, [stage, progress, priced, bidY, evalY])

  useEffect(() => {
    const running = tweens.current
    return () => running.forEach((tween) => tween.stop())
  }, [])

  const flipping = stage !== 'rest'
  /** Marks a part the flip reveals, and whether it has happened (RankingFlip.module.css). */
  const part = (vendorId: string, at: FlipProgress) =>
    flipping
      ? {
          'data-flip-part': '',
          'data-shown': (progress[vendorId] ?? 0) >= at ? '' : undefined,
        }
      : {}
  // While a vendor's line is still on its way, its evaluated label holds the bid price, so the
  // count runs from bid to evaluated when it lands. A new key starts that figure afresh.
  const countKey = trigger === 'idle' ? 'rest' : 'flip'
  const evaluatedShown = (l: VendorLevel) =>
    playing && (progress[l.vendorId] ?? 0) < 2 ? l.headlineCents : l.evaluatedCents

  const ordinal = copy.brief.ranking.ordinal
  const change = (vendorId: string) => {
    const rank = ranks.get(vendorId)
    return rank?.worsened && rank.bidRank !== null && rank.evalRank !== null
      ? { from: ordinal(rank.bidRank), to: ordinal(rank.evalRank) }
      : null
  }

  return (
    <figure ref={figureRef} className={styles.flip} data-flip={flipping ? stage : undefined}>
      <div className={styles.chart} aria-hidden="true">
        <div className={styles.heads}>
          <span>{copy.brief.table.bidPrice}</span>
          <span />
          <span className={styles.end}>{copy.brief.table.evaluatedPrice}</span>
        </div>
        <div className={styles.plot} style={{ height: height + 2 * PAD_PX }}>
          <div className={styles.column}>
            {priced.map((l, i) => (
              <span
                key={l.vendorId}
                data-vendor={l.vendorId}
                data-dimmed={
                  hoveredVendor !== null && hoveredVendor !== l.vendorId ? 'true' : undefined
                }
                className={`${styles.label} ${styles.start}`}
                style={{ top: (bidY[i] ?? 0) + PAD_PX }}
                onPointerEnter={() => setHoveredVendor(l.vendorId)}
                onPointerLeave={() => setHoveredVendor(null)}
              >
                <span className={styles.name}>{l.name}</span>
                <MoneyFigure cents={l.headlineCents} variant="headline" />
              </span>
            ))}
          </div>

          <div className={styles.slopes}>
            <svg
              className={styles.svg}
              style={{ top: PAD_PX, height }}
              viewBox={`0 0 100 ${height}`}
              preserveAspectRatio="none"
            >
              {priced.map((l, i) => {
                const worsened = ranks.get(l.vendorId)?.worsened === true
                return (
                  <line
                    key={l.vendorId}
                    ref={(node) => {
                      if (node) lines.current.set(l.vendorId, node)
                      else lines.current.delete(l.vendorId)
                    }}
                    data-vendor={l.vendorId}
                    data-dimmed={
                      hoveredVendor !== null && hoveredVendor !== l.vendorId ? 'true' : undefined
                    }
                    data-worsened={worsened ? 'true' : 'false'}
                    {...part(l.vendorId, 1)}
                    className={worsened ? styles.worse : styles.line}
                    x1={0}
                    y1={bidY[i] ?? 0}
                    x2={100}
                    y2={evalY[i] ?? 0}
                    vectorEffect="non-scaling-stroke"
                    strokeDasharray={worsened ? DASH : undefined}
                    onPointerEnter={() => setHoveredVendor(l.vendorId)}
                    onPointerLeave={() => setHoveredVendor(null)}
                  />
                )
              })}
            </svg>
            {priced.map((l, i) => {
              const tone = ranks.get(l.vendorId)?.worsened ? styles.worseDot : styles.dot
              return [
                <span
                  key={`${l.vendorId}-bid`}
                  data-vendor={l.vendorId}
                  data-dimmed={
                    hoveredVendor !== null && hoveredVendor !== l.vendorId ? 'true' : undefined
                  }
                  className={`${tone} ${styles.dotStart}`}
                  style={{ top: (bidY[i] ?? 0) + PAD_PX }}
                  onPointerEnter={() => setHoveredVendor(l.vendorId)}
                  onPointerLeave={() => setHoveredVendor(null)}
                />,
                <span
                  key={`${l.vendorId}-eval`}
                  data-vendor={l.vendorId}
                  data-dimmed={
                    hoveredVendor !== null && hoveredVendor !== l.vendorId ? 'true' : undefined
                  }
                  {...part(l.vendorId, 2)}
                  className={`${tone} ${styles.dotEnd}`}
                  style={{ top: (evalY[i] ?? 0) + PAD_PX }}
                  onPointerEnter={() => setHoveredVendor(l.vendorId)}
                  onPointerLeave={() => setHoveredVendor(null)}
                />,
              ]
            })}
          </div>

          <div className={styles.column}>
            {priced.map((l, i) => {
              const moved = change(l.vendorId)
              return (
                <span
                  key={l.vendorId}
                  data-vendor={l.vendorId}
                  data-dimmed={
                    hoveredVendor !== null && hoveredVendor !== l.vendorId ? 'true' : undefined
                  }
                  {...part(l.vendorId, 2)}
                  className={styles.label}
                  style={{ top: (evalY[i] ?? 0) + PAD_PX }}
                  onPointerEnter={() => setHoveredVendor(l.vendorId)}
                  onPointerLeave={() => setHoveredVendor(null)}
                >
                  <span className={styles.name}>{l.name}</span>
                  <span className={styles.value}>
                    <MoneyFigure key={countKey} cents={evaluatedShown(l)} variant="total" />
                    {moved ? (
                      <span {...part(l.vendorId, 3)} className={styles.change}>
                        {copy.brief.ranking.change(moved)}
                      </span>
                    ) : null}
                  </span>
                </span>
              )
            })}
          </div>
        </div>
      </div>

      <div className="visually-hidden">
        <p id={bidListId}>{copy.brief.ranking.bidOrder}</p>
        <ol aria-labelledby={bidListId}>
          {byPrice(priced, (l) => l.headlineCents).map((l) => (
            <li key={l.vendorId}>
              {copy.brief.ranking.item({ name: l.name, price: formatEur(l.headlineCents) })}
            </li>
          ))}
        </ol>
        <p id={evalListId}>{copy.brief.ranking.evaluatedOrder}</p>
        <ol aria-labelledby={evalListId}>
          {byPrice(priced, (l) => l.evaluatedCents).map((l) => {
            const moved = change(l.vendorId)
            const item = copy.brief.ranking.item({
              name: l.name,
              price: formatEur(l.evaluatedCents),
            })
            return (
              <li key={l.vendorId}>
                {moved ? `${item}, ${copy.brief.ranking.changeSpoken(moved.from)}` : item}
              </li>
            )
          })}
        </ol>
      </div>
    </figure>
  )
}
