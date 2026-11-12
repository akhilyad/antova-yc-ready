import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  BENTO_FEATURES,
  EQUIPMENT_OPTIONS,
  FAQ_ITEMS,
  FAQ_SECTION_COPY,
  FINAL_CTA_COPY,
  HERO_CHART_COPY,
  HERO_COPY,
  PRICING_PLANS,
  PRICING_SECTION_COPY,
  PROBLEM_STACK_SECTION,
  SOLUTION_TRANSITION_COPY,
  TEAM_FOUNDER_DATA,
  VENDOR_BIDS,
} from '../constants';
import {
  formatEuro,
  getVendorDisplayPrice,
  getVendorPenaltyTotal,
  sortVendorsByMode,
  submitAuditRequest,
  validateWorkEmail,
} from './audit';

describe('Antova bid evaluation & enterprise copy polish tests', () => {
  it('computes Vendor B penalties and display prices accurately across all 3 modes', () => {
    const vendorB = VENDOR_BIDS.find((v) => v.id === 'B')!;
    const vendorA = VENDOR_BIDS.find((v) => v.id === 'A')!;

    assert.equal(getVendorPenaltyTotal(vendorB, 'sticker'), 0);
    assert.equal(getVendorPenaltyTotal(vendorB, 'true'), 64800);
    assert.equal(getVendorPenaltyTotal(vendorB, 'pushback'), 18300);

    assert.equal(getVendorDisplayPrice(vendorB, 'sticker'), 418000);
    assert.equal(getVendorDisplayPrice(vendorB, 'true'), 482800);
    assert.equal(getVendorDisplayPrice(vendorB, 'pushback'), 436300);

    assert.equal(getVendorDisplayPrice(vendorA, 'sticker'), 452000);
    assert.equal(getVendorDisplayPrice(vendorA, 'true'), 452000);
    assert.equal(getVendorDisplayPrice(vendorA, 'pushback'), 452000);
  });

  it('sorts vendors from lowest to highest in each mode', () => {
    const stickerOrder = sortVendorsByMode(VENDOR_BIDS, 'sticker');
    assert.equal(stickerOrder[0].id, 'B');
    assert.equal(stickerOrder[1].id, 'A');

    const trueOrder = sortVendorsByMode(VENDOR_BIDS, 'true');
    assert.equal(trueOrder[0].id, 'A');
    assert.equal(trueOrder[1].id, 'B');

    const pushbackOrder = sortVendorsByMode(VENDOR_BIDS, 'pushback');
    assert.equal(pushbackOrder[0].id, 'B');
    assert.equal(pushbackOrder[1].id, 'A');
  });

  it('formats euro amounts cleanly and validates work emails', () => {
    assert.equal(formatEuro(418000), '€418,000');
    assert.equal(formatEuro(482800), '€482,800');
    assert.equal(formatEuro(436300), '€436,300');

    assert.equal(validateWorkEmail('').valid, false);
    assert.equal(validateWorkEmail('not-an-email').valid, false);
    assert.equal(validateWorkEmail('procurement@epc-grid.de').valid, true);
  });

  it('matches all required copy invariants and zero em-dashes', () => {
    assert.equal(
      HERO_COPY.eyebrow,
      'TECHNICAL BID EVALUATION FOR ELECTRICAL TENDERS'
    );
    assert.equal(HERO_COPY.headline, 'Audit tenders in minutes, not weeks.');
    assert.equal(
      HERO_COPY.subtext,
      'Upload vendor bids. Antova verifies technical specifications against employer requirements, exposes unpriced scope gaps, and calculates true project cost before contract award.'
    );
    assert.equal(
      HERO_COPY.subline,
      'Results in minutes. Human-reviewed within 24 hours. Mutual NDA included.'
    );
    assert.equal(
      HERO_CHART_COPY.packageHeader,
      '33kV GIS SWITCHGEAR PACKAGE'
    );
    assert.equal(
      HERO_CHART_COPY.subheads.true,
      'Base Quote: €418,000 | Scope Gaps: +€64,800'
    );
    assert.equal(HERO_CHART_COPY.bannerTags.true, 'LEVELED AUDIT VIEW');
    assert.equal(
      HERO_CHART_COPY.callouts.true,
      'Vendor B costs €30,800 more than Vendor A.'
    );
    assert.equal(
      HERO_CHART_COPY.rightStats.true,
      '5 scope exclusions priced (+€64,800)'
    );

    assert.equal(PROBLEM_STACK_SECTION.eyebrow, 'THE PROCUREMENT BOTTLENECK');
    assert.equal(PROBLEM_STACK_SECTION.cards.length, 3);
    assert.equal(PROBLEM_STACK_SECTION.cards[0].phaseTag, '01 / BID EVALUATION');
    assert.equal(PROBLEM_STACK_SECTION.cards[1].phaseTag, '02 / TECHNICAL AUDIT');
    assert.equal(
      PROBLEM_STACK_SECTION.cards[2].phaseTag,
      '03 / CONTRACT EXECUTION'
    );

    assert.equal(SOLUTION_TRANSITION_COPY.eyebrow, 'AUTOMATED TENDER AUDIT');
    assert.equal(
      SOLUTION_TRANSITION_COPY.depthCardMockup.calculatedDeltaPill,
      '+€4,000 (FAT Excluded)'
    );

    assert.equal(BENTO_FEATURES.length, 4);
    assert.equal(BENTO_FEATURES[0].kicker, 'FINANCIAL AUDITING');
    assert.equal(BENTO_FEATURES[0].title, 'Audit-ready financial models');
    assert.equal(BENTO_FEATURES[1].kicker, 'SPECIFICATION CHECKS');
    assert.equal(BENTO_FEATURES[1].title, 'Rule-based verification');
    assert.equal(BENTO_FEATURES[2].kicker, 'COST GOVERNANCE');
    assert.equal(BENTO_FEATURES[2].title, 'Standardized cost benchmarks');
    assert.equal(BENTO_FEATURES[3].kicker, 'COMMERCIAL WORKFLOWS');
    assert.equal(BENTO_FEATURES[3].title, 'Structured supplier clarification');

    assert.equal(PRICING_SECTION_COPY.eyebrow, 'PRICING PLANS');
    assert.equal(PRICING_SECTION_COPY.headline, 'Simple, transparent pricing.');
    assert.equal(PRICING_PLANS.length, 3);
    assert.equal(PRICING_PLANS[1].name, 'Per Tender');
    assert.equal(PRICING_PLANS[1].priceAmount, 1500);
    assert.equal(PRICING_PLANS[2].name, 'Pack of Five');
    assert.equal(PRICING_PLANS[2].priceAmount, 6000);
    assert.equal(
      PRICING_PLANS.some((p) => /unlimited/i.test(p.name)),
      false
    );

    assert.equal(FAQ_SECTION_COPY.eyebrow, 'VERIFICATION & INTEGRATION');
    assert.equal(FAQ_ITEMS.length, 4);
    assert.equal(
      FAQ_ITEMS[0].question,
      'Does Antova use generative AI to guess engineering values?'
    );

    assert.equal(FINAL_CTA_COPY.eyebrow, 'START YOUR AUDIT');
    assert.equal(
      FINAL_CTA_COPY.headline,
      'Audit your first tender package for free.'
    );
    assert.equal(FINAL_CTA_COPY.submitButtonText, 'Request Free Audit');
    assert.deepEqual(EQUIPMENT_OPTIONS, [
      'MV switchgear',
      'HV switchgear',
      'PLC & control panels',
      'BESS skids',
    ]);
    assert.equal(TEAM_FOUNDER_DATA.role, 'Founder & CEO');

    const serialized = JSON.stringify({
      HERO_COPY,
      HERO_CHART_COPY,
      PROBLEM_STACK_SECTION,
      SOLUTION_TRANSITION_COPY,
      BENTO_FEATURES,
      PRICING_SECTION_COPY,
      PRICING_PLANS,
      FAQ_SECTION_COPY,
      FAQ_ITEMS,
      FINAL_CTA_COPY,
      TEAM_FOUNDER_DATA,
    });
    assert.equal(serialized.includes('—'), false);
    assert.equal(serialized.includes('SpecClaw'), false);
    assert.equal(serialized.includes('OBJECTION HANDLING'), false);
    assert.equal(
      serialized.includes('Simulated commercial negotiation outcome'),
      false
    );
  });
  it('rejects intake submissions when no endpoint is configured', async () => {
    await assert.rejects(
      submitAuditRequest(
        { email: 'a@b.de', company: 'X', equipment: 'MV switchgear', plan: 'Per Tender' },
        undefined
      ),
      /not configured/
    );
  });

  it('posts intake submissions as JSON and surfaces HTTP failures', async () => {
    const original = globalThis.fetch;
    try {
      const ok = mock.fn(async () => new Response('{}', { status: 200 }));
      globalThis.fetch = ok as unknown as typeof fetch;
      await submitAuditRequest(
        { email: 'a@b.de', company: 'X', equipment: 'MV switchgear', plan: 'Per Tender' },
        'https://example.test/f/abc'
      );
      const [url, init] = ok.mock.calls[0].arguments as unknown as [string, RequestInit];
      assert.equal(url, 'https://example.test/f/abc');
      assert.equal(init.method, 'POST');
      assert.equal(JSON.parse(init.body as string).email, 'a@b.de');

      globalThis.fetch = (async () => new Response('no', { status: 500 })) as typeof fetch;
      await assert.rejects(
        submitAuditRequest(
          { email: 'a@b.de', company: 'X', equipment: 'MV switchgear', plan: 'Per Tender' },
          'https://example.test/f/abc'
        ),
        /500/
      );
    } finally {
      globalThis.fetch = original;
    }
  });
});
