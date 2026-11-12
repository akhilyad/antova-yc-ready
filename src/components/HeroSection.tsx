import React, { useState } from 'react';
import {
  DeviationItem,
  HERO_CHART_COPY,
  HERO_COPY,
  SAMPLE_DATA_LABEL,
  VENDOR_BIDS,
} from '../constants';
import {
  ChartMode,
  computeVendorTotal,
  formatEuro,
  getActiveDeviations,
  MAX_AXIS_EUR,
} from '../utils/audit';
import { X } from 'lucide-react';

interface HeroSectionProps {
  onAuditClick: () => void;
}

const MODE_TABS: { mode: ChartMode; label: string }[] = [
  { mode: 'sticker', label: 'Sticker price' },
  { mode: 'true', label: 'True price' },
  { mode: 'pushback', label: 'After pushback' },
];

export function HeroSection({ onAuditClick }: HeroSectionProps) {
  const [chartMode, setChartMode] = useState<ChartMode>('true');
  const [selectedDeviation, setSelectedDeviation] =
    useState<DeviationItem | null>(null);

  const vendorA = VENDOR_BIDS.find((v) => v.id === 'A')!;
  const vendorB = VENDOR_BIDS.find((v) => v.id === 'B')!;

  const vendorATotal = computeVendorTotal(vendorA, chartMode);
  const vendorBTotal = computeVendorTotal(vendorB, chartMode);
  const vendorBDeviations = getActiveDeviations(vendorB, chartMode);

  const handleModeChange = (nextMode: ChartMode) => {
    setChartMode(nextMode);
    setSelectedDeviation(null);
  };

  return (
    <section className="w-full bg-[#F6F2EA] text-[#15120F] pt-32 pb-20 sm:pt-36 sm:pb-24 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        {/* Hero Header */}
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-wider text-[#15120F]/60">
            {HERO_COPY.eyebrow}
          </p>
          <h1 className="mt-4 font-serif text-4xl sm:text-6xl text-[#15120F] max-w-4xl text-center mx-auto tracking-tight leading-[1.08]">
            {HERO_COPY.headline}
          </h1>
          <p className="font-sans text-base sm:text-lg text-[#15120F]/75 max-w-2xl text-center mx-auto mt-4 leading-relaxed">
            {HERO_COPY.subtext}
          </p>

          {/* CTA Block */}
          <div className="mt-8 flex flex-col items-center">
            <button
              type="button"
              onClick={onAuditClick}
              className="bg-[#15120F] text-[#F6F2EA] px-6 py-3 rounded-md font-sans text-sm font-medium hover:bg-[#15120F]/90 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15120F]"
            >
              {HERO_COPY.ctaLabel}
            </button>
            <span className="font-mono text-xs text-[#15120F]/60 mt-2 block text-center">
              {HERO_COPY.subline}
            </span>
          </div>
        </div>

        {/* Interactive Comparison Widget */}
        <div className="rounded-2xl border border-[#15120F]/15 bg-[#FDFBF7] p-6 shadow-sm max-w-4xl mx-auto mt-10">
          {/* Card Top Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#15120F]/10 pb-5">
            <div>
              <span className="font-mono text-xs text-[#15120F]/60 block uppercase tracking-wider">
                {HERO_CHART_COPY.packageHeader}
              </span>
              <span className="mt-1 inline-block rounded border border-[#15120F]/20 bg-[#F6F2EA] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#15120F]/70">
                {SAMPLE_DATA_LABEL}
              </span>
              <p className="mt-1 font-mono text-xs font-semibold text-[#15120F]">
                {HERO_CHART_COPY.subheads[chartMode]}
              </p>
            </div>

            <div
              role="group"
              aria-label="Bid price evaluation stage"
              className="inline-flex rounded-lg border border-[#15120F]/15 bg-[#EDE8DE] p-1 self-start sm:self-auto"
            >
              {MODE_TABS.map((tab) => {
                const isSelected = chartMode === tab.mode;
                return (
                  <button
                    key={tab.mode}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleModeChange(tab.mode)}
                    className={`min-h-9 px-3.5 py-1.5 rounded-md font-mono text-xs font-medium transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15120F] ${
                      isSelected
                        ? 'bg-[#15120F] text-[#F6F2EA] shadow-2xs'
                        : 'text-[#15120F]/70 hover:text-[#15120F]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Metric Banner */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#15120F]/15 bg-[#F6F2EA] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="bg-[#FFE98A] text-[#15120F] font-mono text-xs px-2 py-0.5 rounded font-semibold">
                {HERO_CHART_COPY.bannerTags[chartMode]}
              </span>
              <span className="font-serif text-xl text-[#15120F]">
                {HERO_CHART_COPY.callouts[chartMode]}
              </span>
            </div>

            <span className="font-mono text-xs text-[#15120F]/60">
              {HERO_CHART_COPY.rightStats[chartMode]}
            </span>
          </div>

          {/* Vendor Bars (Cleaned Layout) */}
          <div className="mt-6 space-y-5">
            {/* Vendor A Row */}
            <div className="rounded-xl border border-[#15120F]/10 bg-[#F6F2EA]/60 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-serif text-lg font-medium text-[#15120F]">
                    {vendorA.name}
                  </span>
                  <span className="rounded border border-[#15120F]/15 bg-[#FDFBF7] px-2 py-0.5 font-mono text-[11px] text-[#15120F]/70">
                    Full IEC 62271-200 compliance, zero deviations
                  </span>
                </div>
                <span className="font-mono text-xl font-bold text-[#15120F]">
                  {formatEuro(vendorATotal)}
                </span>
              </div>

              <div className="h-7 w-full rounded-md bg-[#EDE8DE] overflow-hidden p-0.5 border border-[#15120F]/10">
                <div
                  style={{
                    width: `${(vendorA.stickerPrice / MAX_AXIS_EUR) * 100}%`,
                  }}
                  className="h-full rounded-xs bg-[#15120F]/75 flex items-center px-3 font-mono text-[11px] text-[#F6F2EA] transition-all duration-300"
                >
                  Base Quote: {formatEuro(vendorA.stickerPrice)}
                </div>
              </div>
            </div>

            {/* Vendor B Row */}
            <div className="rounded-xl border border-[#15120F]/20 bg-[#F6F2EA] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-serif text-lg font-medium text-[#15120F]">
                    {vendorB.name}
                  </span>
                  {chartMode === 'sticker' && (
                    <span className="rounded border border-[#15120F]/15 bg-[#FDFBF7] px-2 py-0.5 font-mono text-[11px] text-[#15120F]/70">
                      Base Quote: €418,000
                    </span>
                  )}
                  {chartMode === 'true' && (
                    <span className="rounded bg-[#FFE98A] px-2 py-0.5 font-mono text-[11px] font-medium text-[#15120F]">
                      Base €418,000 + €64,800 scope gaps = €482,800
                    </span>
                  )}
                  {chartMode === 'pushback' && (
                    <span className="rounded bg-[#FFE98A] px-2 py-0.5 font-mono text-[11px] font-medium text-[#15120F]">
                      Base €418,000 + €18,300 remaining scope gaps = €436,300
                    </span>
                  )}
                </div>
                <span className="font-mono text-xl font-bold text-[#15120F]">
                  {formatEuro(vendorBTotal)}
                </span>
              </div>

              {/* Clean Segmented Progress Bar (No cramped text inside deviation segments) */}
              <div className="h-8 w-full rounded-md bg-[#EDE8DE] overflow-hidden p-0.5 border border-[#15120F]/15 flex gap-1">
                <div
                  style={{
                    width: `${(vendorB.stickerPrice / MAX_AXIS_EUR) * 100}%`,
                  }}
                  className="h-full rounded-xs bg-[#15120F] flex items-center px-3 font-mono text-[11px] text-[#F6F2EA] shrink-0 transition-all duration-300"
                >
                  Base: €418,000
                </div>

                {vendorBDeviations.map((dev) => {
                  const widthPct = (dev.penalty / MAX_AXIS_EUR) * 100;
                  const isSelected = selectedDeviation?.id === dev.id;
                  return (
                    <button
                      key={dev.id}
                      type="button"
                      aria-label={`${dev.name} (+${formatEuro(dev.penalty)} · ${dev.page})`}
                      aria-pressed={isSelected}
                      onClick={() =>
                        setSelectedDeviation(isSelected ? null : dev)
                      }
                      style={{ width: `${Math.max(widthPct, 2)}%` }}
                      title={`${dev.name} (+${formatEuro(dev.penalty)} · ${dev.page})`}
                      className={`h-full rounded-xs transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-[#15120F] border-[#15120F] ring-1 ring-[#FFE98A]'
                          : 'bg-[#FFE98A] border-[#15120F]/35 hover:bg-[#FFE98A]/80'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Exclusion Pills */}
              {vendorBDeviations.length > 0 && (
                <div className="mt-3.5 pt-3 border-t border-[#15120F]/10">
                  <div className="flex flex-wrap gap-2">
                    {vendorBDeviations.map((dev) => {
                      const isSelected = selectedDeviation?.id === dev.id;
                      return (
                        <button
                          key={dev.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() =>
                            setSelectedDeviation(isSelected ? null : dev)
                          }
                          className={`inline-flex items-center rounded-md border px-2.5 py-1 font-mono text-xs transition cursor-pointer ${
                            isSelected
                              ? 'border-[#15120F] bg-[#15120F] text-[#F6F2EA]'
                              : 'border-[#15120F]/15 bg-[#FDFBF7] text-[#15120F] hover:bg-[#EDE8DE]'
                          }`}
                        >
                          <span>
                            {dev.name} (+{formatEuro(dev.penalty)} &middot;{' '}
                            {dev.page})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Selected PDF Clause Popover Card */}
              {selectedDeviation && (
                <div className="mt-3 rounded-lg border border-[#15120F]/25 bg-[#FDFBF7] p-3.5 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 border-b border-[#15120F]/10 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[#FFE98A] px-2 py-0.5 font-mono text-xs font-semibold text-[#15120F]">
                        PDF Citation: {selectedDeviation.page}
                      </span>
                      <span className="font-sans text-xs font-semibold text-[#15120F]">
                        {selectedDeviation.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#15120F]">
                        +{formatEuro(selectedDeviation.penalty)}
                      </span>
                      <button
                        type="button"
                        aria-label="Close clause inspection"
                        onClick={() => setSelectedDeviation(null)}
                        className="rounded p-1 text-[#15120F]/60 hover:bg-[#EDE8DE] hover:text-[#15120F] cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 font-mono text-xs text-[#15120F]/85 bg-[#FFE98A]/45 p-2.5 rounded border border-[#15120F]/15">
                    &ldquo;{selectedDeviation.quote}&rdquo;
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
