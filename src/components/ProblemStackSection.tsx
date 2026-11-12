import React from 'react';
import { PROBLEM_STACK_SECTION, ProblemStackItem } from '../constants';
import { CELLS, SECTION_LABEL, cellAdder } from '../data/tender402';
import { formatEuro } from '../utils/audit';
import { TiltStackItem, TiltStackScroll } from './ui/tilt-stack-scroll';

const mono = 'font-mono text-[11px] uppercase tracking-wider';

/** 01: headline ranking vs evaluated ranking for the two closest bids. */
function HeadlineTrap() {
  const rows = [
    { name: 'VoltSwitch', headline: 418000, evaluated: 482800 },
    { name: 'Nordwerk', headline: 452000, evaluated: 452000 },
  ];
  const max = 500000;
  return (
    <div className="flex w-full flex-col gap-5">
      {(['headline', 'evaluated'] as const).map((key) => {
        const order = [...rows].sort((a, b) => a[key] - b[key]);
        return (
          <div key={key}>
            <p className={`${mono} mb-2 text-white/55`}>
              {key === 'headline' ? 'Ranked by quote' : 'Ranked by true cost'}
            </p>
            <div className="space-y-2">
              {order.map((r, i) => (
                <div key={r.name} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 font-mono text-xs text-white/80">{r.name}</span>
                  <div className="h-6 flex-1">
                    <div
                      className={
                        i === 0
                          ? 'flex h-full items-center rounded-sm bg-[#D4400F] px-2'
                          : 'flex h-full items-center rounded-sm bg-white/15 px-2'
                      }
                      style={{ width: `${(r[key] / max) * 100}%` }}
                    >
                      <span className="font-mono text-[11px] text-white">{formatEuro(r[key])}</span>
                    </div>
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-[11px] text-white/55">
                    #{i + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 02: the cover letter claim vs the drawing note that governs. */
function BuriedConflict() {
  const cell = CELLS['vendor-b']['PARAM-01'];
  const claim = cell.secondary!;
  return (
    <div className="flex w-full flex-col gap-5 font-mono text-xs">
      <div className="border-l-2 border-white/25 pl-4">
        <p className={`${mono} text-white/55`}>
          {SECTION_LABEL[claim.section]} · p.{claim.page}
        </p>
        <p className="mt-1.5 font-sans text-sm leading-relaxed text-white/60 line-through decoration-white/40">
          “{claim.quote} …”
        </p>
      </div>
      <div className="border-l-2 border-[#D4400F] pl-4">
        <p className={`${mono} text-[#FF7A45]`}>
          {SECTION_LABEL[cell.citation.section]} · p.{cell.citation.page}
        </p>
        <p className="mt-1.5 font-sans text-sm leading-relaxed text-white">“{cell.citation.quote}”</p>
      </div>
      <p className="text-white/60">
        31.5 kA offered, 50 kA required →{' '}
        <span className="text-[#FF7A45]">+{formatEuro(cellAdder(cell))} to fix</span>
      </p>
    </div>
  );
}

/** 03: VoltSwitch exclusions that would surface as change orders after award. */
function VariationOrders() {
  const b = CELLS['vendor-b'];
  const items = [
    { id: 'PARAM-05', label: 'Witnessed factory test not in price', cell: b['PARAM-05'] },
    { id: 'PARAM-06', label: 'Freight to site, 18-month warranty', cell: b['PARAM-06'] },
    { id: 'PARAM-02', label: 'Aluminium busbars, copper specified', cell: b['PARAM-02'] },
  ];
  const total = items.reduce((s, i) => s + cellAdder(i.cell), 0);
  return (
    <div className="flex w-full flex-col font-mono text-xs">
      {items.map((it, i) => (
        <div
          key={it.id}
          className="flex items-center justify-between gap-4 border-b border-white/10 py-3"
        >
          <div className="min-w-0">
            <p className="text-white/50">Change order {i + 1} · p.{it.cell.citation.page}</p>
            <p className="mt-0.5 truncate text-white">{it.label}</p>
          </div>
          <span className="shrink-0 text-[#FF7A45]">+{formatEuro(cellAdder(it.cell))}</span>
        </div>
      ))}
      <div className="flex items-center justify-between pt-3">
        <span className="text-white/60">Billed after award</span>
        <span className="text-white">{formatEuro(total)}</span>
      </div>
    </div>
  );
}

function renderProblemVisual(type: ProblemStackItem['visualType']) {
  if (type === 'headline-trap') return <HeadlineTrap />;
  if (type === 'buried-conflict') return <BuriedConflict />;
  return <VariationOrders />;
}

export const ProblemStackSection: React.FC = () => {
  const items: TiltStackItem[] = PROBLEM_STACK_SECTION.cards.map((card) => ({
    id: card.id,
    phaseTag: card.phaseTag,
    title: card.title,
    titleItalic: card.titleItalic,
    description: card.description,
    visual: renderProblemVisual(card.visualType),
  }));

  return (
    <div id="problem" className="scroll-mt-12">
      <TiltStackScroll
        eyebrow={PROBLEM_STACK_SECTION.eyebrow}
        heading={PROBLEM_STACK_SECTION.heading}
        items={items}
      />
    </div>
  );
};

export default ProblemStackSection;
