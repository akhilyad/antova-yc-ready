"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Display Cards (21st.dev), reworked for the page-wide dither background.
 * The original fanned three skewed cards over one grid cell, which only reads
 * when each card has an opaque fill. With no card surfaces on the page, the
 * entries are laid out as an open list instead: orange icon, mono title,
 * finding, citation, separated by spacing and a thin accent rule.
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
        "group relative flex flex-col gap-1.5 border-l-2 border-[#D4400F]/40 py-1 pl-4 transition-colors duration-300 hover:border-[#D4400F]",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex rounded-full bg-[#D4400F] p-1 text-[#FFFFFF]",
            iconClassName
          )}
        >
          {icon}
        </span>
        <p
          className={cn(
            "font-mono text-sm font-semibold uppercase tracking-wider text-[#FFFFFF]",
            titleClassName
          )}
        >
          {title}
        </p>
      </div>
      <p className="font-sans text-base text-[#FFFFFF] sm:text-lg">
        {description}
      </p>
      <p className="font-mono text-xs text-[#FFFFFF]/60">{date}</p>
    </div>
  );
}

export interface DisplayCardsProps {
  cards?: DisplayCardProps[];
  className?: string;
}

export default function DisplayCards({ cards, className }: DisplayCardsProps) {
  const list = cards ?? [{}, {}, {}];

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {list.slice(0, 3).map((card, i) => (
        <DisplayCard key={i} {...card} />
      ))}
    </div>
  );
}

export interface DisplayCardFrameProps {
  children: React.ReactNode;
  className?: string;
}

/** Plain wrapper the Solution section uses around its demos (no surface). */
export function DisplayCardFrame({ children, className }: DisplayCardFrameProps) {
  return (
    <div className={cn("relative mx-auto max-w-5xl", className)}>
      {children}
    </div>
  );
}

export { DisplayCards };
