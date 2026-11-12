import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pillButtonClass } from './ui/hero-dithering-card';

export type PageView = 'home' | 'team';

interface NavbarProps {
  currentView: PageView;
  onNavigate: (view: PageView, sectionId?: string) => void;
  onAuditClick: () => void;
}

const NAV_ITEMS: {
  label: string;
  href: string;
  view: PageView;
  sectionId?: string;
}[] = [
  {
    label: 'How It Works',
    href: '/#how-it-works',
    view: 'home',
    sectionId: 'how-it-works',
  },
  {
    label: 'Verification',
    href: '/#verification',
    view: 'home',
    sectionId: 'verification',
  },
  {
    label: 'Features',
    href: '/#features',
    view: 'home',
    sectionId: 'features',
  },
  { label: 'Pricing', href: '/#pricing', view: 'home', sectionId: 'pricing' },
  { label: 'FAQ', href: '/#faq', view: 'home', sectionId: 'faq' },
  { label: 'Team', href: '/team', view: 'team' },
];

export function Navbar({ currentView, onNavigate, onAuditClick }: NavbarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMenuOpen]);

  const handleItemClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    item: (typeof NAV_ITEMS)[number]
  ) => {
    e.preventDefault();
    setIsMenuOpen(false);
    onNavigate(item.view, item.sectionId);
  };

  const handleBrandClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setIsMenuOpen(false);
    onNavigate('home');
  };

  return (
    <header
      className={cn(
        'bg-card/85 fixed left-1/2 z-50 w-[min(92%,880px)] -translate-x-1/2 rounded-full border border-border shadow-sm backdrop-blur-md transition-all duration-200',
        'top-4 lg:top-6'
      )}
    >
      <div className="flex items-center justify-between gap-4 py-2.5 pr-3 pl-5 sm:gap-6 sm:py-3 sm:pr-4 sm:pl-6">
        {/* Zone 1: Single brand wordmark */}
        <a
          href="/"
          onClick={handleBrandClick}
          className="inline-flex items-center gap-2 font-serif text-2xl tracking-tight text-[#15120F] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#15120F]"
        >
          <span aria-hidden="true" className="relative flex h-2 w-2">
            <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D4400F] opacity-60"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#D4400F]"></span>
          </span>
          Antova
        </a>

        {/* Zone 2: Desktop Navigation Links */}
        <nav
          aria-label="Primary navigation"
          className="hidden lg:flex items-center gap-1"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = item.view === 'team' && currentView === 'team';
            return (
              <a
                key={item.label}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                onClick={(e) => handleItemClick(e, item)}
                className={cn(
                  'rounded-full px-3 py-1.5 font-sans text-sm font-medium transition-colors whitespace-nowrap shrink-0',
                  isActive
                    ? 'bg-primary/5 text-[#15120F]'
                    : 'text-[#15120F]/70 hover:bg-primary/5 hover:text-[#15120F]'
                )}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: Primary Action + Mobile Menu Toggle */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false);
              onAuditClick();
            }}
            className={cn(pillButtonClass, 'h-9 gap-2 px-4 font-sans text-xs')}
          >
            <span className="relative z-10">Audit a tender</span>
            <ArrowRight className="relative z-10 h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
          </button>

          <button
            type="button"
            aria-label={isMenuOpen ? 'Close main menu' : 'Open main menu'}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav"
            className="text-[#15120F]/70 hover:text-[#15120F] relative flex size-9 items-center justify-center lg:hidden cursor-pointer"
            onClick={() => setIsMenuOpen((prev) => !prev)}
          >
            <div className="relative block w-[18px] h-3.5">
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-0 top-1/2 block h-0.5 w-full -translate-y-1/2 rounded-full bg-current transition duration-200 ease-in-out',
                  isMenuOpen ? 'rotate-45' : '-translate-y-1.5'
                )}
              />
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-0 top-1/2 block h-0.5 w-full -translate-y-1/2 rounded-full bg-current transition duration-200 ease-in-out',
                  isMenuOpen ? 'opacity-0' : ''
                )}
              />
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-0 top-1/2 block h-0.5 w-full -translate-y-1/2 rounded-full bg-current transition duration-200 ease-in-out',
                  isMenuOpen ? '-rotate-45' : 'translate-y-1.5'
                )}
              />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Menu */}
      {isMenuOpen && (
        <div
          id="mobile-nav"
          className="bg-card border-border absolute inset-x-0 top-[calc(100%+0.5rem)] flex flex-col rounded-3xl border p-5 shadow-lg lg:hidden"
        >
          <nav
            aria-label="Mobile navigation"
            className="divide-[#15120F]/10 flex flex-col divide-y"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = item.view === 'team' && currentView === 'team';
              return (
                <a
                  key={item.label}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={(e) => handleItemClick(e, item)}
                  className={cn(
                    'py-3 font-sans text-base font-medium transition-colors first:pt-0 last:pb-0',
                    isActive
                      ? 'text-[#15120F] font-semibold'
                      : 'text-[#15120F]/80 hover:text-[#15120F]'
                  )}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
