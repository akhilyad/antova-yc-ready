/**
 * Landing page copy.
 *
 * Every figure quoted here comes from the specclaw sample tender
 * TENDER-2026-402 (see src/data/tender402.ts and
 * specclaw/samples/TENDER-2026-402/expected.json). Capability claims are
 * limited to what the specclaw ingest pipeline does today; see
 * specs/2026-11-03-specclaw-ingestion-pipeline-design.md.
 */

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface ProblemStackItem {
  id: string;
  phaseTag: string;
  title: string;
  titleItalic: string;
  description: string;
  visualType: 'headline-trap' | 'buried-conflict' | 'variation-orders';
}

export interface PricingPlan {
  name: string;
  recommended?: boolean;
  priceAmount: number;
  priceDisplay: string;
  suffix: string;
  billingTerms?: string;
  audienceInfo: string;
  featuresHeader?: string;
  features: string[];
  buttonText: string;
  href: string;
}

export interface TeamFounderData {
  badge: string;
  headingPrefix: string;
  headingItalic: string;
  headingSuffix: string;
  name: string;
  role: string;
  image: string;
  bio: string;
  socials: {
    linkedin: string;
  };
}

export const SAMPLE_DATA_LABEL = 'Sample tender · synthetic documents';

export const HERO_COPY = {
  badge: 'Technical bid evaluation · electrical tenders',
  headlineLead: 'Audit electrical tenders in minutes.',
  headlineItalic: 'Every gap cited.',
  subtext:
    'Antova reads the material requisition and every vendor bid, checks each parameter with deterministic unit rules, and prices each deviation from a versioned rate table. Every number links to the page it came from.',
  ctaLabel: 'Audit a tender',
  subline: 'First tender free · mutual NDA · engineer sign-off within 24 hours',
};

export const MANIFESTO_COPY = {
  lead: 'A switchgear bid runs thirty pages. The exclusion that costs you sits in one drawing note.',
  italic: 'Antova reads all thirty.',
};

export const PROBLEM_STACK_SECTION = {
  eyebrow: 'WHERE BID EVALUATIONS BREAK',
  heading: 'The cheapest bid is a claim, not a price.',
  cards: [
    {
      id: 'card-01',
      phaseTag: '01 / HEADLINE PRICE',
      title: 'You compared headline prices.',
      titleItalic: 'The cheapest bid wasn’t.',
      description:
        'VoltSwitch quoted €418,000, €34,000 under Nordwerk. Priced against the MR, it costs €482,800: €30,800 more.',
      visualType: 'headline-trap',
    },
    {
      id: 'card-02',
      phaseTag: '02 / BURIED CONFLICT',
      title: 'The cover letter said compliant.',
      titleItalic: 'The drawing didn’t.',
      description:
        'Page 2 claims 50 kA / 3 s. Note 7 on SLD sheet 2, page 11, rates the bay 31.5 kA / 1 s and excludes the upgrade from the base price.',
      visualType: 'buried-conflict',
    },
    {
      id: 'card-03',
      phaseTag: '03 / AFTER AWARD',
      title: 'You signed the PO.',
      titleItalic: 'Then the variations arrived.',
      description:
        'Witnessed FAT charged at €1,300 a day. Ex-Works Izmir instead of DDP. An 18-month warranty from dispatch. Each one becomes a change order once your leverage is gone.',
      visualType: 'variation-orders',
    },
  ] as ProblemStackItem[],
};

export const INTRO_COPY = {
  heading: 'Introducing Antova.',
  body: 'Every bid leveled against the MR, parameter by parameter. No spreadsheets. No email chains. No unpriced scope.',
};

export const MATRIX_COPY = {
  eyebrow: 'BID COMPLIANCE MATRIX',
  headlineLead: 'Three bids. Eight parameters.',
  headlineItalic: 'One leveled price.',
  subtext:
    'Pick any cell. You get the governing quote, its page, the check it failed and the cost lines behind the adder.',
  views: {
    headline: 'Headline',
    evaluated: 'Evaluated',
    round3: 'After round 3',
  },
  viewNotes: {
    headline: 'As quoted. VoltSwitch looks €34,000 cheapest.',
    evaluated: 'Headline + priced deviations. Nordwerk is lowest at €452,000.',
    round3: 'VoltSwitch concedes every adder except PARAM-04: €57,400 clawed back.',
  },
};

export const PIPELINE_COPY = {
  eyebrow: 'INGEST PIPELINE',
  headlineLead: 'From tender folder',
  headlineItalic: 'to cited ledger.',
  subtext:
    'Eight stages, one job. The model locates passages; code reads the values, checks the units and does the arithmetic.',
};

export const PRECISION_COPY = {
  eyebrow: 'WHY THE NUMBERS HOLD',
  headlineLead: 'Deterministic',
  headlineItalic: 'where it counts.',
  items: [
    {
      kicker: 'NO MODEL ARITHMETIC',
      title: 'The model never decides a number.',
      body: 'Claude only locates passages. Parsing, unit conversion, comparison and pass/fail run in code.',
    },
    {
      kicker: 'CITATIONS',
      title: 'Every value has a page.',
      body: 'Document, page, bounding box, verbatim quote. A quote that doesn’t match the page word for word is rejected.',
    },
    {
      kicker: 'EVIDENCE PRECEDENCE',
      title: 'Drawings outrank cover letters.',
      body: 'Drawings, BOMs, datasheets and test plans govern compliance tables, which govern cover letters. Overridden claims stay on the record.',
    },
    {
      kicker: 'RATE TABLE',
      title: 'Priced from a versioned table.',
      body: 'Each adder is built from cost lines in decimal arithmetic. A deviation with no rate is listed as unpriced, never counted as zero.',
    },
    {
      kicker: 'MISSING EVIDENCE',
      title: 'Silence is not compliance.',
      body: 'A required value no document states is marked for manual inspection, not passed.',
    },
    {
      kicker: 'REPRODUCIBLE',
      title: 'Same input, same answer.',
      body: 'Model responses are stored against each file’s SHA-256 and prompt version. Replay runs re-check against an answer key.',
    },
  ],
};

