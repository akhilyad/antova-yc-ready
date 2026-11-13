import React from 'react';
import type { PageView } from './Navbar';
import HalftoneWordmarkFooter, { type FooterColumn } from './ui/halftone-wordmark-footer';
import { TEAM_FOUNDER_DATA } from '../constants';

interface SiteFooterProps {
  onNavigate: (view: PageView, sectionId?: string) => void;
  onAuditClick: () => void;
}

const COLUMNS: FooterColumn[] = [
  {
    title: 'Product',
    links: [
      { label: 'Compare', href: '/#compare' },
      { label: 'How it works', href: '/#how' },
      { label: 'Pricing', href: '/#pricing' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Team', href: '/team' },
      { label: 'FAQ', href: '/#faq' },
      { label: 'LinkedIn', href: TEAM_FOUNDER_DATA.socials.linkedin },
    ],
  },
  {
    title: 'Start',
    links: [{ label: 'Audit a tender free', href: '/#audit' }],
  },
];

/** Halftone "Antova" wordmark footer, coloured with the site tokens. */
export function SiteFooter({ onNavigate, onAuditClick }: SiteFooterProps) {
  // Internal links route through the SPA instead of reloading the page.
  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    const href = a?.getAttribute('href');
    if (!href || !href.startsWith('/')) return;
    e.preventDefault();
    if (href === '/team') return onNavigate('team');
    const id = href.split('#')[1];
    if (id === 'audit') return onAuditClick();
    onNavigate('home', id);
  };

  return (
    <HalftoneWordmarkFooter
      wordmark="Antova"
      label="Antova"
      meta="© 2026 · Bid audits for electrical tenders"
      columns={COLUMNS}
      palette={{ background: '#1A1512', ink: '#F1F0EF', warm: '#C4552D' }}
      fontFamily='"Geist", -apple-system, "Helvetica Neue", Arial, sans-serif'
      fontWeight={800}
      monoFamily='"Geist Mono", ui-monospace, SFMono-Regular, monospace'
      height="max(calc(250px + 25vw), 410px)"
      fill={0.9}
      crop={-0.14}
      onClickCapture={handleClick}
    />
  );
}

export default SiteFooter;
