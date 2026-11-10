import React, { useState } from 'react';
import { cn } from '@/lib/utils';

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
        'bg-[#FDFBF7]/90 fixed left-1/2 z-50 w-[min(92%,860px)] -translate-x-1/2 rounded-full border border-[#15120F]/15 shadow-2xs backdrop-blur-md transition-all duration-200',
        'top-4 lg:top-6'
      )}
    >
      <div className="flex items-center justify-between gap-6 px-6 py-3">
        {/* Zone 1: Single brand wordmark */}
        <a
          href="/"
          onClick={handleBrandClick}
          className="font-serif text-2xl tracking-tight text-[#15120F] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#15120F]"
        >
          Antova
        </a>

        {/* Zone 2: Desktop Navigation Links */}
        <nav
          aria-label="Primary navigation"
          className="hidden lg:flex items-center gap-6"
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
                  'font-sans text-sm font-medium transition-colors hover:text-[#15120F] hover:underline hover:underline-offset-4 whitespace-nowrap shrink-0',
                  isActive
                    ? 'text-[#15120F] underline underline-offset-4'
                    : 'text-[#15120F]/70'
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
            className="rounded-md bg-[#15120F] px-4 py-2 font-sans text-xs font-medium text-[#F6F2EA] hover:bg-[#15120F]/90 transition cursor-pointer"
          >
            Audit a tender
          </button>

          <button
            type="button"
            aria-label={isMenuOpen ? 'Close main menu' : 'Open main menu'}
            aria-expanded={isMenuOpen}
            className="text-[#15120F]/70 hover:text-[#15120F] relative flex size-8 items-center justify-center lg:hidden cursor-pointer"
            onClick={() => setIsMenuOpen((prev) => !prev)}
          >
            <span className="sr-only">Open main menu</span>
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
        <div className="bg-[#FDFBF7] border-[#15120F]/15 absolute inset-x-0 top-[calc(100%+0.5rem)] flex flex-col rounded-2xl border p-5 shadow-lg lg:hidden">
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
