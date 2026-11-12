import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { PIPELINE_COPY } from '../constants';
import {
  CELLS,
  PIPELINE_STAGES,
  TENDER,
  TOTAL_PAGES,
  VENDORS,
  cellAdder,
  vendorPrice,
} from '../data/tender402';
import { formatEuro } from '../utils/audit';

const k = 'text-white/45';
const v = 'text-white';
const hot = 'text-[#FF7A45]';

/** SHA-256 prefixes of the sample pack files, computed from the PDFs. */
const HASHES: Record<string, string> = {
  'MR-33kV-GIS-Rev4.pdf': '38bac85cec0b',
  'Bid_vendor-a_Nordwerk.pdf': 'e31dc3dcfca4',
  'Bid_vendor-b_VoltSwitch.pdf': '7ed27fcc2d42',
  'Bid_vendor-c_Deltaport.pdf': '49d54eceaa53',
};

const NOTE7 = CELLS['vendor-b']['PARAM-01'];

function Artifact({ stage }: { stage: number }) {
  switch (stage) {
    case 0:
      return (
        <div className="space-y-1.5">
          <p className={k}>manifest.json · {TENDER.id}</p>
          {TENDER.documents.map((d) => (
            <p key={d.file} className="flex flex-col sm:flex-row sm:justify-between sm:gap-4">
              <span className={v}>{d.file}</span>
              <span className={k}>
                {d.role} · {d.pages}p · {HASHES[d.file]}…
              </span>
            </p>
          ))}
          <p className={cn(k, 'pt-2')}>exactly one mr_spec, at least one vendor_bid ✓</p>
        </div>
      );
    case 1:
      return (
        <div className="space-y-1.5">
          <p className={k}>Bid_vendor-b_VoltSwitch.pdf · page 11</p>
          <p>
            <span className={k}>heading </span>
            <span className={v}>“Drawing VS-GIS-SLD - sheet 2”</span>
            <span className={k}> → section </span>
            <span className={hot}>drawing</span>
          </p>
          <p className={k}>words with boxes, PDF points, origin top-left:</p>
          <p className={v}>NOTE 7: Standard switchgear bay rated 31.5kA 1s. …</p>
          <p className={k}>{TOTAL_PAGES} pages parsed across 4 documents · no OCR in v1</p>
        </div>
      );
    case 2:
      return (
        <div className="space-y-1.5">
          <p className={k}>locate · PARAM-01 · vendor-b · all candidates, incl. contradictions</p>
          <p className={v}>
            {'{'} page: 2, quote: “…fully compliant … including the 50 kA / 3 s…” {'}'}
          </p>
          <p className={v}>
            {'{'} page: 11, quote: “NOTE 7: Standard switchgear bay rated 31.5kA 1s…” {'}'}
          </p>
          <p className={cn(k, 'pt-2')}>The model returns pages and verbatim quotes. No numbers, no verdicts.</p>
        </div>
      );
    case 3:
      return (
        <div className="space-y-1.5">
          <p className={k}>normalise → find word run on cited page (±1)</p>
          <p>
            <span className={v}>p.11 match ✓ </span>
            <span className={k}>bbox </span>
            <span className={hot}>[56.0, 65.2, 509.5, 79.0]</span>
          </p>
          <p className={k}>quote under 3 words, or no match on p.10-12 → rejected, counted in run report</p>
        </div>
      );
    case 4:
      return (
        <div className="space-y-1.5">
          <p className={k}>Pint · offered converted to the requirement’s unit</p>
          <p>
            <span className={v}>Ik 31.5 kA ≥ 50 kA</span> <span className={hot}>✗</span>
            <span className={k}> · </span>
            <span className={v}>t 1 s ≥ 3 s</span> <span className={hot}>✗</span>
            <span className={k}>  VoltSwitch</span>
          </p>
          <p>
            <span className={v}>36,000 V → 36 kV ≥ 36 kV</span> <span className={v}>✓</span>
            <span className={k}>  VoltSwitch</span>
          </p>
          <p>
            <span className={v}>104 °F → 313.15 K ≥ 313.15 K</span> <span className={v}>✓</span>
            <span className={k}>  Deltaport</span>
          </p>
          <p>
            <span className={v}>IP42: solid 4 ≥ 5</span> <span className={hot}>✗</span>
            <span className={k}>  digit-wise, so IP63 fails IP54 too</span>
          </p>
        </div>
      );
    case 5:
      return (
        <div className="space-y-1.5">
          <p className={k}>tier 1 drawing · bom · datasheet · test_plan · commercial</p>
          <p className={k}>tier 2 compliance_table · tier 3 cover_letter</p>
          <p className="pt-1">
            <span className={v}>Cover letter p.2 claims 50 kA / 3 s; drawing p.11 states 31.5 kA / 1 s. </span>
            <span className={hot}>Drawing governs.</span>
          </p>
          <p className={k}>status CONFLICT_DOWNGRADE · both citations kept</p>
        </div>
      );
    case 6:
      return (
        <div className="space-y-1.5">
          <p className={k}>
            {TENDER.rateTable} · class PARAM-01.ik_rating_short
          </p>
          {NOTE7.costLines.map((l) => (
            <p key={l.label} className="flex flex-col sm:flex-row sm:justify-between sm:gap-4">
              <span className={v}>
                {l.qty} {l.unit} × €{l.rate.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
              <span className={k}>{l.label}</span>
            </p>
          ))}
          <p>
            <span className={k}>adder </span>
            <span className={hot}>{formatEuro(cellAdder(NOTE7))}.00</span>
            <span className={k}> · Decimal, half-up to cents</span>
          </p>
        </div>
      );
    default:
      return (
        <div className="space-y-1.5">
          <p className={k}>true evaluated price = headline + technical + commercial adders</p>
          {VENDORS.map((ven) => (
            <p key={ven.id} className="flex flex-col sm:flex-row sm:justify-between sm:gap-4">
              <span className={v}>{ven.short}</span>
              <span>
                <span className={k}>{formatEuro(ven.headline)} → </span>
                <span className={v}>{formatEuro(vendorPrice(ven, 'evaluated'))}</span>
              </span>
            </p>
          ))}
          <p className={cn(k, 'pt-1')}>24 cells written in one transaction · leveling cache cleared</p>
        </div>
      );
  }
}

export function PipelineSection() {
  const [stage, setStage] = useState(0);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduced = useReducedMotion();

  // Walk the stages while in view, until the reader picks one.
  useEffect(() => {
    if (!inView || pinned || reduced) return;
    const id = window.setInterval(() => setStage((s) => (s + 1) % PIPELINE_STAGES.length), 3200);
    return () => window.clearInterval(id);
  }, [inView, pinned, reduced]);

  const current = PIPELINE_STAGES[stage];

  return (
    <section id="how-it-works" className="scroll-mt-12 px-4 py-24 text-white sm:py-32 md:px-6">
      <div ref={ref} className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-wider text-[#D4400F]">{PIPELINE_COPY.eyebrow}</p>
          <h2 className="mt-4 font-serif text-4xl tracking-tight sm:text-5xl md:text-6xl">
            {PIPELINE_COPY.headlineLead}{' '}
            <em className="italic text-white/85">{PIPELINE_COPY.headlineItalic}</em>
          </h2>
          <p className="mt-5 font-sans text-base leading-relaxed text-white/70">{PIPELINE_COPY.subtext}</p>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-12">
          <ol className="min-w-0 lg:col-span-5">
            {PIPELINE_STAGES.map((s, i) => {
              const active = i === stage;
              return (
                <li key={s.name}>
                  <button
                    type="button"
                    onClick={() => {
                      setStage(i);
                      setPinned(true);
                    }}
                    aria-current={active ? 'step' : undefined}
                    className={cn(
                      'group flex w-full cursor-pointer items-baseline gap-4 border-b border-white/10 py-3.5 text-left transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4400F]'
                    )}
                  >
                    <span className={cn('w-12 shrink-0 font-mono text-xs tabular-nums', active ? 'text-[#D4400F]' : 'text-white/40')}>
                      {String(s.pct).padStart(3, ' ')}%
                    </span>
                    <span className="min-w-0">
                      <span className={cn('block font-sans text-base', active ? 'text-white' : 'text-white/60 group-hover:text-white')}>
                        {s.name}
                      </span>
                      <span className={cn('block font-mono text-[11px]', active ? 'text-white/60' : 'text-white/35')}>
                        {s.detail}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="min-w-0 lg:col-span-7">
            <div className="rounded-xl border border-white/15">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 font-mono text-[11px]">
                <span className="text-white/55">
                  stage {stage + 1}/8 · <span className="text-white">{current.name}</span>
                </span>
                <span className="text-[#D4400F]">{current.pct}%</span>
              </div>
              <div className="h-px w-full bg-white/10">
                <motion.div
                  className="h-px bg-[#D4400F]"
                  initial={false}
                  animate={{ width: `${current.pct}%` }}
                  transition={{ duration: reduced ? 0 : 0.5 }}
                />
              </div>
              <div className="min-h-[220px] overflow-x-auto px-4 py-5 font-mono text-[11px] leading-relaxed sm:text-xs">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={stage}
                    initial={reduced ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? undefined : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Artifact stage={stage} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
            <p className="mt-3 font-mono text-[11px] text-white/45">
              Artifacts from {TENDER.id} (synthetic sample pack). Text-based PDFs only; scanned pages are flagged, not read.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default PipelineSection;
