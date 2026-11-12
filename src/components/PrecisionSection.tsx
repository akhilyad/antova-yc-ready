import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { PRECISION_COPY } from '../constants';

/** One mono line of evidence under each claim, taken from the sample run. */
const PROOF = [
  'locate → {page, quote} · parse → 31.5 kA · compare → ✗',
  'p.11 · bbox [56.0, 65.2, 509.5, 79.0] · “NOTE 7: …”',
  'drawing p.11 (tier 1) > cover letter p.2 (tier 3)',
  '11 bays × €1,600.00 + 1 lot × €900.00 = €18,500.00',
  'status MANUAL_INSPECTION_REQUIRED · confidence 0.0',
  'key = sha256 · prompt locate-v1 · model',
];

export function PrecisionSection() {
  const reduced = useReducedMotion();
  return (
    <section id="features" className="scroll-mt-12 px-4 py-24 text-white sm:py-32 md:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-wider text-[#D4400F]">{PRECISION_COPY.eyebrow}</p>
          <h2 className="mt-4 font-serif text-4xl tracking-tight sm:text-5xl md:text-6xl">
            {PRECISION_COPY.headlineLead}{' '}
            <em className="italic text-white/85">{PRECISION_COPY.headlineItalic}</em>
          </h2>
        </div>

        <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {PRECISION_COPY.items.map((item, i) => (
            <motion.div
              key={item.kicker}
              initial={reduced ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: reduced ? 0 : (i % 3) * 0.08 }}
              className="border-t border-white/15 pt-5"
            >
              <p className="font-mono text-[11px] uppercase tracking-wider text-white/50">
                <span className="text-[#D4400F]">{String(i + 1).padStart(2, '0')}</span> · {item.kicker}
              </p>
              <h3 className="mt-3 font-serif text-2xl leading-snug tracking-tight">{item.title}</h3>
              <p className="mt-2 font-sans text-sm leading-relaxed text-white/70">{item.body}</p>
              <p className="mt-4 break-words font-mono text-[11px] text-[#FF7A45]/90">{PROOF[i]}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default PrecisionSection;
