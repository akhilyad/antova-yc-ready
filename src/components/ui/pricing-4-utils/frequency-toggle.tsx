import React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export type FREQUENCY = 'monthly' | 'yearly';

interface FrequencyToggleProps {
  frequency: FREQUENCY;
  setFrequency: React.Dispatch<React.SetStateAction<FREQUENCY>>;
  className?: string;
}

export function FrequencyToggle({
  frequency,
  setFrequency,
  className,
}: FrequencyToggleProps) {
  const options: { value: FREQUENCY; label: string }[] = [
    { value: 'monthly', label: 'Standard' },
    { value: 'yearly', label: 'Annual (-20%)' },
  ];

  return (
    <div
      role="group"
      aria-label="Billing frequency"
      className={cn(
        'border-border bg-muted inline-flex items-center rounded-full border p-1',
        className
      )}
    >
      {options.map((option) => {
        const isActive = frequency === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setFrequency(option.value)}
            aria-pressed={isActive}
            className={cn(
              'relative z-10 rounded-full px-4 py-1.5 font-mono-cite text-xs transition-colors duration-150 cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
              isActive
                ? 'font-medium text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isActive && (
              <motion.span
                layoutId="pricing-frequency-pill"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className="bg-primary absolute inset-0 -z-10 rounded-full"
              />
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
