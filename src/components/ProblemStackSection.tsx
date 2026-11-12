import React from 'react';
import { PROBLEM_STACK_SECTION, ProblemStackItem } from '../constants';
import { TiltStackItem, TiltStackScroll } from './ui/tilt-stack-scroll';
import { AlertTriangle, FileWarning, Receipt } from 'lucide-react';

function renderProblemVisual(visualType: ProblemStackItem['visualType']) {
  if (visualType === 'sticker-illusion') {
    return (
      <div className="flex flex-col justify-between gap-4 w-full rounded-xl border border-[#FFFFFF]/15 bg-[#0B0B0B] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 border-b border-[#FFFFFF]/10 pb-3">
          <span className="font-mono text-xs uppercase tracking-wider text-[#FFFFFF]/60">
            Vendor B Bid Evaluation
          </span>
          <AlertTriangle className="h-4 w-4 shrink-0 text-[#FFFFFF]/70" />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 py-2">
          <div className="flex-1 rounded-lg border border-[#FFFFFF]/15 bg-[#000000] px-4 py-3.5">
            <span className="block font-mono text-[11px] uppercase tracking-wider text-[#FFFFFF]/60">
              Base Quote
            </span>
            <span className="mt-1 inline-block font-mono text-base font-semibold text-[#FFFFFF]">
              €418,000
            </span>
          </div>

          <div className="flex-1 rounded-lg border border-[#FFFFFF]/25 bg-[#D4400F] px-4 py-3.5">
            <span className="block font-mono text-[11px] uppercase tracking-wider text-[#FFFFFF]/80">
              Unpriced Scope Gaps
            </span>
            <span className="mt-1 inline-block font-mono text-base font-bold text-[#FFFFFF]">
              +€64,800
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (visualType === 'document-avalanche') {
    return (
      <div className="flex flex-col justify-between gap-3.5 w-full rounded-xl border border-[#FFFFFF]/15 bg-[#0B0B0B] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 border-b border-[#FFFFFF]/10 pb-2.5">
          <span className="font-mono text-xs uppercase tracking-wider text-[#FFFFFF]/60">
            Cross-Document Conflict
          </span>
          <FileWarning className="h-4 w-4 shrink-0 text-[#FFFFFF]/70" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Left: Sales Cover Letter */}
          <div className="rounded-lg border border-[#FFFFFF]/15 bg-[#000000] p-3.5 space-y-2.5">
            <span className="inline-block font-mono text-xs font-medium text-[#FFFFFF]">
              Sales Cover Letter: &ldquo;Fully Compliant&rdquo;
            </span>
            <div className="h-2 w-full bg-[#FFFFFF]/10 rounded" />
            <div className="h-2 w-4/5 bg-[#FFFFFF]/10 rounded" />
          </div>

          {/* Right: Datasheet p. 184 */}
          <div className="rounded-lg border border-[#FFFFFF]/25 bg-[#0B0B0B] p-3.5 space-y-2.5">
            <div className="h-2 w-3/4 bg-[#FFFFFF]/10 rounded" />
            <div className="rounded bg-[#D4400F] px-2.5 py-1.5 font-mono text-xs font-semibold text-[#FFFFFF]">
              Datasheet p. 184: &ldquo;Excludes Witness FAT&rdquo;
            </div>
            <div className="h-2 w-2/3 bg-[#FFFFFF]/10 rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-between gap-4 w-full rounded-xl border border-[#FFFFFF]/15 bg-[#0B0B0B] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 border-b border-[#FFFFFF]/10 pb-3">
        <span className="font-mono text-xs uppercase tracking-wider text-[#FFFFFF]/60">
          Post-Award Variation Notice
        </span>
        <Receipt className="h-4 w-4 shrink-0 text-[#FFFFFF]/70" />
      </div>

      <div className="rounded-lg border border-[#FFFFFF]/20 bg-[#000000] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span className="font-mono text-xs font-medium text-[#FFFFFF]">
          Variation Order #VO-04: Switchgear FAT &amp; Auxiliary Feeds
        </span>

        <span className="inline-block shrink-0 rounded-md border border-[#FFFFFF]/25 bg-[#D4400F] px-3 py-1.5 font-mono text-xs font-bold text-[#FFFFFF]">
          (+€64,800 Approved)
        </span>
      </div>
    </div>
  );
}

export function ProblemStackSection() {
  const stackItems: TiltStackItem[] = PROBLEM_STACK_SECTION.cards.map(
    (card) => ({
      id: card.id,
      phaseTag: card.phaseTag,
      title: card.title,
      description: card.description,
      visual: renderProblemVisual(card.visualType),
    })
  );

  return (
    <div id="how-it-works">
      <TiltStackScroll
        eyebrow={PROBLEM_STACK_SECTION.eyebrow}
        heading={PROBLEM_STACK_SECTION.heading}
        items={stackItems}
      />
    </div>
  );
}
