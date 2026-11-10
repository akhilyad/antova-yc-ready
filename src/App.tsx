/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { FeatureBentoSection } from './components/FeatureBentoSection';
import { HeroSection } from './components/HeroSection';
import { Navbar, PageView } from './components/Navbar';
import { OfferFormAndFaqSection } from './components/OfferFormAndFaqSection';
import { ProblemStackSection } from './components/ProblemStackSection';
import { SolutionMockupSection } from './components/SolutionMockupSection';
import { TeamPage } from './components/TeamPage';

function getInitialView(): PageView {
  if (typeof window !== 'undefined') {
    const path = window.location.pathname.replace(/\/+$/, '');
    if (path === '/team') {
      return 'team';
    }
  }
  return 'home';
}

export default function App() {
  const [currentView, setCurrentView] = useState<PageView>(getInitialView);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentView(getInitialView());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = (nextView: PageView, sectionId?: string) => {
    const targetPath = nextView === 'team' ? '/team' : '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }

    if (nextView !== currentView) {
      setCurrentView(nextView);
      if (sectionId) {
        window.setTimeout(() => {
          const el = document.getElementById(sectionId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
          }
        }, 60);
      } else {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
      return;
    }

    if (sectionId) {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollToAudit = () => {
    handleNavigate('home', 'audit');
  };

  return (
    <div className="min-h-screen bg-[#F6F2EA] text-[#15120F] font-sans">
      <Navbar
        currentView={currentView}
        onNavigate={handleNavigate}
        onAuditClick={scrollToAudit}
      />

      <main>
        {currentView === 'team' ? (
          <TeamPage
            onBackHome={() => handleNavigate('home')}
            onAuditClick={scrollToAudit}
          />
        ) : (
          <>
            {/* Section 1: Hero & 3-State Interactive Pushback Widget */}
            <HeroSection onAuditClick={scrollToAudit} />

            {/* Section 2: Problem Stack (TiltStackScroll) */}
            <ProblemStackSection />

            {/* Section 3: Solution Transition & Product Mockup */}
            <SolutionMockupSection />

            {/* Section 4: Feature Bento Grid */}
            <FeatureBentoSection />

            {/* Sections 5, 6, 7: Additive Pricing, Objection Handling FAQ Pro, Final Banner CTA */}
            <OfferFormAndFaqSection />
          </>
        )}
      </main>

      {/* Footer with Antova navigation & Team link */}
      <footer className="w-full bg-[#F6F2EA] text-[#15120F] border-t border-[#15120F]/10 py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col items-center justify-between gap-6 text-sm text-[#15120F]/70 md:flex-row">
          <div className="flex flex-wrap items-baseline gap-3">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                handleNavigate('home');
              }}
              className="font-serif text-xl text-[#15120F]"
            >
              Antova
            </a>
            <span className="font-mono text-xs uppercase tracking-wider text-[#15120F]/60">
              Technical bid evaluation for electrical tenders
            </span>
          </div>

          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap items-center justify-center gap-6 font-sans text-xs sm:text-sm">
              <li>
                <a
                  href="/#how-it-works"
                  onClick={(e) => {
                    e.preventDefault();
                    handleNavigate('home', 'how-it-works');
                  }}
                  className="hover:text-[#15120F] transition-colors"
                >
                  How It Works
                </a>
              </li>
              <li>
                <a
                  href="/#verification"
                  onClick={(e) => {
                    e.preventDefault();
                    handleNavigate('home', 'verification');
                  }}
                  className="hover:text-[#15120F] transition-colors"
                >
                  Verification
                </a>
              </li>
              <li>
                <a
                  href="/#features"
                  onClick={(e) => {
                    e.preventDefault();
                    handleNavigate('home', 'features');
                  }}
                  className="hover:text-[#15120F] transition-colors"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="/#pricing"
                  onClick={(e) => {
                    e.preventDefault();
                    handleNavigate('home', 'pricing');
                  }}
                  className="hover:text-[#15120F] transition-colors"
                >
                  Pricing
                </a>
              </li>
              <li>
                <a
                  href="/#faq"
                  onClick={(e) => {
                    e.preventDefault();
                    handleNavigate('home', 'faq');
                  }}
                  className="hover:text-[#15120F] transition-colors"
                >
                  FAQ
                </a>
              </li>
              <li>
                <a
                  href="/team"
                  onClick={(e) => {
                    e.preventDefault();
                    handleNavigate('team');
                  }}
                  className="hover:text-[#15120F] transition-colors"
                >
                  Team
                </a>
              </li>
              <li>
                <a
                  href="/#audit"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToAudit();
                  }}
                  className="hover:text-[#15120F] transition-colors"
                >
                  Contact
                </a>
              </li>
              <li className="font-mono text-xs text-[#15120F]/55">
                © 2026 Antova
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
