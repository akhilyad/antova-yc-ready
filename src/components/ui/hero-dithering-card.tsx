"use client";

import { ArrowRight } from "lucide-react";
import { Suspense, lazy, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shader bundle is ~100 kB; load it only when the card mounts.
const Dithering = lazy(() =>
  import("@paper-design/shaders-react").then((mod) => ({
    default: mod.Dithering,
  }))
);

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
        <div className="relative overflow-hidden rounded-[48px] border border-border bg-card shadow-sm min-h-[600px] md:min-h-[600px] flex flex-col items-center justify-center duration-500">
          <Suspense
            fallback={<div className="absolute inset-0 bg-muted/20" />}
          >
            <div className="absolute inset-0 z-0 pointer-events-none opacity-40 dark:opacity-30 mix-blend-multiply dark:mix-blend-screen">
              <Dithering
                colorBack="#00000000" // Transparent
                colorFront={colorFront}
                shape="warp"
                type="4x4"
                speed={isHovered ? 0.6 : 0.2}
                className="size-full"
                minPixelRatio={1}
              />
            </div>
          </Suspense>

          <div className="relative z-10 px-6 py-16 max-w-4xl mx-auto text-center flex flex-col items-center">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              {badge}
            </div>

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
                className="group relative inline-flex h-14 items-center justify-center gap-3 overflow-hidden rounded-full bg-primary px-12 text-base font-medium text-primary-foreground transition-all duration-300 hover:bg-primary/90 hover:scale-105 active:scale-95 hover:ring-4 hover:ring-primary/20 cursor-pointer"
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
