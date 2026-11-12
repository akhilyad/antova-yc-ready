import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Small sentence-case label above a headline. No pill, no animation. */
export function PulseBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("font-mono text-xs text-brand-soft", className)}>
      {children}
    </p>
  );
}

/** Primary call to action: light pill on the dark canvas. */
export const pillButtonClass =
  "group relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-full bg-primary font-medium text-primary-foreground transition-colors duration-150 hover:bg-[#FFE2C7] active:bg-[#F1D4BC] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

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
  className?: string;
}

/** Closing call to action on a single raised surface. */
export function CTASection({
  id,
  badge,
  heading,
  headingMuted,
  description,
  buttonText = "Get started",
  onButtonClick,
  children,
  className,
}: CTASectionProps) {
  return (
    <section
      id={id}
      className={cn("flex w-full items-center justify-center px-4 md:px-6", className)}
    >
      <div className="surface w-full max-w-5xl">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-20 text-center sm:py-28">
          {badge && <PulseBadge className="mb-6">{badge}</PulseBadge>}

          <h2 className="mb-6 font-serif text-5xl font-normal leading-[1.05] tracking-tight text-ink md:text-7xl">
            {heading} <br />
            <em className="italic text-brand-text">{headingMuted}</em>
          </h2>

          {description && (
            <p className="mb-12 max-w-xl text-lg leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}

          {children ?? (
            <button
              type="button"
              onClick={onButtonClick}
              className={cn(pillButtonClass, "h-14 px-12 text-base")}
            >
              <span className="relative z-10">{buttonText}</span>
              <ArrowRight className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export default CTASection;
