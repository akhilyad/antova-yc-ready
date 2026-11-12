"use client";

import { ArrowRight } from "lucide-react";
import { Suspense, lazy, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

// Shader bundle is ~100 kB; load it only when the card mounts.
const Dithering = lazy(() =>
  import("@paper-design/shaders-react").then((mod) => ({
    default: mod.Dithering,
  }))
);

export interface DitheringBackgroundProps {
  colorFront?: string;
  /** Speeds the pattern up while the parent card is hovered. */
  active?: boolean;
  shape?: "warp" | "simplex" | "dots" | "wave" | "ripple" | "swirl" | "sphere";
  className?: string;
}

/** The animated dither layer on its own, for reuse in any rounded card. */
export function DitheringBackground({
  colorFront = "#EC4E02",
  active = false,
  shape = "warp",
  className,
}: DitheringBackgroundProps) {
  return (
    <Suspense fallback={<div className="absolute inset-0 bg-black" />}>
      <div
        className={cn(
          "absolute inset-0 z-0 pointer-events-none opacity-50 mix-blend-screen",
          className
        )}
      >
        <Dithering
          colorBack="#00000000" // Transparent
          colorFront={colorFront}
          shape={shape}
          type="4x4"
          speed={active ? 0.6 : 0.2}
          className="size-full"
          minPixelRatio={1}
        />
      </div>
    </Suspense>
  );
}

export interface DitheringPageBackgroundProps {
  colorFront?: string;
  /** Shader layer opacity. Keep it low so body copy stays readable. */
  opacity?: number;
  speed?: number;
  className?: string;
}

/**
 * Full-viewport version of the dither. Mount once at the layout root; it sits
 * fixed behind everything (-z-10) so every section scrolls over one continuous
 * live canvas. Ancestors must not paint an opaque background.
 */
export function DitheringPageBackground({
  colorFront = "#EC4E02",
  opacity = 0.32,
  speed = 0.2,
  className,
}: DitheringPageBackgroundProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-0 -z-10 bg-black",
        className
      )}
    >
      <Suspense fallback={null}>
        <div className="absolute inset-0 mix-blend-screen" style={{ opacity }}>
          <Dithering
            colorBack="#00000000"
            colorFront={colorFront}
            shape="warp"
            type="4x4"
            speed={reduceMotion ? 0 : speed}
            className="size-full"
            minPixelRatio={1}
          />
        </div>
      </Suspense>
      {/* Soft vignette: keeps the centre column, where most copy sits, calmer */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_45%,rgba(0,0,0,0.6)_0%,rgba(0,0,0,0.25)_70%,transparent_100%)]" />
    </div>
  );
}

/** Frosted surface for content sitting over the page dither. */
/** Content over the page dither: no fill, no border, it blends into the shader. */
export const frostedSurfaceClass = "border-transparent bg-transparent";

/** Live-dot pill used above headlines on dithering cards. */
export function PulseBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary backdrop-blur-sm",
        className
      )}
    >
      <span className="relative flex h-2 w-2">
        <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
      </span>
      {children}
    </div>
  );
}

/** Pill button from the dithering card (dark fill, ring and nudge on hover). */
export const pillButtonClass =
  "group relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-full bg-primary font-medium text-primary-foreground transition-all duration-300 hover:bg-primary/90 motion-safe:hover:scale-105 motion-safe:active:scale-95 hover:ring-4 hover:ring-primary/20 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export interface CTASectionProps {
  id?: string;
  badge?: string;
  heading?: ReactNode;
  headingMuted?: ReactNode;
  description?: ReactNode;
  buttonText?: string;
  onButtonClick?: () => void;
  /** Rendered under the description. When present, the default button is hidden. */
  children?: ReactNode;
  /** Dither dot colour. Defaults to the original 21st.dev accent. */
  colorFront?: string;
  /** Render the card's own dither. Turn off when a page-level dither is mounted. */
  dither?: boolean;
  className?: string;
}

export function CTASection({
  id,
  badge = "AI-Powered Writing",
  heading = "Your words,",
  headingMuted = "delivered perfectly.",
  description = "Join 2,847 founders using the only AI that understands the nuance of your voice. Clean, precise, and uniquely yours.",
  buttonText = "Start Typing",
  onButtonClick,
  children,
  colorFront = "#EC4E02",
  dither = true,
  className,
}: CTASectionProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <section
      id={id}
      className={cn(
        "py-12 w-full flex justify-center items-center px-4 md:px-6",
        className
      )}
    >
      <div
        className="w-full max-w-7xl relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          className={cn(
            "relative overflow-hidden rounded-[48px] min-h-[600px] md:min-h-[600px] flex flex-col items-center justify-center duration-500",
            dither ? "border border-border bg-card shadow-sm" : frostedSurfaceClass
          )}
        >
          {dither && <DitheringBackground colorFront={colorFront} active={isHovered} />}

          <div className="relative z-10 px-6 py-16 max-w-4xl mx-auto text-center flex flex-col items-center">
            <PulseBadge className="mb-8">{badge}</PulseBadge>

            <h2 className="font-serif text-5xl md:text-7xl lg:text-8xl font-medium tracking-tight text-foreground mb-8 leading-[1.05]">
              {heading} <br />
              <span className="text-foreground/80">{headingMuted}</span>
            </h2>

            <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mb-12 leading-relaxed">
              {description}
            </p>

            {children ?? (
              <button
                type="button"
                onClick={onButtonClick}
                className={cn(pillButtonClass, "h-14 px-12 text-base")}
              >
                <span className="relative z-10">{buttonText}</span>
                <ArrowRight className="h-5 w-5 relative z-10 transition-transform duration-300 group-hover:translate-x-1" />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default CTASection;
