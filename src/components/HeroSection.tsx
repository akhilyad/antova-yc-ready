import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { HERO_COPY } from '../constants';
import { CELLS, VENDORS, vendorAdders, vendorPrice } from '../data/tender402';
import { formatEuro } from '../utils/audit';
import { pillButtonClass } from './ui/hero-dithering-card';

interface HeroSectionProps {
  onAuditClick: () => void;
}

type HeroView = 'headline' | 'evaluated';

const gapCount = (id: (typeof VENDORS)[number]['id']) =>
  Object.values(CELLS[id]).filter((c) => c.status !== 'COMPLIANT').length;

/** Quoted vs true cost for the three sample bids. Flips once on its own. */
function BidPreview() {
  const [view, setView] = useState<HeroView>('headline');
  const [touched, setTouched] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (touched) return;
    const id = window.setTimeout(() => setView('evaluated'), 2600);
    return () => window.clearTimeout(id);
  }, [touched]);

  const rows = VENDORS.map((v) => ({ v, price: vendorPrice(v, view) })).sort((a, b) => a.price - b.price);
  const lowest = rows[0].price;
  const max = 500000;

  return (
    <div className="w-full">
      <div className="mb-8 flex items-center justify-between gap-4">
        <p className="font-mono text-[11px] text-white/50">3 bids · 33 kV switchgear</p>
        <div role="group" aria-label="Price view" className="inline-flex rounded-full bg-white/[0.06] p-1">
          {(['headline', 'evaluated'] as HeroView[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => {
                setTouched(true);
                setView(key);
              }}
              className={cn(
                'relative z-10 cursor-pointer whitespace-nowrap rounded-full px-4 py-1.5 font-mono text-xs transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4400F]',
                view === key ? 'text-white' : 'text-white/55 hover:text-white'
              )}
            >
              {view === key && (
                <motion.span
                  layoutId="hero-view-pill"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="absolute inset-0 -z-10 rounded-full bg-[#D4400F]"
                />
              )}
              {key === 'headline' ? 'Quoted' : 'True cost'}
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-5">
        {rows.map(({ v, price }) => {
          const gaps = gapCount(v.id);
          const adders = vendorAdders(v.id);
          const isLowest = price === lowest;
          return (
            <motion.li
              key={v.id}
              layout={!reduced}
              transition={{ type: 'spring', stiffness: 260, damping: 30 }}
              className="grid grid-cols-[5.5rem_1fr] items-center gap-x-4 gap-y-1.5"
            >
              <span className="font-sans text-sm text-white">{v.short}</span>
              <div className="h-8">
                <motion.div
                  initial={false}
                  animate={{ width: `${(price / max) * 100}%` }}
                  transition={{ duration: reduced ? 0 : 0.6, ease: [0.21, 0.47, 0.32, 0.98] }}
                  className={cn(
                    'flex h-full items-center justify-end rounded-sm px-3 font-mono text-xs text-white',
                    isLowest ? 'bg-[#D4400F]' : 'bg-white/15'
                  )}
                >
                  {formatEuro(price)}
                </motion.div>
              </div>
              <span
                className={cn(
                  'col-start-2 font-mono text-[11px]',
                  view === 'headline' || gaps === 0 ? 'text-white/40' : 'text-[#FF7A45]'
                )}
              >
                {view === 'headline'
                  ? isLowest
                    ? 'looks cheapest'
                    : ' '
                  : gaps === 0
                    ? 'meets spec'
                    : `${gaps} gaps · +${formatEuro(adders)}`}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onAuditClick }) => {
  return (
    <section className="w-full px-4 pb-24 pt-28 text-white sm:pb-32 sm:pt-36 md:px-6 lg:flex lg:min-h-[100svh] lg:items-center lg:pb-16 lg:pt-28">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-16 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
      <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
        <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.2em] text-white/50 sm:text-xs">
          {HERO_COPY.eyebrow}
        </p>

        <h1 className="font-serif text-[2.6rem] font-medium leading-[1.04] tracking-tight sm:text-6xl lg:text-[4.25rem]">
          {HERO_COPY.headlineLead}{' '}
          <em className="whitespace-nowrap italic text-[#FF7A45]">{HERO_COPY.headlineItalic}</em>
        </h1>

        <p className="mt-6 max-w-md font-sans text-base leading-relaxed text-white/70 md:text-lg">
          {HERO_COPY.subtext}
        </p>

        <button
          type="button"
          onClick={onAuditClick}
          className={cn(pillButtonClass, 'mt-10 h-14 px-10 text-base')}
        >
          <span className="relative z-10">{HERO_COPY.ctaLabel}</span>
          <ArrowRight className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
        </button>
        <p className="mt-5 font-mono text-[11px] text-white/50 sm:text-xs">{HERO_COPY.subline}</p>
      </div>

      <div className="mx-auto w-full max-w-xl lg:max-w-none">
        <BidPreview />
      </div>
      </div>
    </section>
  );
};

export default HeroSection;
