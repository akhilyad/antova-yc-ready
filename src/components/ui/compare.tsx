"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
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

    const startTime = Date.now();
    const animate = () => {
      const elapsedTime = Date.now() - startTime;
      const progress =
        (elapsedTime % (autoplayDuration * 2)) / autoplayDuration;
      const percentage = progress <= 1 ? progress * 100 : (2 - progress) * 100;

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
      role="region"
      aria-label={`Before and after comparison: ${firstLabel} versus ${secondLabel}`}
      className={cn(
        "relative w-full h-[320px] overflow-hidden rounded-2xl border border-[#15120F]/15 bg-[#FDFBF7] select-none",
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
      <AnimatePresence initial={false}>
        <motion.div
          className="h-full w-px absolute top-0 z-40 bg-[#15120F]/40"
          style={{
            left: `${sliderXPercent}%`,
          }}
          transition={{ duration: 0 }}
        >
          {showHandlebar && (
            <div className="h-7 w-7 rounded-full top-1/2 -translate-y-1/2 bg-[#15120F] text-[#F6F2EA] z-40 -left-3.5 absolute flex items-center justify-center shadow-sm border border-[#F6F2EA]/30">
              <GripVertical className="h-3.5 w-3.5" />
            </div>
          )}
        </motion.div>
      </AnimatePresence>

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