export const PRICING_SECTION_COPY = {
  eyebrow: 'PRICING',
  headline: 'Priced per tender.',
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    name: 'Shadow Audit',
    priceAmount: 0,
    priceDisplay: '€0',
    suffix: '/ first tender',
    billingTerms: 'Free under mutual NDA',
    audienceInfo: 'Run it beside your own evaluation',
    features: [
      '1 equipment package, 3 to 5 competing bids',
      'Every parameter checked against the MR, with page citations',
      'Deviations priced from the standard rate table',
      'Cover letters and compliance tables cross-checked against drawings and BOMs',
      'Engineer review and sign-off within 24 hours',
    ],
    buttonText: 'Audit a tender for free',
    href: '#audit',
  },
  {
    name: 'Per Tender',
    recommended: true,
    priceAmount: 1500,
    priceDisplay: '€1,500',
    suffix: '/ tender',
    audienceInfo: 'Single-project EPC procurement',
    featuresHeader: 'EVERYTHING IN SHADOW AUDIT, PLUS:',
    features: [
      'Up to 8 vendor bids',
      'Your own rates for labour, freight and copper',
      'Clarification rounds tracked against each adder',
      'PDF evaluation report with page citations',
      'Re-run on revised bids',
    ],
    buttonText: 'Audit a tender',
    href: '#audit',
  },
  {
    name: 'Pack of Five',
    priceAmount: 6000,
    priceDisplay: '€6,000',
    suffix: '/ 5 tenders',
    audienceInfo: 'Teams running several tenders a year (€1,200 each)',
    featuresHeader: 'EVERYTHING IN PER TENDER, FOR FIVE PACKAGES:',
    features: [
      'Five tender packages at €1,200 each, 20% below the per-tender rate',
      'Same checks, report and re-runs on every package',
      'Same engineer sign-off under NDA',
    ],
    buttonText: 'Request a pack of five',
    href: '#audit',
  },
];

export const FAQ_SECTION_COPY = {
  eyebrow: 'QUESTIONS',
  heading: 'Technical & commercial questions.',
  description: 'What Antova checks, what it doesn’t yet, and how your bids are handled.',
  supportHeading: 'Still have a question about your tender?',
  supportDescription:
    'Ask the founder directly. You get an engineer who has reviewed switchgear bids, usually within the same working day.',
  supportButtonText: 'Message Akhil on LinkedIn',
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'faq-1',
    question: 'Does an AI model decide whether a bid is compliant?',
    answer:
      'No. Claude locates the passages that state each value and returns verbatim quotes. Code then checks each quote against the page, parses the value, converts units with Pint and compares it with the requirement. Pass, fail and every euro are computed, not generated.',
  },
  {
    id: 'faq-2',
    question: 'What happens when two documents in one bid disagree?',
    answer:
      'Specific delivery evidence governs: drawings, BOMs, datasheets, test plans and commercial terms outrank compliance tables, which outrank cover letters. The cell is marked as a conflict and both citations are kept, so you can show the vendor exactly where they contradict themselves.',
  },
  {
    id: 'faq-3',
    question: 'What file formats are supported?',
    answer:
      'Text-based PDFs: MR specs, datasheets, SLD drawing sheets, BOMs, test plans, compliance tables and commercial terms. Scanned pages without a text layer are flagged in the run warnings; OCR is not supported yet.',
  },
  {
    id: 'faq-4',
    question: 'Which equipment packages are covered?',
    answer:
      '33kV-class GIS switchgear has the full parameter set and rate table today. For other packages, tell us what you have and we’ll confirm what the pipeline covers before you send bids.',
  },
  {
    id: 'faq-5',
    question: 'How is tender confidentiality handled?',
    answer:
      'Every evaluation runs under a mutual NDA. Bid documents are used only for your evaluation and are not used to train models.',
  },
];

export const FINAL_CTA_COPY = {
  badge: 'First tender audited free',
  headlineLead: 'Send the bids.',
  headlineMuted: 'Get the leveled price.',
  subtext:
    'Upload the MR and the vendor bids under mutual NDA. An engineer signs off the evaluation within 24 hours.',
  submitButtonText: 'Request Free Audit',
};

export const EQUIPMENT_OPTIONS = [
  'MV switchgear',
  'HV switchgear',
  'PLC & control panels',
  'BESS skids',
] as const;

export type EquipmentOption = (typeof EQUIPMENT_OPTIONS)[number];

export const TEAM_FOUNDER_DATA: TeamFounderData = {
  badge: 'Team',
  headingPrefix: 'Built by an engineer who ',
  headingItalic: 'lived',
  headingSuffix: ' the problem.',
  name: 'Akhil Yadav',
  role: 'Founder & CEO',
  image: '/founder.png',
  bio: 'I spent five years reviewing electrical bids at ABB, Yokogawa, and ib vogt. I kept seeing the same problem: vendors leave key equipment out of 300-page quotes, so a cheap bid turns into huge surprise bills after you sign. I built Antova to check bids in minutes, catch what was missed, and show the real price before you buy.',
  socials: {
    linkedin: 'https://www.linkedin.com/in/akhilyad/',
  },
};
