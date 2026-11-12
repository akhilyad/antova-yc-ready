"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";

export type TiltStackItem = {
  id?: string;
  phaseTag?: string;
  title: string;
  /** Optional second line, set in italic serif. */
  titleItalic?: string;
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
  /** Z-rotation a card carries while it is still travelling in. */
  arriveRotateDeg?: number;
  /** How far (vh) below centre an incoming card starts. */
  arriveOffsetVh?: number;
  /** Per-layer tip-back (rotateX) for cards buried under newer ones. */
  tipBackDeg?: number;
  /** Per-layer upward peek (px) so buried card edges stay visible. */
  peekPx?: number;
  scaleStep?: number;
  /** Per-layer fade-out of buried cards (0-1). */
  darkenStep?: number;
  scrub?: number;
};

type Pose = {
  yVh: number;
  yPx: number;
  rotateZ: number;
  rotateX: number;
  scale: number;
  /** Card opacity. Cards have no fill, so buried/incoming ones fade out. */
  alpha: number;
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const pad2 = (n: number) => String(n).padStart(2, "0");

type PoseOpts = {
  arriveRotateDeg: number;
  arriveOffsetVh: number;
  tipBackDeg: number;
  peekPx: number;
  scaleStep: number;
  darkenStep: number;
};

/**
 * rel > 0: card has not landed yet and travels up from below, tilted.
 * rel <= 0: card has landed; each newer card on top pushes it back one layer.
 */
function pose(i: number, progress: number, o: PoseOpts): Pose {
  const rel = i - progress;

  if (rel > 0) {
    const t = clamp(rel, 0, 1);
    const ease = t * t * (3 - 2 * t);
    return {
      yVh: ease * o.arriveOffsetVh,
      yPx: 0,
      rotateZ: ease * o.arriveRotateDeg,
      rotateX: 0,
      scale: 1,
      alpha: 1 - ease,
    };
  }

  const depth = Math.min(-rel, 3);
  return {
    yVh: 0,
    yPx: -depth * o.peekPx,
    rotateZ: 0,
    rotateX: depth * o.tipBackDeg,
    scale: 1 - depth * o.scaleStep,
    alpha: clamp(1 - depth * (1 + o.darkenStep * 4), 0, 1),
  };
}

function toTransform(p: Pose) {
  return `translate3d(-50%, calc(-50% + ${p.yVh}vh + ${p.yPx}px), 0) perspective(1400px) rotateX(${p.rotateX}deg) rotateZ(${p.rotateZ}deg) scale(${p.scale})`;
}

export function TiltStackScroll({
  eyebrow = "THE PROCUREMENT BOTTLENECK",
  heading = "Where project margins disappear.",
  items = [],
  className = "",
  accentColor = "#D4400F",
  scrollPerItemVh = 95,
  arriveRotateDeg = 7,
  arriveOffsetVh = 95,
  tipBackDeg = 9,
  peekPx = 22,
  scaleStep = 0.055,
  darkenStep = 0.22,
  scrub = 0.55,
}: TiltStackScrollProps) {
  const safeItems = useMemo(() => items.filter(Boolean), [items]);
  const total = safeItems.length;

  const sectionRef = useRef<HTMLElement | null>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const railRef = useRef<HTMLDivElement | null>(null);
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
    const poseOpts: PoseOpts = {
      arriveRotateDeg,
      arriveOffsetVh,
      tipBackDeg,
      peekPx,
      scaleStep,
      darkenStep,
    };
    const apply = (progressFloat: number) => {
      const p = clamp(progressFloat, 0, steps);
      const nearest = clamp(Math.round(p), 0, total - 1);

      if (nearest !== activeRef.current) {
        activeRef.current = nearest;
        setActiveIndex(nearest);
      }

      cardRefs.current.forEach((card, i) => {
        if (!card) return;
        const nextPose = pose(i, p, poseOpts);
        card.style.transform = toTransform(nextPose);
        card.style.pointerEvents = i === nearest ? "auto" : "none";
        card.style.opacity = String(nextPose.alpha);
      });

      if (railRef.current) {
        railRef.current.style.transform = `scaleX(${steps ? p / steps : 1})`;
      }
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
    arriveRotateDeg,
    arriveOffsetVh,
    tipBackDeg,
    peekPx,
    scaleStep,
    darkenStep,
    scrub,
  ]);

  if (total === 0) return null;

  const sectionHeightVh = Math.max(150, 100 + (total - 1) * scrollPerItemVh);

  return (
    <section
      ref={sectionRef}
      style={{ height: `${sectionHeightVh}vh` }}
      className={cn(
        "relative w-full text-[#FFFFFF]",
        className
      )}
    >
      <div className="sticky top-0 flex h-screen w-full flex-col justify-between overflow-hidden px-4 pt-24 pb-8 sm:px-6 sm:pt-28 md:px-10 md:pt-28 md:pb-10">
        {/* Top Header + Progress Step Selector */}
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-[#FFFFFF]/60">
              {eyebrow}
            </p>
            <h2 className="mt-2 font-serif text-3xl tracking-tight text-[#FFFFFF] md:text-5xl">
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
                      ? "bg-[#D4400F] text-[#FFFFFF] border-[#D4400F]"
                      : "text-[#FFFFFF]/70 border-[#FFFFFF]/15 hover:bg-white/10 hover:text-[#FFFFFF]"
                  )}
                >
                  {pad2(idx + 1)} / {pad2(total)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Stacked Tilt Deck */}
        <div className="relative mx-auto my-4 min-h-0 w-full max-w-6xl flex-1 md:my-auto md:h-[72vh] md:max-h-[540px] md:flex-none lg:max-h-[600px]">
          {safeItems.map((item, i) => {
            const initial = pose(i, 0, {
              arriveRotateDeg,
              arriveOffsetVh,
              tipBackDeg,
              peekPx,
              scaleStep,
              darkenStep,
            });

            return (
              <article
                key={item.id ?? `${item.title}-${i}`}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                style={{
                  zIndex: i + 1,
                  transform: toTransform(initial),
                  opacity: initial.alpha,
                  transformOrigin: "50% 0%",
                  willChange: "transform",
                }}
                className="absolute left-1/2 top-1/2 h-[94%] w-[96%] max-w-5xl select-none overflow-hidden rounded-3xl p-5 sm:p-8 md:h-[88%] md:p-10"
              >
                <div className="grid h-full grid-cols-1 content-start gap-5 md:grid-cols-12 md:content-center md:gap-8 md:items-center">
                  {/* Left Narrative Column */}
                  <div className="flex flex-col justify-between md:col-span-5 md:h-full md:py-1">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-md border border-[#FFFFFF]/15 px-2.5 py-1 font-mono text-xs uppercase tracking-wider text-[#FFFFFF]/80">
                        <span>{item.phaseTag ?? `PHASE ${pad2(i + 1)}`}</span>
                      </div>

                      <h3 className="mt-3 font-serif md:mt-4 text-2xl leading-tight tracking-tight text-[#FFFFFF] sm:text-3xl md:text-4xl">
                        {item.title}
                        {item.titleItalic && (
                          <>
                            {" "}
                            <em className="italic text-[#FF7A45]">{item.titleItalic}</em>
                          </>
                        )}
                      </h3>

                      <p className="mt-3 font-sans text-sm leading-relaxed text-[#FFFFFF]/75 sm:text-base">
                        {item.description}
                      </p>
                    </div>

                    <div className="mt-4 hidden items-center justify-between border-t border-[#FFFFFF]/10 pt-3 md:flex">
                      <span
                        style={{ color: accentColor }}
                        className="font-mono text-xs font-medium tracking-wider uppercase"
                      >
                        CARD {pad2(i + 1)} OF {pad2(total)}
                      </span>
                      <span className="font-mono text-xs text-[#FFFFFF]/60">
                        Scroll or pick a step
                      </span>
                    </div>
                  </div>

                  {/* Right Engineering Visual Column */}
                  <div className="relative flex flex-col justify-center overflow-hidden rounded-xl p-3 sm:p-5 md:col-span-7 md:h-full md:min-h-[210px]">
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

        {/* Counter + progress rail */}
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 font-mono text-xs text-[#FFFFFF]/60">
          <span className="shrink-0 tabular-nums">
            <span className="text-[#FFFFFF]">{pad2(activeIndex + 1)}</span> /{" "}
            {pad2(total)}
          </span>
          <div className="relative h-px flex-1 overflow-hidden bg-[#FFFFFF]/15">
            <div
              ref={railRef}
              style={{ backgroundColor: accentColor, transform: "scaleX(0)" }}
              className="absolute inset-0 origin-left"
            />
          </div>
          <span className="hidden shrink-0 sm:inline">
            SAMPLE TENDER TENDER-2026-402
          </span>
        </div>
      </div>
    </section>
  );
}

export default TiltStackScroll;
