import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { IMPACT_COPY, INTRO_COPY, MANIFESTO_COPY } from '../constants';
import { CELLS, STATUS_LABEL, VENDORS, cellAdder, vendorPrice } from '../data/tender402';
import { formatEuro } from '../utils/audit';

/** Scroll reveal shared by the narrative beats. */
function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
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
    <section className="px-4 py-32 text-white sm:py-48 md:px-6">
      <Reveal className="mx-auto max-w-3xl text-center">
        <p className="font-serif text-3xl leading-[1.2] tracking-tight sm:text-4xl md:text-5xl">
          {MANIFESTO_COPY.lead}{' '}
          <em className="italic text-[#FF7A45]">{MANIFESTO_COPY.italic}</em>
        </p>
      </Reveal>
    </section>
  );
}

/** What a manual comparison sheet usually holds for the sample tender. */
const SHEET_ROWS: { label: string; cells: [string, string, string] }[] = [
  { label: 'Fault rating', cells: ['50 kA ok', 'Compliant', '50 kA?'] },
  { label: 'Busbar', cells: ['Cu', 'TBC', 'Cu'] },
  { label: 'Factory test', cells: ['incl.', '', '3 days??'] },
  { label: 'Delivery', cells: ['DDP 36m', 'see p.21', 'DAP'] },
];

const SHEET_ROW_KEYS = ['PARAM-01', 'PARAM-02', 'PARAM-05', 'PARAM-06'] as const;

function BeforeAfter() {
  const order = VENDORS;
  const evaluated = order.map((v) => vendorPrice(v, 'evaluated'));
  const lowestEval = Math.min(...evaluated);
  const lowestHeadline = Math.min(...order.map((v) => v.headline));
  const grid = 'grid grid-cols-[1fr_repeat(3,1fr)] gap-x-3';

  return (
    <div className="grid gap-16 lg:grid-cols-2 lg:gap-12">
      {/* Before */}
      <div className="min-w-0">
        <p className="mb-5 font-mono text-[11px] uppercase tracking-wider text-white/45">{INTRO_COPY.before}</p>
        <div className="overflow-x-auto">
          <div className="min-w-[420px] font-mono text-[11px] text-white/55">
            <div className={cn(grid, 'border-b border-white/10 pb-2 text-white/40')}>
              <span />
              {order.map((v) => (
                <span key={v.id}>{v.short}</span>
              ))}
            </div>
            {SHEET_ROWS.map((r) => (
              <div key={r.label} className={cn(grid, 'border-b border-white/5 py-2.5')}>
                <span className="truncate text-white/45">{r.label}</span>
                {r.cells.map((c, j) => (
                  <span key={j} className={cn('truncate', c === '' && 'text-white/20')}>
                    {c || '—'}
                  </span>
                ))}
              </div>
            ))}
            <div className={cn(grid, 'pt-3 text-white/70')}>
              <span>Total</span>
              {order.map((v) => (
                <span key={v.id}>
                  {formatEuro(v.headline)}
                  {v.headline === lowestHeadline && <span className="ml-1 text-white">✓</span>}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* After */}
      <div className="min-w-0">
        <p className="mb-5 font-mono text-[11px] uppercase tracking-wider text-[#FF7A45]">{INTRO_COPY.after}</p>
        <div className="overflow-x-auto">
          <div className="min-w-[420px] font-mono text-[11px]">
            <div className={cn(grid, 'border-b border-white/15 pb-2 text-white')}>
              <span />
              {order.map((v) => (
                <span key={v.id}>{v.short}</span>
              ))}
            </div>
            {SHEET_ROWS.map((r, ri) => (
              <div key={r.label} className={cn(grid, 'border-b border-white/10 py-2.5')}>
                <span className="truncate text-white/70">{r.label}</span>
                {order.map((v) => {
                  const cell = CELLS[v.id][SHEET_ROW_KEYS[ri]];
                  const adder = cellAdder(cell);
                  return cell.status === 'COMPLIANT' ? (
                    <span key={v.id} className="text-white/45">✓ meets spec</span>
                  ) : (
                    <span key={v.id} className="text-[#FF7A45]">
                      {adder > 0 ? `+${formatEuro(adder)}` : STATUS_LABEL[cell.status]}
                    </span>
                  );
                })}
              </div>
            ))}
            <div className={cn(grid, 'pt-3 text-white')}>
              <span>True cost</span>
              {order.map((v, j) => (
                <span key={v.id} className={evaluated[j] === lowestEval ? 'text-white' : 'text-white/60'}>
                  {formatEuro(evaluated[j])}
                  {evaluated[j] === lowestEval && <span className="ml-1 text-[#FF7A45]">✓</span>}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** "Introducing Antova." beat: the manual sheet vs the leveled view. */
export function IntroSection() {
  return (
    <section id="compare" className="scroll-mt-12 px-4 py-32 text-white sm:py-44 md:px-6">
      <Reveal className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <img src="/antova-logo.svg" alt="" aria-hidden="true" className="mb-6 h-9 w-9 opacity-90" />
        <h2 className="font-serif text-4xl tracking-tight sm:text-5xl md:text-6xl">{INTRO_COPY.heading}</h2>
        <p className="mt-5 font-sans text-base leading-relaxed text-white/70 md:text-lg">{INTRO_COPY.body}</p>
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
    <section id="impact" className="scroll-mt-12 px-4 py-32 text-white sm:py-44 md:px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="text-center font-serif text-4xl tracking-tight sm:text-5xl md:text-6xl">
            {IMPACT_COPY.heading}
          </h2>
        </Reveal>
        <div className="mt-20 grid gap-16 sm:grid-cols-3 sm:gap-8">
          {IMPACT_COPY.stats.map((s) => (
            <Reveal key={s.label} className="text-center">
              <p className="font-serif text-5xl tracking-tight text-white md:text-6xl">{s.value}</p>
              <p className="mt-3 font-sans text-sm text-white/60">{s.label}</p>
            </Reveal>
          ))}
        </div>
        <p className="mt-20 text-center font-mono text-[11px] text-white/45">{IMPACT_COPY.footnote}</p>
      </div>
    </section>
  );
}
