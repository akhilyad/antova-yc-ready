"use client";

import React, { ReactElement, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface AnimatedListProps {
  className?: string;
  children: React.ReactNode;
  delay?: number;
}

export const AnimatedList = React.memo(
  ({ className, children, delay = 2400 }: AnimatedListProps) => {
    const childrenArray = useMemo(
      () => React.Children.toArray(children),
      [children]
    );
    const [index, setIndex] = useState(childrenArray.length - 1);
    const reduceMotion = useReducedMotion();

    useEffect(() => {
      if (childrenArray.length <= 1 || reduceMotion) return;
      const interval = setInterval(() => {
        setIndex((prevIndex) => (prevIndex + 1) % childrenArray.length);
      }, delay);

      return () => clearInterval(interval);
    }, [childrenArray.length, delay, reduceMotion]);

    const itemsToShow = useMemo(() => {
      if (childrenArray.length === 0) return [];
      const rotated: React.ReactNode[] = [];
      for (let i = 0; i < childrenArray.length; i++) {
        rotated.push(childrenArray[(index + i) % childrenArray.length]);
      }
      return rotated;
    }, [index, childrenArray]);

    return (
      <div className={cn("flex flex-col items-center gap-2.5 w-full", className)}>
        <AnimatePresence initial={false}>
          {itemsToShow.map((item) => (
            <AnimatedListItem key={(item as ReactElement).key}>
              {item}
            </AnimatedListItem>
          ))}
        </AnimatePresence>
      </div>
    );
  }
);

AnimatedList.displayName = "AnimatedList";

export function AnimatedListItem({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ scale: 0.98, opacity: 0.85 }}
      animate={{ scale: 1, opacity: 1, originY: 0 }}
      exit={{ scale: 0.98, opacity: 0.85 }}
      transition={{ type: "spring", stiffness: 320, damping: 35 }}
      layout
      className="mx-auto w-full"
    >
      {children}
    </motion.div>
  );
}
