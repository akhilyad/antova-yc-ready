import React from 'react';
import { PROBLEM_STACK_SECTION, ProblemStackItem } from '../constants';
import { TiltStackItem, TiltStackScroll } from './ui/tilt-stack-scroll';
import { AlertTriangle, FileWarning, Receipt } from 'lucide-react';

function renderProblemVisual(visualType: ProblemStackItem['visualType']) {
  if (visualType === 'sticker-illusion') {
    return (
      <div className="flex flex-col justify-between gap-4 w-full rounded-xl border border-[#15120F]/15 bg-[#FDFBF7] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 border-b border-[#15120F]/10 pb-3">
          <span className="font-mono text-xs uppercase tracking-wider text-[#15120F]/60">
            Vendor B Bid Evaluation
          </span>
          <AlertTriangle className="h-4 w-4 shrink-0 text-[#15120F]/70" />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 py-2">
          <div className="flex-1 rounded-lg border border-[#15120F]/15 bg-[#F6F2EA] px-4 py-3.5">
            <span className="block font-mono text-[11px] uppercase tracking-wider text-[#15120F]/60">
              Base Quote
            </span>
            <span className="mt-1 inline-block font-mono text-base font-semibold text-[#15120F]">
              €418,000
            </span>
          </div>

          <div className="flex-1 rounded-lg border border-[#15120F]/25 bg-[#FFE98A] px-4 py-3.5">
            <span className="block font-mono text-[11px] uppercase tracking-wider text-[#15120F]/80">
              Unpriced Scope Gaps
            </span>
            <span className="mt-1 inline-block font-mono text-base font-bold text-[#15120F]">
              +€64,800
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (visualType === 'document-avalanche') {
    return (
      <div className="flex flex-col justify-between gap-3.5 w-full rounded-xl border border-[#15120F]/15 bg-[#FDFBF7] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 border-b border-[#15120F]/10 pb-2.5">
          <span className="font-mono text-xs uppercase tracking-wider text-[#15120F]/60">
            Cross-Document Conflict
          </span>
          <FileWarning className="h-4 w-4 shrink-0 text-[#15120F]/70" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Left: Sales Cover Letter */}
          <div className="rounded-lg border border-[#15120F]/15 bg-[#F6F2EA] p-3.5 space-y-2.5">
            <span className="inline-block font-mono text-xs font-medium text-[#15120F]">
              Sales Cover Letter: &ldquo;Fully Compliant&rdquo;
            </span>
            <div className="h-2 w-full bg-[#15120F]/10 rounded" />
            <div className="h-2 w-4/5 bg-[#15120F]/10 rounded" />
          </div>

          {/* Right: Datasheet p. 184 */}
          <div className="rounded-lg border border-[#15120F]/25 bg-[#FDFBF7] p-3.5 space-y-2.5">
            <div className="h-2 w-3/4 bg-[#15120F]/10 rounded" />
            <div className="rounded bg-[#FFE98A] px-2.5 py-1.5 font-mono text-xs font-semibold text-[#15120F]">
              Datasheet p. 184: &ldquo;Excludes Witness FAT&rdquo;
            </div>
            <div className="h-2 w-2/3 bg-[#15120F]/10 rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-between gap-4 w-full rounded-xl border border-[#15120F]/15 bg-[#FDFBF7] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 border-b border-[#15120F]/10 pb-3">
        <span className="font-mono text-xs uppercase tracking-wider text-[#15120F]/60">
          Post-Award Variation Notice
        </span>
        <Receipt className="h-4 w-4 shrink-0 text-[#15120F]/70" />
      </div>

      <div className="rounded-lg border border-[#15120F]/20 bg-[#F6F2EA] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span className="font-mono text-xs font-medium text-[#15120F]">
          Variation Order #VO-04: Switchgear FAT &amp; Auxiliary Feeds
        </span>

        <span className="inline-block shrink-0 rounded-md border border-[#15120F]/25 bg-[#FFE98A] px-3 py-1.5 font-mono text-xs font-bold text-[#15120F]">
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
    <div id="how-it-works" className="scroll-mt-32">
      <TiltStackScroll
        eyebrow={PROBLEM_STACK_SECTION.eyebrow}
        heading={PROBLEM_STACK_SECTION.heading}
        items={stackItems}
      />
    </div>
  );
}
