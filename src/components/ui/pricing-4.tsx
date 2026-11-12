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
        'scroll-mt-12 w-full text-[#FFFFFF] py-32 sm:py-44 px-4 sm:px-6',
        className
      )}
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <p className="font-mono text-xs uppercase tracking-wider text-[#FFFFFF]/60">
            {eyebrow}
          </p>
          <h2 className="mt-3 font-serif text-3xl md:text-5xl text-[#FFFFFF] tracking-tight">
            {title}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 items-stretch">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className="relative flex flex-col justify-between rounded-2xl p-6 sm:p-8"
            >
              <div>
                {/* Header & Top-Right Pill */}
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-serif text-2xl text-[#FFFFFF] whitespace-nowrap">
                    {plan.name}
                  </h3>
                  {plan.recommended && (
                    <span className="shrink-0 pt-1.5 font-mono text-xs text-[#FF7A45]">Recommended</span>
                  )}
                  {!plan.recommended && plan.billingTerms && (
                    <span className="shrink-0 pt-1.5 font-mono text-xs text-[#FFFFFF]/50">
                      {plan.billingTerms}
                    </span>
                  )}
                </div>

                {/* Price */}
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="font-mono text-3xl sm:text-4xl font-bold text-[#FFFFFF]">
                    {plan.priceDisplay}
                  </span>
                  <span className="font-mono text-sm text-[#FFFFFF]/70">
                    {plan.suffix}
                  </span>
                </div>

                {/* Subtext */}
                <div className="mt-3 pb-3">
                  <p className="font-sans text-xs text-[#FFFFFF]/70">
                    {plan.audienceInfo}
                  </p>
                </div>

                {/* Additive Eyebrow Header if present */}
                {plan.featuresHeader && (
                  <p className="mt-5 font-mono text-xs font-semibold uppercase tracking-wider text-[#FFFFFF]">
                    {plan.featuresHeader}
                  </p>
                )}

                {/* Features List */}
                <ul
                  className={cn(
                    'space-y-3 text-sm font-sans text-[#FFFFFF]/85',
                    plan.featuresHeader ? 'mt-3' : 'mt-5'
                  )}
                >
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#FF7A45]" />
                      <span className="leading-snug">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Button */}
              <div className="mt-10">
                <a
                  href={plan.href}
                  onClick={(e) => {
                    if (onSelectPlan) {
                      e.preventDefault();
                      onSelectPlan(plan.name);
                    }
                  }}
                  className={cn(
                    'flex w-full items-center justify-center rounded-full px-5 py-3 font-sans text-sm font-medium transition cursor-pointer',
                    plan.recommended
                      ? 'bg-[#D4400F] text-[#FFFFFF] hover:bg-[#D4400F]/90'
                      : 'bg-white/[0.08] text-[#FFFFFF] hover:bg-white/15'
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
