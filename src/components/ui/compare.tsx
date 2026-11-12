"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { GripVertical } from "lucide-react";

export interface CompareProps {
  firstImage?: string;
  secondImage?: string;
  firstContent?: React.ReactNode;
  secondContent?: React.ReactNode;
  firstLabel?: string;
  secondLabel?: string;
  className?: string;
  firstImageClassName?: string;
  secondImageClassname?: string;
  initialSliderPercentage?: number;
  slideMode?: "hover" | "drag";
  showHandlebar?: boolean;
  autoplay?: boolean;
  autoplayDuration?: number;
}

export const Compare = ({
  firstImage = "",
  secondImage = "",
  firstContent,
  secondContent,
  firstLabel = "As Quoted",
  secondLabel = "Audited",
  className,
  firstImageClassName,
  secondImageClassname,
  initialSliderPercentage = 50,
  slideMode = "hover",
  showHandlebar = true,
  autoplay = false,
  autoplayDuration = 5000,
}: CompareProps) => {
  const [sliderXPercent, setSliderXPercent] = useState(initialSliderPercentage);
  const [isDragging, setIsDragging] = useState(false);

  const sliderRef = useRef<HTMLDivElement>(null);
  const autoplayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startAutoplay = useCallback(() => {
    if (!autoplay) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const startTime = Date.now();
    const animate = () => {
      const elapsedTime = Date.now() - startTime;
      const progress =
        (elapsedTime % (autoplayDuration * 2)) / autoplayDuration;
      const sweep = progress <= 1 ? progress : 2 - progress;
      // Keep the sweep off the edges so both documents stay readable.
      const percentage = 15 + sweep * 70;

      setSliderXPercent(percentage);
      autoplayRef.current = setTimeout(animate, 16);
    };

    animate();
  }, [autoplay, autoplayDuration]);

  const stopAutoplay = useCallback(() => {
    if (autoplayRef.current) {
      clearTimeout(autoplayRef.current);
      autoplayRef.current = null;
    }
  }, []);

  useEffect(() => {
    startAutoplay();
    return () => stopAutoplay();
  }, [startAutoplay, stopAutoplay]);

  function mouseEnterHandler() {
    stopAutoplay();
  }

  function mouseLeaveHandler() {
    if (slideMode === "hover") {
      setSliderXPercent(initialSliderPercentage);
    }
    if (slideMode === "drag") {
      setIsDragging(false);
    }
    startAutoplay();
  }

  const handleStart = useCallback(
    (_clientX: number) => {
      if (slideMode === "drag") {
        setIsDragging(true);
      }
    },
    [slideMode]
  );

  const handleEnd = useCallback(() => {
    if (slideMode === "drag") {
      setIsDragging(false);
    }
  }, [slideMode]);

  const handleMove = useCallback(
    (clientX: number) => {
      if (!sliderRef.current) return;
      if (slideMode === "hover" || (slideMode === "drag" && isDragging)) {
        const rect = sliderRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const percent = (x / rect.width) * 100;
        requestAnimationFrame(() => {
          setSliderXPercent(Math.max(5, Math.min(95, percent)));
        });
      }
    },
    [slideMode, isDragging]
  );

  return (
    <div
      ref={sliderRef}
      role="slider"
      tabIndex={0}
      aria-label={`Before and after comparison: ${firstLabel} versus ${secondLabel}`}
      aria-valuemin={5}
      aria-valuemax={95}
      aria-valuenow={Math.round(sliderXPercent)}
      aria-valuetext={`${Math.round(sliderXPercent)}% ${firstLabel}`}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 15 : 5;
        let next: number | null = null;
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = sliderXPercent - step;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") next = sliderXPercent + step;
        if (e.key === "Home") next = 5;
        if (e.key === "End") next = 95;
        if (next === null) return;
        e.preventDefault();
        stopAutoplay();
        setSliderXPercent(Math.max(5, Math.min(95, next)));
      }}
      className={cn(
        "relative w-full h-[320px] overflow-hidden rounded-2xl border border-[#15120F]/15 bg-[#FDFBF7] select-none outline-none focus-visible:ring-2 focus-visible:ring-[#15120F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDFBF7]",
        className
      )}
      style={{
        cursor: slideMode === "drag" ? "grab" : "col-resize",
      }}
      onMouseMove={(e) => handleMove(e.clientX)}
      onMouseLeave={mouseLeaveHandler}
      onMouseEnter={mouseEnterHandler}
      onMouseDown={(e) => handleStart(e.clientX)}
      onMouseUp={handleEnd}
      onTouchStart={(e) => {
        if (!autoplay) handleStart(e.touches[0].clientX);
      }}
      onTouchEnd={() => {
        if (!autoplay) handleEnd();
      }}
      onTouchMove={(e) => {
        if (!autoplay) handleMove(e.touches[0].clientX);
      }}
    >
      {/* Top Handle Labels */}
      <div className="pointer-events-none absolute inset-x-4 top-3.5 z-30 flex items-center justify-between font-mono text-[11px] uppercase tracking-wider">
        <span className="rounded border border-[#15120F]/15 bg-[#F6F2EA] px-2.5 py-1 text-[#15120F]/75">
          {firstLabel}
        </span>
        <span className="rounded border border-[#15120F]/20 bg-[#FFE98A] px-2.5 py-1 font-semibold text-[#15120F]">
          {secondLabel}
        </span>
      </div>

      {/* Vertical Divider Line + Handlebar */}
      {/* Glowing divider (Aceternity compare): gradient line plus two masked
          light washes that trail to the right of the handle. */}
      <motion.div
          aria-hidden="true"
          className="h-full w-px absolute top-0 m-auto z-40 bg-gradient-to-b from-transparent from-[5%] via-[#D4400F] to-transparent to-[95%]"
          style={{
            left: `${sliderXPercent}%`,
          }}
          transition={{ duration: 0 }}
        >
          <div className="pointer-events-none absolute left-0 top-1/2 z-20 h-full w-36 -translate-y-1/2 bg-gradient-to-r from-[#FFE98A] via-transparent to-transparent opacity-70 [mask-image:radial-gradient(100px_at_left,white,transparent)]" />
          <div className="pointer-events-none absolute left-0 top-1/2 z-10 h-1/2 w-10 -translate-y-1/2 bg-gradient-to-r from-[#D4400F] via-transparent to-transparent opacity-60 [mask-image:radial-gradient(50px_at_left,white,transparent)]" />
          {showHandlebar && (
            <div className="absolute -right-2.5 top-1/2 z-30 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md border border-[#15120F]/15 bg-[#FDFBF7] shadow-[0_1px_3px_rgba(21,18,15,0.25)]">
              <GripVertical className="h-3.5 w-3.5 text-[#15120F]" />
            </div>
          )}
        </motion.div>

      {/* First Layer (Left Handle - "As Quoted") */}
      <div className="overflow-hidden w-full h-full relative z-20 pointer-events-none">
        <motion.div
          className={cn(
            "absolute inset-0 z-20 w-full h-full select-none overflow-hidden bg-[#FDFBF7]",
            firstImageClassName
          )}
          style={{
            clipPath: `inset(0 ${100 - sliderXPercent}% 0 0)`,
          }}
          transition={{ duration: 0 }}
        >
          {firstContent ? (
            firstContent
          ) : firstImage ? (
            <img
              alt={firstLabel}
              src={firstImage}
              className={cn(
                "absolute inset-0 z-20 w-full h-full select-none object-cover",
                firstImageClassName
              )}
              draggable={false}
            />
          ) : null}
        </motion.div>
      </div>

      {/* Second Layer (Right Handle - "Audited") */}
      <div
        className={cn(
          "absolute inset-0 z-10 w-full h-full select-none bg-[#F6F2EA]",
          secondImageClassname
        )}
      >
        {secondContent ? (
          secondContent
        ) : secondImage ? (
          <img
            className={cn(
              "absolute inset-0 w-full h-full select-none object-cover",
              secondImageClassname
            )}
            alt={secondLabel}
            src={secondImage}
            draggable={false}
          />
        ) : null}
      </div>
    </div>
  );
};
