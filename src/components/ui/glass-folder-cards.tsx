"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface DisplayCardContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Minimal Display Card Container Frame (adapted from display-cards.txt)
 * Frames the showcase using minimal editorial surfaces with soft borders,
 * without any browser window chrome or debug bars.
 */
export function DisplayCardFrame({
  children,
  className,
}: DisplayCardContainerProps) {
  return (
    <div
      className={cn(
        "relative mx-auto max-w-5xl rounded-2xl border border-[#15120F]/15 bg-[#FDFBF7] p-6 sm:p-8 shadow-2xs",
        className
      )}
    >
      {children}
    </div>
  );
}

export default DisplayCardFrame;
