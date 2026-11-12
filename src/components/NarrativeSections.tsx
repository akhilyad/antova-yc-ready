import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { INTRO_COPY, MANIFESTO_COPY } from '../constants';
import { TENDER, VENDORS } from '../data/tender402';
import { formatEuro } from '../utils/audit';
import { Marquee } from './ui/marquee';

/** Scroll reveal shared by the narrative beats. */
function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** One-line manifesto between the hero and the problem chapters. */
export function ManifestoSection() {
  return (
    <section className="px-4 py-28 text-white sm:py-40 md:px-6">
      <Reveal className="mx-auto max-w-3xl text-center">
        <p className="font-serif text-3xl leading-[1.2] tracking-tight sm:text-4xl md:text-5xl">
          {MANIFESTO_COPY.lead}{' '}
          <em className="italic text-[#FF7A45]">{MANIFESTO_COPY.italic}</em>
        </p>
      </Reveal>
    </section>
  );
}

/** "Introducing Antova." beat, with the leveled bids running underneath. */
export function IntroSection() {
  return (
    <section className="px-4 py-24 text-white sm:py-32 md:px-6">
      <Reveal className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <img src="/antova-logo.svg" alt="" aria-hidden="true" className="mb-6 h-9 w-9 opacity-90" />
        <h2 className="font-serif text-4xl tracking-tight sm:text-5xl md:text-6xl">
          {INTRO_COPY.heading}
        </h2>
        <p className="mt-5 font-sans text-base leading-relaxed text-white/70 md:text-lg">
          {INTRO_COPY.body}
        </p>
      </Reveal>

      <div className="mx-auto mt-14 max-w-5xl">
        <Marquee duration={30} reverse>
          {VENDORS.map((v) => (
            <span key={v.id} className="flex items-baseline gap-3 whitespace-nowrap font-mono text-xs">
              <span className="text-white">{v.short}</span>
              <span className="text-white/45">{v.headlineCitation}</span>
              <span className="text-white/45">headline {formatEuro(v.headline)}</span>
            </span>
          ))}
          <span className="whitespace-nowrap font-mono text-xs text-[#D4400F]">
            {TENDER.id} · {TENDER.bayCount} bays · 33 kV GIS
          </span>
        </Marquee>
      </div>
    </section>
  );
}
