import React from 'react';
import { SAMPLE_DATA_LABEL, SOLUTION_TRANSITION_COPY } from '../constants';
import DisplayCards, { DisplayCardFrame } from './ui/display-cards';
import { Compare } from './ui/compare';
import { DepthCard3D } from './ui/3d-card';
import { AlertTriangle, FileText, Scale, Truck } from 'lucide-react';

export function SolutionMockupSection() {
  const {
    eyebrow,
    headline,
    subtext,
    compareMockup,
    depthCardMockup,
    flaggedDeviations,
  } = SOLUTION_TRANSITION_COPY;

  return (
    <section
      id="verification"
      className="scroll-mt-12 w-full bg-[#F6F2EA] text-[#15120F] border-t border-[#15120F]/10 py-20 sm:py-24 px-4 sm:px-6"
    >
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-wider text-[#15120F]/60">
            {eyebrow}
          </p>
          <h2 className="mt-3 font-serif text-3xl md:text-5xl text-[#15120F] text-center max-w-3xl mx-auto tracking-tight">
            {headline}
          </h2>
          <p className="font-sans text-base text-[#15120F]/70 text-center max-w-2xl mx-auto mt-3">
            {subtext}
          </p>
          <span className="mt-4 inline-block rounded border border-[#15120F]/20 bg-[#FDFBF7] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#15120F]/70">
            {SAMPLE_DATA_LABEL}
          </span>
        </div>

        {/* 1. Minimal Display Card Container Frame (No Browser Chrome or Debug Hashes) */}
        <DisplayCardFrame className="mt-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* 2. Interactive Before/After Slider (Compare) */}
            <div className="lg:col-span-6 flex flex-col">
              <Compare
                firstLabel={compareMockup.asQuotedLabel}
                secondLabel={compareMockup.auditedLabel}
                initialSliderPercentage={50}
                slideMode="hover"
                autoplay
                autoplayDuration={4500}
                className="h-full min-h-[310px]"
                firstContent={
                  <div className="w-full h-full p-6 pt-14 flex flex-col justify-between bg-[#FDFBF7]">
                    <div className="space-y-4">
                      <div className="flex min-w-0 items-center gap-2 border-b border-[#15120F]/10 pb-3">
                        <FileText className="h-4 w-4 shrink-0 text-[#15120F]/60" />
                        <span className="truncate font-mono text-xs text-[#15120F]/70">
                          {compareMockup.documentTitle}
                        </span>
                      </div>

                      {/* 3 Skeleton Text Bars */}
                      <div className="space-y-3 pt-2">
                        <div className="h-2.5 w-full bg-[#15120F]/10 rounded" />
                        <div className="h-2.5 w-5/6 bg-[#15120F]/10 rounded" />
                        <div className="h-2.5 w-4/6 bg-[#15120F]/10 rounded" />
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#15120F]/15 bg-[#F6F2EA] p-3.5 flex items-center justify-between">
                      <div>
                        <span className="block font-mono text-[10px] uppercase tracking-wider text-[#15120F]/60">
                          Commercial Cover
                        </span>
                        <span className="mt-0.5 inline-block font-mono text-xs font-bold text-[#15120F]">
                          {compareMockup.baseQuoteBadge}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-[#15120F]/50">
                        0 Gaps Shown
                      </span>
                    </div>
                  </div>
                }
                secondContent={
                  <div className="w-full h-full p-6 pt-14 flex flex-col justify-between bg-[#F6F2EA]">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3 border-b border-[#15120F]/10 pb-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-[#15120F]" />
                          <span className="truncate font-mono text-xs font-medium text-[#15120F]">
                            {compareMockup.documentTitle}
                          </span>
                        </div>
                        <span className="shrink-0 whitespace-nowrap font-mono text-[11px] font-semibold text-[#15120F]">
                          p. 147 §4.2
                        </span>
                      </div>

                      {/* Skeleton Wireframe + Right-Aligned Exclusion Overlay */}
                      <div className="space-y-2.5 pt-1">
                        <div className="h-2.5 w-full bg-[#15120F]/10 rounded" />
                        <div className="flex justify-end">
                          <span className="rounded-md border border-[#15120F] bg-[#FFE98A] px-2.5 py-1 font-mono text-[11px] font-bold text-[#15120F]">
                            +€64,800 Exclusions
                          </span>
                        </div>
                        <div className="h-2.5 w-4/6 bg-[#15120F]/10 rounded" />
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#15120F]/25 bg-[#FDFBF7] p-3.5 flex items-center justify-between">
                      <span className="font-mono text-[11px] text-[#15120F]/60">
                        Vendor Cover
                      </span>
                      <div className="text-right">
                        <span className="block font-mono text-[10px] uppercase tracking-wider text-[#15120F]/60">
                          True Cost
                        </span>
                        <span className="mt-0.5 inline-block rounded bg-[#FFE98A] px-2 py-0.5 font-mono text-xs font-bold text-[#15120F]">
                          €482,800 Leveled
                        </span>
                      </div>
                    </div>
                  </div>
                }
              />
            </div>

            {/* 3. Interactive 3D Depth Card (Base Plane translateZ="0" + Deviation Card translateZ="40px") */}
            <div className="lg:col-span-6 flex flex-col">
              <DepthCard3D
                baseLayer={
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3 border-b border-[#15120F]/10 pb-3">
                      <span className="font-mono text-xs uppercase tracking-wider text-[#15120F]/60">
                        {depthCardMockup.documentTitle}
                      </span>
                      <span className="shrink-0 whitespace-nowrap font-mono text-xs text-[#15120F]/60">
                        IEC 62271-200
                      </span>
                    </div>

                    {/* Base Document Skeleton Wireframe on Flat Plane */}
                    <div className="space-y-2.5 pt-1">
                      <div className="h-2 w-full bg-[#15120F]/10 rounded" />
                      <div className="h-2 w-11/12 bg-[#15120F]/10 rounded" />
                      <div className="h-2 w-3/4 bg-[#15120F]/10 rounded" />
                    </div>
                  </div>
                }
                floatingLayer={
                  <div className="rounded-xl border-2 border-[#15120F] bg-[#FDFBF7] p-5 shadow-md space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#15120F]">
                        {depthCardMockup.citationHeader}
                      </span>
                    </div>

                    <p className="font-sans text-sm font-medium leading-relaxed text-[#15120F]">
                      &ldquo;{depthCardMockup.highlightedText}&rdquo;
                    </p>

                    <div className="pt-1">
                      <span className="inline-block rounded-md border border-[#15120F]/25 bg-[#FFE98A] px-3 py-1 font-mono text-xs font-bold text-[#15120F]">
                        {depthCardMockup.calculatedDeltaPill}
                      </span>
                    </div>
                  </div>
                }
              />
            </div>
          </div>

          {/* Display Cards stack: the three deviations the audit raised */}
          <div className="mt-6 grid grid-cols-1 items-center gap-10 overflow-hidden rounded-2xl border border-[#15120F]/10 bg-[#F6F2EA] p-5 sm:p-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="font-mono text-xs uppercase tracking-wider text-[#15120F]/60">
                {flaggedDeviations.eyebrow}
              </p>
              <h3 className="mt-2 font-serif text-2xl leading-tight tracking-tight text-[#15120F] sm:text-3xl">
                {flaggedDeviations.heading}
              </h3>
              <p className="mt-3 font-sans text-sm leading-relaxed text-[#15120F]/70">
                {flaggedDeviations.body}
              </p>
            </div>
            <div className="flex justify-center pb-24 pr-8 pt-6 sm:pr-32 lg:col-span-7">
              <DisplayCards
                cards={flaggedDeviations.cards.map((card, i) => ({
                  ...card,
                  icon: [
                    <AlertTriangle key="a" className="size-4" />,
                    <Truck key="t" className="size-4" />,
                    <Scale key="s" className="size-4" />,
                  ][i],
                }))}
              />
            </div>
          </div>
        </DisplayCardFrame>
      </div>
    </section>
  );
}
