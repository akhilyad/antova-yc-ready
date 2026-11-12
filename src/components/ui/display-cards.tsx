"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Display Cards (21st.dev). Three skewed cards share one grid cell and fan out
 * diagonally; the back cards stay greyed out until hovered. Recoloured for the
 * Antova cream palette.
 */

export interface DisplayCardProps {
  className?: string;
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  date?: React.ReactNode;
  iconClassName?: string;
  titleClassName?: string;
}

export function DisplayCard({
  className,
  icon,
  title = "Featured",
  description = "Discover amazing content",
  date = "Just now",
  iconClassName,
  titleClassName,
}: DisplayCardProps) {
  return (
    <div
      className={cn(
        "relative flex h-32 w-[14rem] -skew-y-[8deg] sm:h-36 select-none flex-col justify-between rounded-xl border-2 border-[#15120F]/15 bg-[#EDE8DE]/80 px-4 py-3 backdrop-blur-sm transition-all duration-700",
        "after:absolute after:-right-1 after:top-[-5%] after:h-[110%] after:w-[6rem] after:bg-gradient-to-l after:from-[#FDFBF7] after:to-transparent after:content-[''] sm:w-[22rem] sm:after:w-[8rem]",
        "hover:border-[#15120F]/30 hover:bg-[#FDFBF7] [&>*]:flex [&>*]:items-center [&>*]:gap-2",
        className
      )}
    >
      <div>
        <span
          className={cn(
            "relative inline-block rounded-full bg-[#15120F] p-1 text-[#FFE98A]",
            iconClassName
          )}
        >
          {icon}
        </span>
        <p
          className={cn(
            "font-mono text-sm font-semibold uppercase tracking-wider text-[#15120F]",
            titleClassName
          )}
        >
          {title}
        </p>
      </div>
      <p className="whitespace-nowrap font-sans text-sm text-[#15120F] sm:text-lg">
        {description}
      </p>
      <p className="font-mono text-xs text-[#15120F]/60">{date}</p>
    </div>
  );
}

const backCard =
  "before:absolute before:left-0 before:top-0 before:h-full before:w-full before:rounded-xl before:bg-[#F6F2EA]/50 before:bg-blend-overlay before:outline-1 before:outline-[#15120F]/10 before:transition-opacity before:duration-700 before:content-[''] grayscale-[100%] hover:before:opacity-0 hover:grayscale-0";

const stackPositions = [
  cn("[grid-area:stack] hover:-translate-y-10", backCard),
  cn(
    "[grid-area:stack] translate-x-4 translate-y-10 hover:-translate-y-1 sm:translate-x-16",
    backCard
  ),
  "[grid-area:stack] translate-x-8 translate-y-20 hover:translate-y-10 sm:translate-x-32",
];

export interface DisplayCardsProps {
  cards?: DisplayCardProps[];
  className?: string;
}

export default function DisplayCards({ cards, className }: DisplayCardsProps) {
  const list = cards ?? [{}, {}, {}];

  return (
    <div
      className={cn(
        "grid place-items-center [grid-template-areas:'stack']",
        className
      )}
    >
      {list.slice(0, 3).map((card, i) => (
        <DisplayCard
          key={i}
          {...card}
          className={cn(stackPositions[i], card.className)}
        />
      ))}
    </div>
  );
}

export interface DisplayCardFrameProps {
  children: React.ReactNode;
  className?: string;
}

/** Plain editorial container the Solution section uses around its demos. */
export function DisplayCardFrame({ children, className }: DisplayCardFrameProps) {
  return (
    <div
      className={cn(
        "relative mx-auto max-w-5xl rounded-3xl border border-[#15120F]/15 bg-[#FDFBF7] p-4 shadow-2xs sm:p-8",
        className
      )}
    >
      {children}
    </div>
  );
}

export { DisplayCards };
