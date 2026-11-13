import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { HOW_IT_WORKS, INTRO_COPY, MANIFESTO_COPY, SAMPLE_DATA_LABEL, STATUS_PLAIN } from '../constants';
import { CELLS, COMPARE_KEYS, VENDORS, cellAdder, isLowerBound, vendorPrice } from '../data/tender402';
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
                  {isLowerBound(v.id) ? 'from ' : ''}{formatEuro(evaluated[j])}
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
        <p className="mt-6 text-center font-mono text-[11px] text-ink/55">{SAMPLE_DATA_LABEL}</p>
      </Reveal>
    </section>
  );
}

/** The pipeline in four plain steps, what comes back, and who it is for. */
export function HowItWorksSection() {
  return (
    <section id="how" className="scroll-mt-12 px-4 py-32 text-ink sm:py-44 md:px-6">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-xs text-brand-soft">{HOW_IT_WORKS.eyebrow}</p>
          <h2 className="mt-4 font-serif text-4xl tracking-tight sm:text-5xl md:text-6xl">
            {HOW_IT_WORKS.heading}{' '}
            <em className="italic text-ink/85">{HOW_IT_WORKS.headingItalic}</em>
          </h2>
        </Reveal>

        <div className="mt-20 grid gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {HOW_IT_WORKS.steps.map((step, i) => (
            <Reveal key={step.id}>
              <div>
                <p className="font-mono text-xs text-brand-soft">{String(i + 1).padStart(2, '0')}</p>
                <h3 className="mt-3 font-serif text-2xl tracking-tight">{step.title}</h3>
                <p className="mt-3 font-sans text-sm leading-relaxed text-ink/70">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="surface mx-auto mt-20 max-w-3xl p-6 sm:p-8">
          <h3 className="font-serif text-2xl tracking-tight">{HOW_IT_WORKS.deliverablesHeading}</h3>
          <ul className="mt-5 grid gap-x-8 gap-y-3 font-sans text-sm text-ink/80 sm:grid-cols-2">
            {HOW_IT_WORKS.deliverables.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-strong" />
                {item}
              </li>
            ))}
          </ul>
        </Reveal>

        <p className="mx-auto mt-10 max-w-2xl text-center font-sans text-sm text-ink/60">{HOW_IT_WORKS.audience}</p>
      </div>
    </section>
  );
}
