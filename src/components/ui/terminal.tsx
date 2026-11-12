"use client";

import * as React from "react";
import { useInView, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Terminal (Magic UI pattern, as listed on 21st.dev): a window frame whose
 * lines appear one after another once it scrolls into view. Commands type out
 * character by character; output lines fade in. Adapted for the dither
 * background: outline only, no fill, mono type.
 *
 * Lines are passed as data so their order is explicit and stable across
 * re-renders.
 */

export type TerminalLine =
  | { kind: "cmd"; text: string; className?: string }
  | { kind: "out"; content: React.ReactNode; className?: string; hold?: number };

export interface TerminalProps {
  lines: TerminalLine[];
  title?: string;
  className?: string;
  /** Delay before the first line, in ms. */
  startDelay?: number;
  /** ms per typed character */
  typeSpeed?: number;
}

export function Terminal({
  lines,
  title = "zsh",
  className,
  startDelay = 400,
  typeSpeed = 18,
}: TerminalProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const reduced = !!useReducedMotion();
  // index of the line currently animating; lines.length means finished
  const [active, setActive] = React.useState(-1);
  const [typed, setTyped] = React.useState(0);

  React.useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setActive(lines.length);
      return;
    }
    const t = window.setTimeout(() => setActive(0), startDelay);
    return () => window.clearTimeout(t);
  }, [inView, reduced, startDelay, lines.length]);

  React.useEffect(() => {
    if (active < 0 || active >= lines.length) return;
    const line = lines[active];
    if (line.kind === "out") {
      const t = window.setTimeout(() => setActive((a) => a + 1), line.hold ?? 220);
      return () => window.clearTimeout(t);
    }
    setTyped(0);
    let i = 0;
    let done: number | undefined;
    const id = window.setInterval(() => {
      i += 1;
      setTyped(i);
      if (i >= line.text.length) {
        window.clearInterval(id);
        done = window.setTimeout(() => setActive((a) => a + 1), 250);
      }
    }, typeSpeed);
    return () => {
      window.clearInterval(id);
      if (done) window.clearTimeout(done);
    };
  }, [active, lines, typeSpeed]);

  return (
    <div
      ref={ref}
      className={cn(
        "w-full overflow-hidden rounded-xl border border-ink/15 text-left font-mono text-[11px] leading-relaxed sm:text-xs",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-brand-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink/25" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink/25" />
        <span className="ml-2 truncate text-ink/55">{title}</span>
      </div>
      {/* Every line is always rendered so the frame never changes height. */}
      <div className="overflow-x-auto px-4 py-4">
        <div className="grid min-w-max gap-y-1">
          {lines.map((line, i) => {
            const shown = i < active || (i === active && line.kind === "cmd");
            if (line.kind === "cmd") {
              const text = i < active ? line.text : i === active ? line.text.slice(0, typed) : "";
              return (
                <div key={i} className={cn("min-h-[1.6em] whitespace-pre", line.className)}>
                  <span className="text-brand-text">$ </span>
                  <span className="text-ink">{text}</span>
                  {i === active && (
                    <span className="ml-px inline-block h-[1em] w-[0.5em] translate-y-[2px] bg-ink/70 motion-safe:animate-pulse" />
                  )}
                </div>
              );
            }
            return (
              <div
                key={i}
                className={cn(
                  "min-h-[1.6em] whitespace-pre transition-opacity duration-300",
                  shown ? "opacity-100" : "opacity-0",
                  line.className
                )}
              >
                {line.content}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default Terminal;
