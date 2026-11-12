import React, { FormEvent, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import {
  EQUIPMENT_OPTIONS,
  EquipmentOption,
  FAQ_ITEMS,
  FAQ_SECTION_COPY,
  FINAL_CTA_COPY,
  PRICING_PLANS,
  PRICING_SECTION_COPY,
  TEAM_FOUNDER_DATA,
} from '../constants';
import { submitAuditRequest, validateWorkEmail } from '../utils/audit';
import { Pricing4 } from './ui/pricing-4';
import { Faq3 } from './ui/faq3';
import { CTASection } from './ui/hero-dithering-card';

export function OfferFormAndFaqSection() {
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [equipment, setEquipment] = useState<EquipmentOption>('MV switchgear');
  const [selectedPlan, setSelectedPlan] = useState<string>('Shadow Audit');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);

  const selectedPlanObj =
    PRICING_PLANS.find((p) => p.name === selectedPlan) || PRICING_PLANS[0];

  const focusAuditForm = (planName?: string) => {
    if (planName) {
      setSelectedPlan(planName);
    }
    const formEl = document.getElementById('audit');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth' });
      window.setTimeout(() => {
        const emailInput = document.getElementById('audit-email');
        emailInput?.focus();
      }, 200);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending) return;
    const validation = validateWorkEmail(email);
    if (!validation.valid) {
      setEmailError(validation.error || 'Enter a valid email address.');
      return;
    }

    setEmailError(null);
    setSendError(false);
    setSending(true);
    try {
      await submitAuditRequest(
        {
          email: email.trim(),
          company: company.trim(),
          equipment,
          plan: selectedPlanObj.name,
        },
        import.meta.env.VITE_INTAKE_ENDPOINT
      );
      setSubmitted(true);
    } catch {
      setSendError(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Pricing Section */}
      <Pricing4
        eyebrow={PRICING_SECTION_COPY.eyebrow}
        title={PRICING_SECTION_COPY.headline}
        plans={PRICING_PLANS}
        onSelectPlan={(planName) => focusAuditForm(planName)}
      />

      {/* FAQ Section (Verification & Integration) */}
      <Faq3
        eyebrow={FAQ_SECTION_COPY.eyebrow}
        heading={FAQ_SECTION_COPY.heading}
        description={FAQ_SECTION_COPY.description}
        items={FAQ_ITEMS}
        onSupportClick={() => focusAuditForm()}
      />

      {/* Final CTA & Lead Capture Section */}
      <CTASection
        id="audit"
        className="scroll-mt-12 py-32 sm:py-44"
        badge={FINAL_CTA_COPY.badge}
        heading={FINAL_CTA_COPY.headlineLead}
        headingMuted={FINAL_CTA_COPY.headlineMuted}
        description={FINAL_CTA_COPY.subtext}
        dither={false}
      >
            {/* Intake form sits inside the dithering card, replacing its default button */}
            <div
              id="audit-form"
              className="w-full max-w-xl rounded-3xl p-5 text-left sm:p-7"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
                <span className="font-mono text-xs uppercase tracking-wider text-[#FFFFFF]/70">
                  Send us a tender
                </span>
                <span className="bg-[#D4400F] text-[#FFFFFF] font-mono text-xs px-2.5 py-1 rounded">
                  Selected: {selectedPlanObj.name} ({selectedPlanObj.priceDisplay})
                </span>
              </div>

              {submitted ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-xl p-6 text-center"
                >
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[#FFFFFF]/20">
                    <Check className="h-5 w-5 text-[#FFFFFF]" />
                  </div>
                  <p className="font-serif text-2xl text-[#FFFFFF]">
                    Thanks. We&apos;ll reply within one business day.
                  </p>
                  <p className="mt-1 font-sans text-sm text-[#FFFFFF]/70">
                    We will email {email} with a mutual NDA and an upload link.
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  noValidate
                  className="grid grid-cols-1 gap-4 sm:grid-cols-2"
                >
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="audit-email"
                      className="block font-sans text-xs font-medium text-[#FFFFFF]"
                    >
                      Work email
                    </label>
                    <input
                      id="audit-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (emailError) setEmailError(null);
                      }}
                      aria-invalid={Boolean(emailError)}
                      aria-describedby={
                        emailError ? 'audit-email-error' : undefined
                      }
                      placeholder="name@company.com"
                      className="mt-1.5 h-10 w-full rounded-md border border-[#FFFFFF]/20 px-3 py-2 font-sans text-sm text-[#FFFFFF] placeholder:text-[#FFFFFF]/60 outline-none focus:border-[#D4400F] focus:ring-1 focus:ring-[#D4400F]"
                    />
                    {emailError && (
                      <p
                        id="audit-email-error"
                        role="alert"
                        className="mt-1.5 font-sans text-xs font-medium text-[#F87171]"
                      >
                        {emailError}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="audit-company"
                      className="block font-sans text-xs font-medium text-[#FFFFFF]"
                    >
                      Company name
                    </label>
                    <input
                      id="audit-company"
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="EPC or developer name"
                      className="mt-1.5 h-10 w-full rounded-md border border-[#FFFFFF]/20 px-3 py-2 font-sans text-sm text-[#FFFFFF] placeholder:text-[#FFFFFF]/60 outline-none focus:border-[#D4400F] focus:ring-1 focus:ring-[#D4400F]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="audit-equipment"
                      className="block font-sans text-xs font-medium text-[#FFFFFF]"
                    >
                      Equipment package
                    </label>
                    <select
                      id="audit-equipment"
                      value={equipment}
                      onChange={(e) =>
                        setEquipment(e.target.value as EquipmentOption)
                      }
                      className="mt-1.5 h-10 w-full rounded-md border border-[#FFFFFF]/20 px-3 py-2 font-sans text-sm text-[#FFFFFF] outline-none focus:border-[#D4400F] focus:ring-1 focus:ring-[#D4400F] cursor-pointer"
                    >
                      {EQUIPMENT_OPTIONS.map((option) => (
                        <option
                          key={option}
                          value={option}
                          className="bg-[#0B0B0B] text-[#FFFFFF]"
                        >
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2 pt-2">
                    {sendError && (
                      <p
                        role="alert"
                        className="mb-3 font-sans text-xs font-medium text-[#F87171]"
                      >
                        Could not send your request. Try again, or message{' '}
                        <a
                          href={TEAM_FOUNDER_DATA.socials.linkedin}
                          className="underline"
                        >
                          Akhil on LinkedIn
                        </a>
                        .
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={sending}
                      className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#D4400F] font-sans text-sm font-medium text-[#FFFFFF] transition-all duration-300 hover:bg-[#D4400F]/90 hover:ring-4 hover:ring-[#D4400F]/25 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {sending ? 'Sending...' : FINAL_CTA_COPY.submitButtonText}
                      {!sending && (
                        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
      </CTASection>
    </>
  );
}
