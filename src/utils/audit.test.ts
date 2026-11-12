import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  EQUIPMENT_OPTIONS,
  FAQ_ITEMS,
  FAQ_SECTION_COPY,
  FINAL_CTA_COPY,
  HERO_COPY,
  INTRO_COPY,
  MANIFESTO_COPY,
  MATRIX_COPY,
  PIPELINE_COPY,
  PRECISION_COPY,
  PRICING_PLANS,
  PRICING_SECTION_COPY,
  PROBLEM_STACK_SECTION,
  TEAM_FOUNDER_DATA,
} from '../constants';
import {
  CELLS,
  PARAMETERS,
  TOTAL_PAGES,
  VENDORS,
  cellAdder,
  vendorAdders,
  vendorPrice,
} from '../data/tender402';
import { formatEuro, submitAuditRequest, validateWorkEmail } from './audit';

const vendor = (id: string) => VENDORS.find((v) => v.id === id)!;

describe('Antova landing data and copy', () => {
  // Figures from specclaw/samples/TENDER-2026-402/expected.json
  it('reproduces the pipeline answer key adders per parameter', () => {
    const b = CELLS['vendor-b'];
    assert.equal(cellAdder(b['PARAM-01']), 18500);
    assert.equal(cellAdder(b['PARAM-02']), 14200);
    assert.equal(cellAdder(b['PARAM-03']), 8900);
    assert.equal(cellAdder(b['PARAM-04']), 7400);
    assert.equal(cellAdder(b['PARAM-05']), 6500);
    assert.equal(cellAdder(b['PARAM-06']), 9300);
    const c = CELLS['vendor-c'];
    assert.equal(cellAdder(c['PARAM-01']), 6200);
    assert.equal(cellAdder(c['PARAM-04']), 4100);
    assert.equal(cellAdder(c['PARAM-05']), 2600);
    assert.equal(cellAdder(c['PARAM-06']), 2100);
  });

  it('reproduces the true evaluated prices and round 3 clawback', () => {
    assert.equal(vendorAdders('vendor-a'), 0);
    assert.equal(vendorAdders('vendor-b'), 64800);
    assert.equal(vendorAdders('vendor-c'), 15000);
    assert.equal(vendorPrice(vendor('vendor-a'), 'evaluated'), 452000);
    assert.equal(vendorPrice(vendor('vendor-b'), 'evaluated'), 482800);
    assert.equal(vendorPrice(vendor('vendor-c'), 'evaluated'), 454000);
    assert.equal(vendorPrice(vendor('vendor-b'), 'round3'), 425400);
    assert.equal(vendorPrice(vendor('vendor-c'), 'round3'), 454000);
    assert.equal(vendorPrice(vendor('vendor-b'), 'headline'), 418000);
  });

  it('covers every vendor x parameter cell and counts flagged cells', () => {
    assert.equal(PARAMETERS.length, 8);
    assert.equal(TOTAL_PAGES, 116);
    let flagged = 0;
    let conflicts = 0;
    for (const v of VENDORS) {
      for (const p of PARAMETERS) {
        const cell = CELLS[v.id][p.id];
        assert.ok(cell, `${v.id} ${p.id}`);
        if (cell.status !== 'COMPLIANT') flagged += 1;
        if (cell.status === 'CONFLICT_DOWNGRADE') {
          conflicts += 1;
          assert.ok(cell.secondary, 'conflicts keep both citations');
        }
        if (cell.status === 'COMPLIANT') assert.equal(cellAdder(cell), 0);
      }
    }
    assert.equal(flagged, 10);
    assert.equal(conflicts, 2);
  });

  it('formats euro amounts and validates work emails', () => {
    assert.equal(formatEuro(418000), '€418,000');
    assert.equal(formatEuro(482800), '€482,800');
    assert.equal(validateWorkEmail('').valid, false);
    assert.equal(validateWorkEmail('not-an-email').valid, false);
    assert.equal(validateWorkEmail('procurement@epc-grid.de').valid, true);
  });

  it('keeps copy free of em-dashes, the old brand and ungrounded claims', () => {
    assert.equal(PRICING_PLANS.length, 3);
    assert.equal(PRICING_PLANS[1].priceAmount, 1500);
    assert.equal(PRICING_PLANS[2].priceAmount, 6000);
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
      MANIFESTO_COPY,
      PROBLEM_STACK_SECTION,
      INTRO_COPY,
      MATRIX_COPY,
      PIPELINE_COPY,
      PRECISION_COPY,
      PRICING_SECTION_COPY,
      PRICING_PLANS,
      FAQ_SECTION_COPY,
      FAQ_ITEMS,
      FINAL_CTA_COPY,
      TEAM_FOUNDER_DATA,
    });
    assert.equal(serialized.includes('—'), false);
    assert.equal(serialized.includes('SpecClaw'), false);
    // v1 pipeline: text-based PDFs only, PDF report, no spreadsheet export
    assert.equal(/excel|xlsx|scanned schematics|word addenda/i.test(serialized), false);
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
