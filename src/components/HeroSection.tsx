import React from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HERO_COPY, SAMPLE_DATA_LABEL } from '../constants';
import { PARAMETERS, TENDER, TOTAL_PAGES } from '../data/tender402';
import { PulseBadge, pillButtonClass } from './ui/hero-dithering-card';
import { Terminal, type TerminalLine } from './ui/terminal';
import { Marquee } from './ui/marquee';

interface HeroSectionProps {
  onAuditClick: () => void;
}

const dim = 'text-white/45';
const ok = 'text-white';
const warn = 'text-[#FF7A45]';

/** Replay of the sample tender through the ingest CLI (figures from expected.json). */
const INGEST_LINES: TerminalLine[] = [
  {
    kind: 'cmd',
    text: `python -m specclaw_ingest.run samples/${TENDER.id} --mode replay --verify`,
  },
  { kind: 'out', content: <span className={dim}>{TENDER.title} · {TENDER.bayCount} bays</span> },
  { kind: 'out', content: <><span className={dim}>[  5%]</span> Intake      <span className={dim}>4 documents · SHA-256 recorded</span></> },
  { kind: 'out', content: <><span className={dim}>[ 20%]</span> Parse       <span className={dim}>{TOTAL_PAGES} pages · sections tagged</span></> },
  { kind: 'out', content: <><span className={dim}>[ 60%]</span> Locate      <span className={dim}>candidate quotes per document</span></> },
  { kind: 'out', content: <><span className={dim}>[ 70%]</span> Verify      <span className={dim}>quotes matched on the page</span></> },
  { kind: 'out', content: <><span className={dim}>[ 80%]</span> Check       <span className={dim}>24 cells · Pint unit checks</span></> },
  { kind: 'out', content: <><span className={dim}>[ 85%]</span> Precedence  <span className={warn}>10 cells flagged (2 conflicts, 1 omission)</span></> },
  { kind: 'out', content: <><span className={dim}>[ 90%]</span> Price       <span className={dim}>rate table {TENDER.rateTable}</span></> },
  { kind: 'out', content: <><span className={dim}>[100%]</span> Persist     <span className={dim}>ledger written in one transaction</span></> },
  { kind: 'out', content: ' ', hold: 120 },
  { kind: 'out', content: <><span className={warn}>VoltSwitch </span>  €418,000 → <span className={ok}>€482,800</span>  <span className={warn}>+€64,800</span></> },
  { kind: 'out', content: <><span className={warn}>Deltaport  </span>  €439,000 → <span className={ok}>€454,000</span>  <span className={warn}>+€15,000</span></> },
  { kind: 'out', content: <><span className={ok}>Nordwerk   </span>  €452,000 → <span className={ok}>€452,000</span>  <span className={dim}>compliant</span></> },
  { kind: 'out', content: <span className="text-[#D4400F]">✓ matches answer key · lowest evaluated: Nordwerk</span> },
];

export const HeroSection: React.FC<HeroSectionProps> = ({ onAuditClick }) => {
  return (
    <section className="w-full px-4 pb-16 pt-28 text-white sm:pt-36 md:px-6">
      <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
        <PulseBadge className="mb-8 whitespace-nowrap px-3 text-[11px] sm:px-4 sm:text-sm">
          {HERO_COPY.badge}
        </PulseBadge>

        <h1 className="font-serif text-[2.6rem] font-medium leading-[1.04] tracking-tight sm:text-6xl md:text-7xl lg:text-[5.5rem]">
          {HERO_COPY.headlineLead}
          <br />
          <em className="italic text-white/85">{HERO_COPY.headlineItalic}</em>
        </h1>

        <p className="mt-8 max-w-2xl font-sans text-base leading-relaxed text-white/70 md:text-lg">
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
        <p className="mt-5 font-mono text-[11px] text-white/55 sm:text-xs">
          {HERO_COPY.subline}
        </p>
      </div>

      {/* Live ingest preview: the sample tender replayed through the CLI */}
      <div className="mx-auto mt-16 max-w-3xl">
        <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-white/50 sm:text-[11px]">
          <span>{TENDER.id}</span>
          <span>{SAMPLE_DATA_LABEL}</span>
        </div>
        <Terminal lines={INGEST_LINES} title={`ingest · ${TENDER.id}`} />
      </div>

      {/* Requirement ticker: the eight MR checks, with the page each comes from */}
      <div className="mx-auto mt-16 max-w-6xl">
        <p className="mb-4 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-[#D4400F] sm:text-[11px]">
          Checked against {TENDER.mrDoc}
        </p>
        <Marquee duration={45}>
          {PARAMETERS.map((p) => (
            <span key={p.id} className="flex items-baseline gap-2 whitespace-nowrap font-mono text-xs">
              <span className="text-white/45">{p.id}</span>
              <span className="text-white">{p.rule}</span>
              <span className="text-white/40">MR p.{p.requirement.page}</span>
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  );
};

export default HeroSection;
