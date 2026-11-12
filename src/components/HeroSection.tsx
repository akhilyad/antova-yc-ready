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
import { ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PulseBadge,
  pillButtonClass,
} from './ui/hero-dithering-card';

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
    <section className="w-full text-[#FFFFFF] pt-24 pb-20 sm:pt-28 sm:pb-24 px-4 md:px-6">
      {/* Hero card: lightly frosted so the page-wide dither reads through */}
      <div
        className="relative mx-auto w-full max-w-7xl"
      >
        <div className="relative flex min-h-[560px] flex-col items-center justify-center overflow-hidden rounded-[32px] border border-white/10 bg-black/30 shadow-sm backdrop-blur-[2px] sm:rounded-[48px] md:min-h-[620px]">

          <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 pt-20 pb-28 text-center sm:pt-24 sm:pb-36">
            <PulseBadge className="mb-8 whitespace-nowrap px-3 text-[11px] sm:px-4 sm:text-sm">
              {HERO_COPY.badge}
            </PulseBadge>

            <h1 className="mb-8 font-serif text-[2.6rem] font-medium leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-7xl lg:text-8xl">
              {HERO_COPY.headlineLead} <br />
              <span className="text-foreground/80">{HERO_COPY.headlineMuted}</span>
            </h1>

            <p className="mb-10 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              {HERO_COPY.subtext}
            </p>

            <button
              type="button"
              onClick={onAuditClick}
              className={cn(pillButtonClass, 'h-14 px-10 text-base sm:px-12')}
            >
              <span className="relative z-10">{HERO_COPY.ctaLabel}</span>
              <ArrowRight className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
            <span className="mt-4 block text-center font-mono text-xs text-[#FFFFFF]/60">
              {HERO_COPY.subline}
            </span>
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto -mt-20 max-w-5xl sm:-mt-24">
        {/* Interactive Comparison Widget */}
        <div className="rounded-3xl border border-[#FFFFFF]/15 bg-black/40 backdrop-blur-md p-4 sm:p-6 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.35)] max-w-4xl mx-auto">
          {/* Card Top Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#FFFFFF]/10 pb-5">
            <div>
              <span className="font-mono text-xs text-[#FFFFFF]/60 block uppercase tracking-wider">
                {HERO_CHART_COPY.packageHeader}
              </span>
              <span className="mt-1 inline-block rounded border border-[#FFFFFF]/20 bg-black/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#FFFFFF]/70">
                {SAMPLE_DATA_LABEL}
              </span>
              <p className="mt-1 font-mono text-xs font-semibold text-[#FFFFFF]">
                {HERO_CHART_COPY.subheads[chartMode]}
              </p>
            </div>

            <div
              role="group"
              aria-label="Bid price evaluation stage"
              className="inline-flex rounded-lg border border-[#FFFFFF]/15 bg-white/[0.06] p-1 self-start sm:self-auto"
            >
              {MODE_TABS.map((tab) => {
                const isSelected = chartMode === tab.mode;
                return (
                  <button
                    key={tab.mode}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleModeChange(tab.mode)}
                    className={`min-h-9 px-3.5 py-1.5 rounded-md font-mono text-xs font-medium transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFFFFF] ${
                      isSelected
                        ? 'bg-[#D4400F] text-[#FFFFFF] shadow-2xs'
                        : 'text-[#FFFFFF]/70 hover:text-[#FFFFFF]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Metric Banner */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#FFFFFF]/15 bg-black/40 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="bg-[#D4400F] text-[#FFFFFF] font-mono text-xs px-2 py-0.5 rounded font-semibold">
                {HERO_CHART_COPY.bannerTags[chartMode]}
              </span>
              <span className="font-serif text-xl text-[#FFFFFF]">
                {HERO_CHART_COPY.callouts[chartMode]}
              </span>
            </div>

            <span className="font-mono text-xs text-[#FFFFFF]/60">
              {HERO_CHART_COPY.rightStats[chartMode]}
            </span>
          </div>

          {/* Vendor Bars (Cleaned Layout) */}
          <div className="mt-6 space-y-5">
            {/* Vendor A Row */}
            <div className="rounded-xl border border-[#FFFFFF]/10 bg-black/40 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-serif text-lg font-medium text-[#FFFFFF]">
                    {vendorA.name}
                  </span>
                  <span className="rounded border border-[#FFFFFF]/15 bg-black/40 px-2 py-0.5 font-mono text-[11px] text-[#FFFFFF]/70">
                    Full IEC 62271-200 compliance, zero deviations
                  </span>
                </div>
                <span className="font-mono text-xl font-bold text-[#FFFFFF]">
                  {formatEuro(vendorATotal)}
                </span>
              </div>

              <div className="h-7 w-full rounded-md bg-white/[0.06] overflow-hidden p-0.5 border border-[#FFFFFF]/10">
                <div
                  style={{
                    width: `${(vendorA.stickerPrice / MAX_AXIS_EUR) * 100}%`,
                  }}
                  className="h-full rounded-xs bg-[#333333] flex items-center px-3 font-mono text-[11px] text-[#FFFFFF] transition-all duration-300"
                >
                  Base Quote: {formatEuro(vendorA.stickerPrice)}
                </div>
              </div>
            </div>

            {/* Vendor B Row */}
            <div className="rounded-xl border border-[#FFFFFF]/20 bg-black/40 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-serif text-lg font-medium text-[#FFFFFF]">
                    {vendorB.name}
                  </span>
                  {chartMode === 'sticker' && (
                    <span className="rounded border border-[#FFFFFF]/15 bg-black/40 px-2 py-0.5 font-mono text-[11px] text-[#FFFFFF]/70">
                      Base Quote: €418,000
                    </span>
                  )}
                  {chartMode === 'true' && (
                    <span className="rounded bg-[#D4400F] px-2 py-0.5 font-mono text-[11px] font-medium text-[#FFFFFF]">
                      Base €418,000 + €64,800 scope gaps = €482,800
                    </span>
                  )}
                  {chartMode === 'pushback' && (
                    <span className="rounded bg-[#D4400F] px-2 py-0.5 font-mono text-[11px] font-medium text-[#FFFFFF]">
                      Base €418,000 + €18,300 remaining scope gaps = €436,300
                    </span>
                  )}
                </div>
                <span className="font-mono text-xl font-bold text-[#FFFFFF]">
                  {formatEuro(vendorBTotal)}
                </span>
              </div>

              {/* Clean Segmented Progress Bar (No cramped text inside deviation segments) */}
              <div className="h-8 w-full rounded-md bg-white/[0.06] overflow-hidden p-0.5 border border-[#FFFFFF]/15 flex gap-1">
                <div
                  style={{
                    width: `${(vendorB.stickerPrice / MAX_AXIS_EUR) * 100}%`,
                  }}
                  className="h-full rounded-xs bg-[#D4400F] flex items-center px-3 font-mono text-[11px] text-[#FFFFFF] shrink-0 transition-all duration-300"
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
                          ? 'bg-[#D4400F] border-[#D4400F] ring-1 ring-[#D4400F]'
                          : 'bg-[#D4400F] border-[#FFFFFF]/35 hover:bg-[#D4400F]/80'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Exclusion Pills */}
              {vendorBDeviations.length > 0 && (
                <div className="mt-3.5 pt-3 border-t border-[#FFFFFF]/10">
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
                              ? 'border-[#D4400F] bg-[#D4400F] text-[#FFFFFF]'
                              : 'border-[#FFFFFF]/15 bg-black/40 text-[#FFFFFF] hover:bg-white/10'
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
                <div className="mt-3 rounded-lg border border-[#FFFFFF]/25 bg-black/40 p-3.5 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 border-b border-[#FFFFFF]/10 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-[#D4400F] px-2 py-0.5 font-mono text-xs font-semibold text-[#FFFFFF]">
                        PDF Citation: {selectedDeviation.page}
                      </span>
                      <span className="font-sans text-xs font-semibold text-[#FFFFFF]">
                        {selectedDeviation.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#FFFFFF]">
                        +{formatEuro(selectedDeviation.penalty)}
                      </span>
                      <button
                        type="button"
                        aria-label="Close clause inspection"
                        onClick={() => setSelectedDeviation(null)}
                        className="rounded p-1 text-[#FFFFFF]/60 hover:bg-white/10 hover:text-[#FFFFFF] cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 font-mono text-xs text-[#FFFFFF]/85 bg-[#D4400F]/45 p-2.5 rounded border border-[#FFFFFF]/15">
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
