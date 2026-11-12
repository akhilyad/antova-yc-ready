import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Marquee (Magic UI pattern, as listed on 21st.dev). Repeats its children and
 * scrolls them horizontally with a CSS animation; pauses on hover and stops
 * for reduced-motion users. Edges fade out with a mask instead of a coloured
 * gradient, so it blends with any background.
 */
export interface MarqueeProps {
  children: React.ReactNode;
  className?: string;
  reverse?: boolean;
  pauseOnHover?: boolean;
  /** Seconds for one full loop. */
  duration?: number;
  repeat?: number;
}

export function Marquee({
  children,
  className,
  reverse = false,
  pauseOnHover = true,
  duration = 40,
  repeat = 3,
}: MarqueeProps) {
  return (
    <div
      className={cn(
        "group flex overflow-hidden [--gap:2.5rem] [gap:var(--gap)] [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]",
        className
      )}
      style={{ ["--duration" as string]: `${duration}s` }}
    >
      {Array.from({ length: repeat }).map((_, i) => (
        <div
          key={i}
          aria-hidden={i > 0}
          className={cn(
            "flex shrink-0 items-center justify-around [gap:var(--gap)] motion-safe:animate-marquee",
            reverse && "[animation-direction:reverse]",
            pauseOnHover && "group-hover:[animation-play-state:paused]"
          )}
        >
          {children}
        </div>
      ))}
    </div>
  );
}

export default Marquee;
