import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { MATRIX_COPY, SAMPLE_DATA_LABEL } from '../constants';
import {
  CELLS,
  NEGOTIATING_VENDOR,
  PARAMETERS,
  SECTION_LABEL,
  SECTION_TIER,
  STATUS_LABEL,
  TENDER,
  VENDORS,
  cellAdder,
  vendorAdders,
  vendorPrice,
  type CellStatus,
  type PriceView,
  type VendorId,
} from '../data/tender402';
import { formatEuro } from '../utils/audit';

const VIEWS: PriceView[] = ['headline', 'evaluated', 'round3'];

/** PARAM-04 is the only VoltSwitch adder not conceded in round 3. */
const isConceded = (vendorId: VendorId, paramId: string, view: PriceView) =>
  view === 'round3' && vendorId === NEGOTIATING_VENDOR && paramId !== 'PARAM-04';

const STATUS_CLASS: Record<CellStatus, string> = {
  COMPLIANT: 'text-white/50',
  DEVIATION_DOWNGRADE: 'text-[#FF7A45]',
  CONFLICT_DOWNGRADE: 'bg-[#D4400F] text-white px-1.5',
  OMITTED: 'border border-dashed border-[#FF7A45] text-[#FF7A45] px-1.5',
};

function StatusTag({ status }: { status: CellStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider',
        STATUS_CLASS[status]
      )}
    >
      {status === 'COMPLIANT' && <span className="h-1.5 w-1.5 rounded-full bg-white/40" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

function ViewToggle({ view, onChange }: { view: PriceView; onChange: (v: PriceView) => void }) {
  return (
    <div role="group" aria-label="Price view" className="inline-flex rounded-full border border-white/15 p-1">
      {VIEWS.map((v) => {
        const active = v === view;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(v)}
            className={cn(
              'relative z-10 cursor-pointer whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[11px] transition-colors sm:px-4 sm:text-xs',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4400F]',
              active ? 'text-white' : 'text-white/60 hover:text-white'
            )}
          >
            {active && (
              <motion.span
                layoutId="matrix-view-pill"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className="absolute inset-0 -z-10 rounded-full bg-[#D4400F]"
              />
            )}
            {MATRIX_COPY.views[v]}
          </button>
        );
      })}
    </div>
  );
}

