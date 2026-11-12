"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";

export type TiltStackItem = {
  id?: string;
  phaseTag?: string;
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
  visual?: React.ReactNode;
};

export type TiltStackScrollProps = {
  eyebrow?: string;
  heading?: string;
  items?: TiltStackItem[];
  className?: string;
  accentColor?: string;
  scrollPerItemVh?: number;
  rotateStepDeg?: number;
  offsetStepPx?: number;
  scaleStep?: number;
  leaveXPercent?: number;
  leaveYPercent?: number;
  leaveRotateDeg?: number;
  scrub?: number;
};

type Pose = {
  xPercent: number;
  yPercent: number;
  xPx: number;
  yPx: number;
  rotate: number;
  scale: number;
  opacity: number;
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const pad2 = (n: number) => String(n).padStart(2, "0");

function pose(
  i: number,
  progress: number,
  opts: {
    rotateStepDeg: number;
    offsetStepPx: number;
    scaleStep: number;
    leaveXPercent: number;
    leaveYPercent: number;
    leaveRotateDeg: number;
  }
): Pose {
  const rel = i - progress;

  if (rel < -1) {
    return {
      xPercent: -50 + opts.leaveXPercent,
      yPercent: -50 + opts.leaveYPercent,
      xPx: 0,
      yPx: 0,
      rotate: opts.leaveRotateDeg,
      scale: 0.94,
      opacity: 0,
    };
  }

  if (rel < 0) {
    const t = -rel;
    const ease = t * t * (3 - 2 * t);
    return {
      xPercent: -50 + ease * opts.leaveXPercent,
      yPercent: -50 + ease * opts.leaveYPercent,
      xPx: 0,
      yPx: 0,
      rotate: ease * opts.leaveRotateDeg,
      scale: 1 - ease * 0.05,
      opacity: clamp(1 - t * 1.6, 0, 1),
    };
  }

  return {
    xPercent: -50,
    yPercent: -50,
    xPx: rel * (opts.offsetStepPx * 0.4),
    yPx: rel * opts.offsetStepPx,
    rotate: rel * opts.rotateStepDeg,
    scale: Math.max(0.84, 1 - rel * opts.scaleStep),
    opacity: clamp(1 - rel * 0.24, 0, 1),
  };
}

function toTransform(p: Pose) {
  return `translate3d(calc(${p.xPercent}% + ${p.xPx}px), calc(${p.yPercent}% + ${p.yPx}px), 0) rotate(${p.rotate}deg) scale(${p.scale})`;
}

export function TiltStackScroll({
  eyebrow = "THE PROCUREMENT BOTTLENECK",
  heading = "Where project margins disappear.",
  items = [],
  className = "",
  accentColor = "#15120F",
  scrollPerItemVh = 95,
  rotateStepDeg = -3,
  offsetStepPx = 14,
  scaleStep = 0.035,
  leaveXPercent = -48,
  leaveYPercent = -60,
  leaveRotateDeg = -18,
  scrub = 0.55,
}: TiltStackScrollProps) {
  const safeItems = useMemo(() => items.filter(Boolean), [items]);
  const total = safeItems.length;

  const sectionRef = useRef<HTMLElement | null>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const triggerRef = useRef<ScrollTrigger | null>(null);
  const activeRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const prefersReducedMotion = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The deck is driven by scroll position, so a step button has to move the
  // page; setting card styles directly gets overwritten on the next scroll tick.
  const jumpToCard = (targetIdx: number) => {
    const st = triggerRef.current;
    if (!st) return;
    const steps = Math.max(1, total - 1);
    const top = st.start + ((st.end - st.start) * targetIdx) / steps;
    window.scrollTo({
      top: Math.ceil(top) + 1,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || total === 0) return;

    gsap.registerPlugin(ScrollTrigger);

    const steps = Math.max(1, total - 1);
    const apply = (progressFloat: number) => {
      const p = clamp(progressFloat, 0, steps);
      const nearest = clamp(Math.round(p), 0, total - 1);

      if (nearest !== activeRef.current) {
        activeRef.current = nearest;
        setActiveIndex(nearest);
      }

      cardRefs.current.forEach((card, i) => {
        if (!card) return;
        const nextPose = pose(i, p, {
          rotateStepDeg,
          offsetStepPx,
          scaleStep,
          leaveXPercent,
          leaveYPercent,
          leaveRotateDeg,
        });
        card.style.transform = toTransform(nextPose);
        card.style.opacity = String(nextPose.opacity);
        card.style.pointerEvents = i === nearest ? "auto" : "none";
      });
    };

    apply(0);

    const reduced = prefersReducedMotion();
    const ctx = gsap.context(() => {
      triggerRef.current = ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        scrub: reduced ? true : scrub,
        // Settle on a whole card instead of resting mid-transition.
        snap:
          total > 1 && !reduced
            ? {
                snapTo: 1 / steps,
                duration: { min: 0.2, max: 0.45 },
                delay: 0.08,
                ease: "power1.inOut",
              }
            : undefined,
        invalidateOnRefresh: true,
        onUpdate: (self) => apply(self.progress * steps),
      });
    }, section);

    const id = requestAnimationFrame(() => ScrollTrigger.refresh());

    return () => {
      cancelAnimationFrame(id);
      triggerRef.current = null;
      ctx.revert();
    };
  }, [
    total,
    rotateStepDeg,
    offsetStepPx,
    scaleStep,
    leaveXPercent,
    leaveYPercent,
    leaveRotateDeg,
    scrub,
  ]);

  if (total === 0) return null;

  const sectionHeightVh = Math.max(150, 100 + (total - 1) * scrollPerItemVh);

  return (
    <section
      ref={sectionRef}
      style={{ height: `${sectionHeightVh}vh` }}
      className={cn(
        "relative w-full bg-[#F6F2EA] text-[#15120F] border-t border-[#15120F]/10 scroll-mt-32",
        className
      )}
    >
      <div className="sticky top-0 flex h-screen w-full flex-col justify-between overflow-hidden px-4 pt-24 pb-8 sm:px-6 sm:pt-28 md:px-10 md:pt-28 md:pb-10">
        {/* Top Header + Progress Step Selector */}
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-[#15120F]/60">
              {eyebrow}
            </p>
            <h2 className="mt-2 font-serif text-3xl tracking-tight text-[#15120F] md:text-5xl">
              {heading}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {safeItems.map((item, idx) => {
              const isCurrent = idx === activeIndex;
              return (
                <button
                  key={item.id ?? idx}
                  type="button"
                  onClick={() => jumpToCard(idx)}
                  aria-label={`Show problem ${idx + 1} of ${total}: ${item.title}`}
                  aria-pressed={isCurrent}
                  className={cn(
                    "px-3 py-1.5 rounded-md font-mono text-xs transition border cursor-pointer",
                    isCurrent
                      ? "bg-[#15120F] text-[#F6F2EA] border-[#15120F]"
                      : "bg-[#FDFBF7] text-[#15120F]/70 border-[#15120F]/15 hover:bg-[#EDE8DE] hover:text-[#15120F]"
                  )}
                >
                  {pad2(idx + 1)} / {pad2(total)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Stacked Tilt Deck */}
        <div className="relative mx-auto my-4 min-h-0 w-full max-w-6xl flex-1 md:my-auto md:h-[72vh] md:max-h-[540px] md:flex-none">
          {safeItems.map((item, i) => {
            const initial = pose(i, 0, {
              rotateStepDeg,
              offsetStepPx,
              scaleStep,
              leaveXPercent,
              leaveYPercent,
              leaveRotateDeg,
            });

            return (
              <article
                key={item.id ?? `${item.title}-${i}`}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                style={{
                  zIndex: total - i,
                  transform: toTransform(initial),
                  opacity: initial.opacity,
                  willChange: "transform, opacity",
                }}
                className="absolute left-1/2 top-1/2 h-[94%] w-[96%] max-w-5xl select-none overflow-hidden rounded-2xl border border-[#15120F]/10 bg-[#FDFBF7] p-5 shadow-md sm:p-8 md:h-[88%] md:p-10"
              >
                <div className="grid h-full grid-cols-1 content-start gap-5 md:grid-cols-12 md:content-center md:gap-8 md:items-center">
                  {/* Left Narrative Column */}
                  <div className="flex flex-col justify-between md:col-span-5 md:h-full md:py-1">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-md border border-[#15120F]/15 bg-[#EDE8DE]/70 px-2.5 py-1 font-mono text-xs uppercase tracking-wider text-[#15120F]/80">
                        <span>{item.phaseTag ?? `PHASE ${pad2(i + 1)}`}</span>
                      </div>

                      <h3 className="mt-3 font-serif md:mt-4 text-2xl leading-tight tracking-tight text-[#15120F] sm:text-3xl md:text-4xl">
                        {item.title}
                      </h3>

                      <p className="mt-3 font-sans text-sm leading-relaxed text-[#15120F]/75 sm:text-base">
                        {item.description}
                      </p>
                    </div>

                    <div className="mt-4 hidden items-center justify-between border-t border-[#15120F]/10 pt-3 md:flex">
                      <span
                        style={{ color: accentColor }}
                        className="font-mono text-xs font-medium tracking-wider uppercase"
                      >
                        CARD {pad2(i + 1)} OF {pad2(total)}
                      </span>
                      <span className="font-mono text-xs text-[#15120F]/55">
                        Scroll or pick a step
                      </span>
                    </div>
                  </div>

                  {/* Right Engineering Visual Column */}
                  <div className="relative flex flex-col justify-center overflow-hidden rounded-xl border border-[#15120F]/15 bg-[#F6F2EA] p-3 sm:p-5 md:col-span-7 md:h-full md:min-h-[210px]">
                    {item.visual ? (
                      item.visual
                    ) : item.image ? (
                      <img
                        src={item.image}
                        alt={item.imageAlt ?? item.title}
                        className="h-full w-full object-cover rounded-lg"
                        draggable={false}
                      />
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Bottom Status Bar */}
        <div className="mx-auto hidden w-full max-w-6xl items-center justify-between font-mono text-xs text-[#15120F]/60 sm:flex">
          <span>
            ACTIVE PHASE: {pad2(activeIndex + 1)} / {pad2(total)}
          </span>
          <span>TECHNICAL BID RISK BREAKDOWN</span>
        </div>
      </div>
    </section>
  );
}

export default TiltStackScroll;
