import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { CHECK_LABEL, MATRIX_COPY, SAMPLE_DATA_LABEL, STATUS_PLAIN } from '../constants';
import {
  CELLS,
  NEGOTIATING_VENDOR,
  PARAMETERS,
  SECTION_LABEL,
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

/** What the spec asks for, in plain words (paraphrases each MR quote). */
const NEED: Record<string, string> = {
  'PARAM-01': '50 kA for 3 s',
  'PARAM-02': 'Copper, 2500 A',
  'PARAM-03': 'IP54, arc-rated on all sides',
  'PARAM-04': 'IEC 61850 PRP, pre-wired',
  'PARAM-05': '5 witnessed test days in price',
  'PARAM-06': 'Delivered to site, 36-month warranty',
  'PARAM-07': '36 kV',
  'PARAM-08': '+40 °C',
};

/** PARAM-04 is the only VoltSwitch adder not conceded in round 3. */
const isConceded = (vendorId: VendorId, paramId: string, view: PriceView) =>
  view === 'round3' && vendorId === NEGOTIATING_VENDOR && paramId !== 'PARAM-04';

const STATUS_CLASS: Record<CellStatus, string> = {
  COMPLIANT: 'text-white/45',
  DEVIATION_DOWNGRADE: 'text-[#FF7A45]',
  CONFLICT_DOWNGRADE: 'text-[#FF7A45]',
  OMITTED: 'text-[#FF7A45]',
};

function StatusTag({ status }: { status: CellStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-sans text-[13px]',
        STATUS_CLASS[status]
      )}
    >
      <span
        aria-hidden="true"
        className={cn('h-1.5 w-1.5 rounded-full', status === 'COMPLIANT' ? 'bg-white/30' : 'bg-[#D4400F]')}
      />
      {STATUS_PLAIN[status]}
    </span>
  );
}

function ViewToggle({ view, onChange }: { view: PriceView; onChange: (v: PriceView) => void }) {
  return (
    <div role="group" aria-label="Price view" className="inline-flex rounded-full bg-white/[0.06] p-1">
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
    <div className="space-y-6 font-mono text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-white/55">{vendor.short}</span>
        <StatusTag status={cell.status} />
      </div>
      <h3 className="font-serif text-3xl leading-tight tracking-tight text-white">{CHECK_LABEL[param.id]}</h3>

      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <span className="text-white/45">Spec asks</span>
        <span className="text-white">{NEED[param.id]}</span>
        <span className="text-white/45">Bid offers</span>
        <span className={cell.status === 'COMPLIANT' ? 'text-white' : 'text-[#FF7A45]'}>{cell.offered}</span>
      </div>

      <div className="border-l-2 border-[#D4400F] pl-3">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-[#FF7A45]">
          {SECTION_LABEL[cell.citation.section]} · p.{cell.citation.page}
        </p>
        <p className="font-sans text-sm leading-relaxed text-white">“{cell.citation.quote}”</p>
      </div>

      {cell.secondary && (
        <div className="border-l-2 border-white/20 pl-3">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-white/45">
            Contradicts · {SECTION_LABEL[cell.secondary.section]} · p.{cell.secondary.page}
          </p>
          <p className="font-sans text-sm leading-relaxed text-white/55 line-through decoration-white/30">
            “{cell.secondary.quote}”
          </p>
        </div>
      )}

      {cell.costLines.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-white/45">Cost to bring to spec</p>
          <div className="divide-y divide-white/10">
            {cell.costLines.map((l) => (
              <div key={l.label} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate text-white/70">{l.label}</span>
                <span className="shrink-0 text-white">
                  {formatEuro(Math.round(l.qty * l.rate * 100) / 100)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-white/55">Total</span>
            <span className={cn('text-sm', conceded ? 'text-white/40 line-through' : 'text-[#FF7A45]')}>
              +{formatEuro(adder)}
            </span>
          </div>
          {conceded && <p className="mt-1 text-right text-[11px] text-white/55">Covered by VoltSwitch in negotiation</p>}
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

  return (
    <section id="verification" className="scroll-mt-12 px-4 py-32 text-white sm:py-44 md:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-xs uppercase tracking-wider text-[#D4400F]">{MATRIX_COPY.eyebrow}</p>
          <h2 className="mt-4 font-serif text-4xl tracking-tight sm:text-5xl md:text-6xl">
            {MATRIX_COPY.headlineLead}{' '}
            <em className="italic text-white/85">{MATRIX_COPY.headlineItalic}</em>
          </h2>
          <p className="mt-5 font-sans text-base leading-relaxed text-white/70">{MATRIX_COPY.subtext}</p>
        </div>

        <div className="mt-20 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="font-mono text-[11px] text-white/55">{SAMPLE_DATA_LABEL}</div>
          <ViewToggle view={view} onChange={setView} />
        </div>

        <div className="mt-8 grid gap-12 lg:grid-cols-12 lg:gap-16">
          {/* Matrix */}
          <div className="min-w-0 lg:col-span-8">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse font-mono text-xs">
                <thead>
                  <tr className="text-left">
                    <th className="py-3 pr-3 font-normal text-white/45">Check</th>
                    {VENDORS.map((v) => (
                      <th key={v.id} className="px-3 py-3 font-normal">
                        <span className="text-white">{v.short}</span>
                        
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PARAMETERS.map((p) => (
                    <tr key={p.id} className="border-t border-white/[0.07]">
                      <td className="py-3 pr-3 align-middle">
                        <span className="block font-sans text-sm text-white/85">{CHECK_LABEL[p.id]}</span>
                      </td>
                      {VENDORS.map((v) => {
                        const cell = CELLS[v.id][p.id];
                        const isSel = selected.vendorId === v.id && selected.paramId === p.id;
                        const adder = cellAdder(cell);
                        const conceded = isConceded(v.id, p.id, view);
                        return (
                          <td key={v.id} className="p-1 align-middle">
                            <button
                              type="button"
                              onClick={() => setSelected({ vendorId: v.id, paramId: p.id })}
                              aria-pressed={isSel}
                              aria-label={`${v.short}, ${CHECK_LABEL[p.id]}: ${STATUS_PLAIN[cell.status]}`}
                              className={cn(
                                'flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left transition-colors',
                                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#D4400F]',
                                isSel ? 'bg-[#D4400F]/15' : 'hover:bg-white/5'
                              )}
                            >
                              <StatusTag status={cell.status} />
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
                    <td className="py-2.5 pr-3 text-white/45">Quoted</td>
                    {VENDORS.map((v) => (
                      <td key={v.id} className="px-3 py-2.5 text-white/75">
                        {formatEuro(v.headline)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="py-2.5 pr-3 text-white/45">Gaps</td>
                    {VENDORS.map((v) => {
                      const a =
                        view === 'headline'
                          ? 0
                          : view === 'round3' && v.id === NEGOTIATING_VENDOR
                            ? vendorAdders(v.id) - TENDER.clawbackRound3
                            : vendorAdders(v.id);
                      return (
                        <td key={v.id} className="px-3 py-2.5 text-[#FF7A45]">
                          {view === 'headline' ? <span className="text-white/35">—</span> : `+${formatEuro(a)}`}
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
                          <span className="ml-2 text-[11px] text-[#FF7A45]">lowest</span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="mt-8 font-sans text-base text-white">{MATRIX_COPY.viewNotes[view]}</p>
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