function CellDetail({ vendorId, paramId, view }: { vendorId: VendorId; paramId: string; view: PriceView }) {
  const vendor = VENDORS.find((v) => v.id === vendorId)!;
  const param = PARAMETERS.find((p) => p.id === paramId)!;
  const cell = CELLS[vendorId][paramId];
  const adder = cellAdder(cell);
  const conceded = isConceded(vendorId, paramId, view);

  return (
    <div className="space-y-5 font-mono text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-white/55">
          {vendor.short} · {param.id}
        </span>
        <StatusTag status={cell.status} />
      </div>
      <h3 className="font-serif text-2xl leading-tight tracking-tight text-white">{param.name}</h3>

      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wider text-white/45">
          Requirement · MR p.{param.requirement.page}
        </p>
        <p className="font-sans text-sm leading-relaxed text-white/70">“{param.requirement.quote}”</p>
      </div>

      <div className="border-l-2 border-[#D4400F] pl-3">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-[#FF7A45]">
          Governing · p.{cell.citation.page} · {SECTION_LABEL[cell.citation.section]} · tier{' '}
          {SECTION_TIER[cell.citation.section]}
        </p>
        <p className="font-sans text-sm leading-relaxed text-white">“{cell.citation.quote}”</p>
      </div>

      {cell.secondary && (
        <div className="border-l-2 border-white/20 pl-3">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-white/45">
            Overridden · p.{cell.secondary.page} · {SECTION_LABEL[cell.secondary.section]} · tier{' '}
            {SECTION_TIER[cell.secondary.section]}
          </p>
          <p className="font-sans text-sm leading-relaxed text-white/55 line-through decoration-white/30">
            “{cell.secondary.quote}”
          </p>
        </div>
      )}

      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <span className="text-white/45">Rule</span>
        <span className="text-white">{param.rule}</span>
        <span className="text-white/45">Offered</span>
        <span className={cell.status === 'COMPLIANT' ? 'text-white' : 'text-[#FF7A45]'}>{cell.offered}</span>
      </div>

      {cell.costLines.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-white/45">
            Cost lines · {TENDER.rateTable}
          </p>
          <div className="divide-y divide-white/10 border-y border-white/10">
            {cell.costLines.map((l) => (
              <div key={l.label} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0 text-white/75">
                  {l.qty.toLocaleString('en-US')} {l.unit} × €{l.rate.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  <span className="block truncate text-white/40">{l.label}</span>
                </span>
                <span className="shrink-0 text-white">
                  {formatEuro(Math.round(l.qty * l.rate * 100) / 100)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-white/55">Adder</span>
            <span className={cn('text-sm', conceded ? 'text-white/40 line-through' : 'text-[#FF7A45]')}>
              +{formatEuro(adder)}
            </span>
          </div>
          {conceded && (
            <p className="mt-1 text-right text-[11px] text-white/55">Conceded by VoltSwitch in round 3</p>
          )}
        </div>
      )}
    </div>
  );
}

export function AuditMatrixSection() {
  const [view, setView] = useState<PriceView>('evaluated');
  const [selected, setSelected] = useState<{ vendorId: VendorId; paramId: string }>({
    vendorId: 'vendor-b',
    paramId: 'PARAM-01',
  });
  const reduced = useReducedMotion();

  const prices = VENDORS.map((v) => ({ id: v.id, price: vendorPrice(v, view) }));
  const lowest = Math.min(...prices.map((p) => p.price));
  const maxPrice = 500000;

  return (
    <section id="verification" className="scroll-mt-12 px-4 py-24 text-white sm:py-32 md:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-xs uppercase tracking-wider text-[#D4400F]">{MATRIX_COPY.eyebrow}</p>
          <h2 className="mt-4 font-serif text-4xl tracking-tight sm:text-5xl md:text-6xl">
            {MATRIX_COPY.headlineLead}{' '}
            <em className="italic text-white/85">{MATRIX_COPY.headlineItalic}</em>
          </h2>
          <p className="mt-5 font-sans text-base leading-relaxed text-white/70">{MATRIX_COPY.subtext}</p>
        </div>

        <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="font-mono text-[11px] text-white/55">
            <span className="text-white">{TENDER.id}</span> · {TENDER.title} · {SAMPLE_DATA_LABEL}
          </div>
          <ViewToggle view={view} onChange={setView} />
        </div>

        <div className="mt-6 grid gap-10 lg:grid-cols-12">
          {/* Matrix */}
          <div className="min-w-0 lg:col-span-8">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse font-mono text-xs">
                <thead>
                  <tr className="border-b border-white/15 text-left">
                    <th className="py-3 pr-3 font-normal text-white/45">Parameter</th>
                    {VENDORS.map((v) => (
                      <th key={v.id} className="px-3 py-3 font-normal">
                        <span className="text-white">{v.short}</span>
                        <span className="ml-1.5 text-white/40">{v.country}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PARAMETERS.map((p) => (
                    <tr key={p.id} className="border-b border-white/10">
                      <td className="py-2.5 pr-3 align-top">
                        <span className="block text-white/45">{p.id}</span>
                        <span className="block font-sans text-[13px] text-white/85">{p.short}</span>
                      </td>
                      {VENDORS.map((v) => {
                        const cell = CELLS[v.id][p.id];
                        const isSel = selected.vendorId === v.id && selected.paramId === p.id;
                        const adder = cellAdder(cell);
                        const conceded = isConceded(v.id, p.id, view);
                        return (
                          <td key={v.id} className="p-1 align-top">
                            <button
                              type="button"
                              onClick={() => setSelected({ vendorId: v.id, paramId: p.id })}
                              aria-pressed={isSel}
                              aria-label={`${v.short} ${p.short}: ${STATUS_LABEL[cell.status]}`}
                              className={cn(
                                'flex w-full cursor-pointer flex-col items-start gap-1 rounded-md px-2 py-1.5 text-left transition-colors',
                                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#D4400F]',
                                isSel ? 'ring-1 ring-[#D4400F] bg-[#D4400F]/10' : 'hover:bg-white/5'
                              )}
                            >
                              <StatusTag status={cell.status} />
                              <span className="text-[11px] text-white/75">{cell.offered}</span>
                              {adder > 0 && view !== 'headline' && (
                                <span
                                  className={cn(
                                    'text-[11px]',
                                    conceded ? 'text-white/35 line-through' : 'text-[#FF7A45]'
                                  )}
                                >
                                  +{formatEuro(adder)}
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-b border-white/10">
                    <td className="py-2.5 pr-3 text-white/45">Headline</td>
                    {VENDORS.map((v) => (
                      <td key={v.id} className="px-3 py-2.5 text-white/75">
                        {formatEuro(v.headline)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="py-2.5 pr-3 text-white/45">Adders</td>
                    {VENDORS.map((v) => {
                      const a =
                        view === 'headline'
                          ? 0
                          : view === 'round3' && v.id === NEGOTIATING_VENDOR
                            ? vendorAdders(v.id) - TENDER.clawbackRound3
                            : vendorAdders(v.id);
                      return (
                        <td key={v.id} className="px-3 py-2.5 text-[#FF7A45]">
                          {view === 'headline' ? <span className="text-white/35">not audited</span> : `+${formatEuro(a)}`}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="py-3 pr-3 text-white">{MATRIX_COPY.views[view]}</td>
                    {prices.map((p) => (
                      <td key={p.id} className="px-3 py-3">
                        <span className={cn('text-sm', p.price === lowest ? 'text-white' : 'text-white/70')}>
                          {formatEuro(p.price)}
                        </span>
                        {p.price === lowest && (
                          <span className="ml-2 rounded-sm bg-[#D4400F] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white">
                            lowest
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Spread bars */}
            <div className="mt-8 space-y-2.5">
              {VENDORS.map((v) => {
                const price = vendorPrice(v, view);
                return (
                  <div key={v.id} className="flex items-center gap-3 font-mono text-[11px]">
                    <span className="w-20 shrink-0 text-white/70">{v.short}</span>
                    <div className="relative h-5 flex-1">
                      <motion.div
                        className={cn('h-full rounded-sm', price === lowest ? 'bg-[#D4400F]' : 'bg-white/20')}
                        initial={false}
                        animate={{ width: `${(price / maxPrice) * 100}%` }}
                        transition={{ duration: reduced ? 0 : 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right text-white">{formatEuro(price)}</span>
                  </div>
                );
              })}
              <p className="pt-2 font-mono text-[11px] text-white/55">{MATRIX_COPY.viewNotes[view]}</p>
            </div>
          </div>

          {/* Cell detail */}
          <aside className="min-w-0 lg:col-span-4" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${selected.vendorId}-${selected.paramId}`}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="lg:sticky lg:top-28"
              >
                <CellDetail vendorId={selected.vendorId} paramId={selected.paramId} view={view} />
              </motion.div>
            </AnimatePresence>
          </aside>
        </div>
      </div>
    </section>
  );
}

export default AuditMatrixSection;
