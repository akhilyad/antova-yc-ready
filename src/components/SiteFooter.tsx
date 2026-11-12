import React from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PageView } from './Navbar';
import {
  PulseBadge,
  pillButtonClass,
} from './ui/hero-dithering-card';

interface SiteFooterProps {
  onNavigate: (view: PageView, sectionId?: string) => void;
  onAuditClick: () => void;
}

const FOOTER_LINKS: {
  label: string;
  href: string;
  view: PageView;
  sectionId?: string;
}[] = [
  { label: 'Compare', href: '/#compare', view: 'home', sectionId: 'compare' },
  { label: 'Try it', href: '/#verification', view: 'home', sectionId: 'verification' },
  { label: 'Pricing', href: '/#pricing', view: 'home', sectionId: 'pricing' },
  { label: 'FAQ', href: '/#faq', view: 'home', sectionId: 'faq' },
  { label: 'Team', href: '/team', view: 'team' },
];

/** Frosted footer card over the page-wide dither. */
export function SiteFooter({ onNavigate, onAuditClick }: SiteFooterProps) {
  return (
    <footer className="w-full px-4 pb-6 pt-4 text-[#FFFFFF] md:px-6">
      <div
        className="relative mx-auto w-full max-w-7xl"
      >
        <div className="relative">

          <div className="relative z-10 grid gap-10 px-6 py-12 sm:px-10 md:grid-cols-12 md:py-16 lg:px-14">
            <div className="flex flex-col items-start gap-6 md:col-span-7">
              <PulseBadge className="text-xs">Taking tenders this week</PulseBadge>
              <a
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('home');
                }}
                className="font-serif text-6xl font-medium leading-none tracking-tight text-foreground md:text-8xl"
              >
                Antova
              </a>
              <p className="max-w-md font-sans text-base leading-relaxed text-muted-foreground">
                Technical bid evaluation for electrical tenders. Every number
                traced to the page it came from.
              </p>
              <button
                type="button"
                onClick={onAuditClick}
                className={cn(pillButtonClass, 'h-12 px-8 text-sm')}
              >
                <span className="relative z-10">Audit a tender</span>
                <ArrowRight className="relative z-10 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </button>
            </div>

            <nav
              aria-label="Footer navigation"
              className="md:col-span-5 md:justify-self-end"
            >
              <p className="mb-4 font-mono text-xs uppercase tracking-wider text-[#FFFFFF]/60">
                Explore
              </p>
              <ul className="grid grid-cols-2 gap-x-10 gap-y-3 font-sans text-base">
                {FOOTER_LINKS.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      onClick={(e) => {
                        e.preventDefault();
                        onNavigate(link.view, link.sectionId);
                      }}
                      className="text-[#FFFFFF]/75 transition-colors hover:text-[#D4400F]"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
                <li>
                  <a
                    href="/#audit"
                    onClick={(e) => {
                      e.preventDefault();
                      onAuditClick();
                    }}
                    className="text-[#FFFFFF]/75 transition-colors hover:text-[#D4400F]"
                  >
                    Contact
                  </a>
                </li>
              </ul>
            </nav>

            <div className="flex flex-col gap-2 border-t border-[#FFFFFF]/10 pt-6 font-mono text-xs text-[#FFFFFF]/60 sm:flex-row sm:items-center sm:justify-between md:col-span-12">
              <span>© 2026 Antova</span>
              <span>Mutual NDA on every tender · Engineer-reviewed within 24 hours</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
