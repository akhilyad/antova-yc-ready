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
import { SiteFooter } from './components/SiteFooter';
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

      <SiteFooter onNavigate={handleNavigate} onAuditClick={scrollToAudit} />
    </div>
  );
}
