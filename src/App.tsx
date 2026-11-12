/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AuditMatrixSection } from './components/AuditMatrixSection';
import { HeroSection } from './components/HeroSection';
import { Navbar, PageView } from './components/Navbar';
import { OfferFormAndFaqSection } from './components/OfferFormAndFaqSection';
import { ProblemStackSection } from './components/ProblemStackSection';
import { SiteFooter } from './components/SiteFooter';
import { IntroSection, ManifestoSection } from './components/NarrativeSections';
import { PipelineSection } from './components/PipelineSection';
import { PrecisionSection } from './components/PrecisionSection';
import { TeamPage } from './components/TeamPage';
import { DitheringPageBackground } from './components/ui/hero-dithering-card';

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
    <div className="relative isolate min-h-screen text-[#FFFFFF] font-sans">
      <DitheringPageBackground />
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
            {/* Hero: headline, live ingest terminal, MR requirement ticker */}
            <HeroSection onAuditClick={scrollToAudit} />

            {/* Manifesto line */}
            <ManifestoSection />

            {/* Three problem chapters (TiltStackScroll) */}
            <ProblemStackSection />

            {/* "Introducing Antova." */}
            <IntroSection />

            {/* Bid compliance matrix: the leveled price, cell by cell */}
            <AuditMatrixSection />

            {/* Ingest pipeline walkthrough */}
            <PipelineSection />

            {/* Why the numbers hold */}
            <PrecisionSection />

            {/* Pricing, FAQ, final CTA with intake form */}
            <OfferFormAndFaqSection />
          </>
        )}
      </main>

      <SiteFooter onNavigate={handleNavigate} onAuditClick={scrollToAudit} />
    </div>
  );
}
