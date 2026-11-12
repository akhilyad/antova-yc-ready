import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { IMPACT_COPY, INTRO_COPY, MANIFESTO_COPY, SAMPLE_DATA_LABEL, STATUS_PLAIN } from '../constants';
import { CELLS, COMPARE_KEYS, VENDORS, cellAdder, vendorPrice } from '../data/tender402';
import { formatEuro } from '../utils/audit';

/** Scroll reveal shared by the narrative beats. */
export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** One-line manifesto between the hero and the problem chapters. */
export function ManifestoSection() {
  return (
    <section className="px-4 py-32 text-ink sm:py-48 md:px-6">
      <Reveal className="mx-auto max-w-3xl text-center">
        <p className="font-serif text-3xl leading-[1.2] tracking-tight sm:text-4xl md:text-5xl">
          {MANIFESTO_COPY.lead}{' '}
          <em className="italic text-brand-text">{MANIFESTO_COPY.italic}</em>
        </p>
      </Reveal>
    </section>
  );
}

/** What a manual comparison sheet usually holds for the sample tender. */
const SHEET_ROWS: { label: string; cells: [string, string, string] }[] = [
  { label: 'Fault rating', cells: ['50 kA ok', 'Compliant', '50 kA?'] },
  { label: 'Busbar', cells: ['Cu', 'TBC', 'Cu'] },
  { label: 'Enclosure protection', cells: ['IP54', 'IP4x?', 'IP54'] },
  { label: 'Control network', cells: ['61850', 'Modbus?', '61850'] },
  { label: 'Factory test', cells: ['incl.', '', '3 days??'] },
  { label: 'Delivery', cells: ['DDP 36m', 'see p.21', 'DAP'] },
];

const SHEET_ROW_KEYS = COMPARE_KEYS;

function BeforeAfter() {
  const order = VENDORS;
  const evaluated = order.map((v) => vendorPrice(v, 'evaluated'));
  const lowestEval = Math.min(...evaluated);
  const lowestHeadline = Math.min(...order.map((v) => v.headline));
  const grid = 'grid grid-cols-[1fr_repeat(3,1fr)] gap-x-3';

  return (
    <div className="grid gap-8 xl:grid-cols-2">
      {/* Before */}
      <div className="min-w-0 rounded-[20px] p-6 shadow-hairline sm:p-8">
        <p className="mb-5 font-mono text-xs text-ink/55">{INTRO_COPY.before}</p>
        <div className="overflow-x-auto">
          <div className="min-w-[420px] font-mono text-[11px] text-ink/55">
            <div className={cn(grid, 'border-b border-ink/10 pb-2 text-ink/55')}>
              <span />
              {order.map((v) => (
                <span key={v.id}>{v.short}</span>
              ))}
            </div>
            {SHEET_ROWS.map((r) => (
              <div key={r.label} className={cn(grid, 'border-b border-ink/5 py-2.5')}>
                <span className="truncate text-ink/55">{r.label}</span>
                {r.cells.map((c, j) => (
                  <span key={j} className={cn('truncate', c === '' && 'text-ink/55')}>
                    {c || '—'}
                  </span>
                ))}
              </div>
            ))}
            <div className={cn(grid, 'pt-3 text-ink/70')}>
              <span>Total</span>
              {order.map((v) => (
                <span key={v.id}>
                  {formatEuro(v.headline)}
                  {v.headline === lowestHeadline && <span className="ml-1 text-ink">✓</span>}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* After */}
      <div className="surface min-w-0 p-6 sm:p-8">
        <p className="mb-5 font-mono text-xs text-brand-text">{INTRO_COPY.after}</p>
        <div className="overflow-x-auto">
          <div className="min-w-[420px] font-mono text-[11px]">
            <div className={cn(grid, 'border-b border-ink/15 pb-2 text-ink')}>
              <span />
              {order.map((v) => (
                <span key={v.id}>{v.short}</span>
              ))}
            </div>
            {SHEET_ROWS.map((r, ri) => (
              <div key={r.label} className={cn(grid, 'border-b border-ink/10 py-2.5')}>
                <span className="truncate text-ink/70">{r.label}</span>
                {order.map((v) => {
                  const cell = CELLS[v.id][SHEET_ROW_KEYS[ri]];
                  const adder = cellAdder(cell);
                  return cell.status === 'COMPLIANT' ? (
                    <span key={v.id} className="text-ink/55">✓ meets spec</span>
                  ) : (
                    <span key={v.id} className="text-brand-text">
                      {adder > 0 ? `+${formatEuro(adder)}` : STATUS_PLAIN[cell.status]}
                    </span>
                  );
                })}
              </div>
            ))}
            <div className={cn(grid, 'pt-3 text-ink')}>
              <span>True cost</span>
              {order.map((v, j) => (
                <span key={v.id} className={evaluated[j] === lowestEval ? 'text-ink' : 'text-ink/60'}>
                  {formatEuro(evaluated[j])}
                  {evaluated[j] === lowestEval && <span className="ml-1 text-brand-text">✓</span>}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Solution beat: the manual sheet vs the leveled view. */
export function IntroSection() {
  return (
    <section id="compare" className="scroll-mt-12 px-4 py-32 text-ink sm:py-44 md:px-6">
      <Reveal className="mx-auto flex max-w-2xl flex-col items-center text-center">
                <h2 className="font-serif text-4xl tracking-tight sm:text-5xl md:text-6xl">{INTRO_COPY.heading}</h2>
        <p className="mt-5 font-sans text-base leading-relaxed text-ink/70 md:text-lg">{INTRO_COPY.body}</p>
      </Reveal>

      <Reveal className="mx-auto mt-20 max-w-6xl">
        <BeforeAfter />
      </Reveal>
    </section>
  );
}

/** Bottom-line numbers from the sample audit. */
export function ImpactSection() {
  return (
    <section id="impact" className="scroll-mt-12 px-4 py-32 text-ink sm:py-44 md:px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="text-center font-serif text-4xl tracking-tight sm:text-5xl md:text-6xl">
            {IMPACT_COPY.heading}
          </h2>
        </Reveal>
        <div className="mt-20 grid gap-16 sm:grid-cols-3 sm:gap-8">
          {IMPACT_COPY.stats.map((s) => (
            <Reveal key={s.label} className="text-center">
              <p className="font-serif text-5xl tracking-tight text-ink md:text-6xl">{s.value}</p>
              <p className="mt-3 font-sans text-sm text-ink/60">{s.label}</p>
            </Reveal>
          ))}
        </div>
        <p className="mt-20 text-center font-mono text-[11px] text-ink/55">{IMPACT_COPY.footnote}</p>
        <p className="mt-2 text-center font-mono text-[11px] text-ink/55">{SAMPLE_DATA_LABEL}</p>
      </div>
    </section>
  );
}
