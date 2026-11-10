import React from 'react';
import { PRICING_PLANS, PRICING_SECTION_COPY, PricingPlan } from '@/constants';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Pricing4Props {
  title?: string;
  eyebrow?: string;
  plans?: PricingPlan[];
  className?: string;
  onSelectPlan?: (planName: string) => void;
}

export const Pricing4 = ({
  eyebrow = PRICING_SECTION_COPY.eyebrow,
  title = PRICING_SECTION_COPY.headline,
  plans = PRICING_PLANS,
  className,
  onSelectPlan,
}: Pricing4Props) => {
  return (
    <section
      id="pricing"
      className={cn(
        'w-full bg-[#F6F2EA] text-[#15120F] border-t border-[#15120F]/10 py-20 sm:py-24 px-4 sm:px-6',
        className
      )}
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <p className="font-mono text-xs uppercase tracking-wider text-[#15120F]/60">
            {eyebrow}
          </p>
          <h2 className="mt-3 font-serif text-3xl md:text-5xl text-[#15120F] tracking-tight">
            {title}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 items-stretch">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                'relative flex flex-col justify-between rounded-2xl border bg-[#FDFBF7] p-6 sm:p-8 shadow-2xs transition-all',
                plan.recommended
                  ? 'border-[#15120F] ring-1 ring-[#15120F]'
                  : 'border-[#15120F]/15'
              )}
            >
              <div>
                {/* Header & Top-Right Pill */}
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-serif text-2xl text-[#15120F] whitespace-nowrap">
                    {plan.name}
                  </h3>
                  {plan.recommended && (
                    <span className="inline-block shrink-0 rounded-md bg-[#FFE98A] px-2.5 py-0.5 font-mono text-xs font-semibold text-[#15120F] border border-[#15120F]/20">
                      Recommended
                    </span>
                  )}
                  {!plan.recommended && plan.billingTerms && (
                    <span className="inline-block shrink-0 rounded-md bg-[#EDE8DE] px-2.5 py-0.5 font-mono text-xs font-medium text-[#15120F] border border-[#15120F]/15">
                      {plan.billingTerms}
                    </span>
                  )}
                </div>

                {/* Price */}
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="font-mono text-3xl sm:text-4xl font-bold text-[#15120F]">
                    {plan.priceDisplay}
                  </span>
                  <span className="font-mono text-sm text-[#15120F]/70">
                    {plan.suffix}
                  </span>
                </div>

                {/* Subtext */}
                <div className="mt-3 pb-5 border-b border-[#15120F]/10">
                  <p className="font-sans text-xs text-[#15120F]/70">
                    {plan.audienceInfo}
                  </p>
                </div>

                {/* Additive Eyebrow Header if present */}
                {plan.featuresHeader && (
                  <p className="mt-5 font-mono text-xs font-semibold uppercase tracking-wider text-[#15120F]">
                    {plan.featuresHeader}
                  </p>
                )}

                {/* Features List */}
                <ul
                  className={cn(
                    'space-y-3 text-sm font-sans text-[#15120F]/85',
                    plan.featuresHeader ? 'mt-3' : 'mt-5'
                  )}
                >
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#EDE8DE] border border-[#15120F]/20 text-[#15120F]">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                      <span className="leading-snug">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Button */}
              <div className="mt-8 pt-4 border-t border-[#15120F]/10">
                <a
                  href={plan.href}
                  onClick={(e) => {
                    if (onSelectPlan) {
                      e.preventDefault();
                      onSelectPlan(plan.name);
                    }
                  }}
                  className={cn(
                    'flex w-full items-center justify-center rounded-md px-5 py-3 font-sans text-sm font-medium transition cursor-pointer',
                    plan.recommended
                      ? 'bg-[#15120F] text-[#F6F2EA] hover:bg-[#15120F]/90'
                      : 'border border-[#15120F]/25 bg-[#F6F2EA] text-[#15120F] hover:bg-[#EDE8DE]'
                  )}
                >
                  {plan.buttonText}
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
