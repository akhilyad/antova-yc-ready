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
  eyebrow: 'Bid audits for electrical tenders',
  headlineLead: 'Find what the cheapest bid',
  headlineItalic: 'left out.',
  subtext:
    'Drop in your spec and every vendor quote. See each missing item and price gap, with the page it came from.',
  ctaLabel: 'Audit a tender free',
  subline: 'First tender free · under NDA · results in 24 hours',
};

export const MANIFESTO_COPY = {
  lead: 'A switchgear bid runs thirty pages. The exclusion that costs you sits in one drawing note.',
  italic: 'Antova reads all thirty.',
};

export const PROBLEM_STACK_SECTION = {
  eyebrow: 'WHERE BIDS GO WRONG',
  heading: 'The cheapest bid is a claim, not a price.',
  cards: [
    {
      id: 'card-01',
      phaseTag: '01 / THE QUOTE',
      title: 'You picked the lowest quote.',
      titleItalic: 'It wasn’t the lowest price.',
      description: 'VoltSwitch quoted €34,000 under Nordwerk. Brought up to spec, it costs €30,800 more.',
      visualType: 'headline-trap',
    },
    {
      id: 'card-02',
      phaseTag: '02 / THE FINE PRINT',
      title: 'The cover letter said compliant.',
      titleItalic: 'The drawing didn’t.',
      description: 'Page 2 promises 50 kA. A note on page 11 says 31.5 kA.',
      visualType: 'buried-conflict',
    },
    {
      id: 'card-03',
      phaseTag: '03 / AFTER AWARD',
      title: 'You signed the PO.',
      titleItalic: 'Then the extras arrived.',
      description: 'Factory testing, freight and copper busbars, all outside the price. €30,000 in change orders.',
      visualType: 'variation-orders',
    },
  ] as ProblemStackItem[],
};

export const INTRO_COPY = {
  heading: 'Introducing Antova.',
  body: 'Every bid checked against your spec, line by line. Every gap priced.',
  before: 'Your spreadsheet',
  after: 'With Antova',
};

export const MATRIX_COPY = {
  eyebrow: 'TRY IT',
  headlineLead: 'Three bids. Eight checks.',
  headlineItalic: 'Click a flagged cell.',
  subtext: 'A full audit of a sample 33 kV switchgear tender.',
  views: {
    headline: 'Quoted',
    evaluated: 'True cost',
    round3: 'After negotiation',
  },
  viewNotes: {
    headline: 'As quoted, VoltSwitch looks €34,000 cheapest.',
    evaluated: 'With every gap priced, Nordwerk is cheapest at €452,000.',
    round3: 'Shown its gaps, VoltSwitch covers €57,400 of them. Now it wins at €425,400.',
  },
};

export const IMPACT_COPY = {
  heading: 'What one audit found.',
  stats: [
    { value: '€64,800', label: 'missing from the cheapest quote' },
    { value: '10 of 24', label: 'checks flagged across three bids' },
    { value: '€57,400', label: 'won back in negotiation' },
  ],
  footnote: 'Every number links to the page it came from.',
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
    billingTerms: 'Under NDA',
    audienceInfo: 'Run it next to your own evaluation',
    features: [
      'One package, 3 to 5 bids',
      'Every gap cited and priced',
      'Engineer sign-off in 24 hours',
    ],
    buttonText: 'Audit a tender free',
    href: '#audit',
  },
  {
    name: 'Per Tender',
    recommended: true,
    priceAmount: 1500,
    priceDisplay: '€1,500',
    suffix: '/ tender',
    audienceInfo: 'One project, one package',
    featuresHeader: 'EVERYTHING IN SHADOW AUDIT, PLUS:',
    features: [
      'Up to 8 bids',
      'Your own rates',
      'Negotiation rounds tracked',
      'PDF report, re-runs on revised bids',
    ],
    buttonText: 'Audit a tender',
    href: '#audit',
  },
  {
    name: 'Pack of Five',
    priceAmount: 6000,
    priceDisplay: '€6,000',
    suffix: '/ 5 tenders',
    audienceInfo: '€1,200 per tender',
    featuresHeader: 'EVERYTHING IN PER TENDER, FOR FIVE PACKAGES',
    features: ['20% below the per-tender rate', 'Same engineer, same NDA'],
    buttonText: 'Request a pack of five',
    href: '#audit',
  },
];

export const FAQ_SECTION_COPY = {
  eyebrow: 'QUESTIONS',
  heading: 'Questions buyers ask.',
  description: '',
  supportHeading: 'Still have a question about your tender?',
  supportDescription: 'Ask the founder. Usually answered the same day.',
  supportButtonText: 'Message Akhil on LinkedIn',
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'faq-1',
    question: 'Does AI decide if a bid is compliant?',
    answer:
      'No. AI finds the passage in the bid. Plain code checks the value against your spec and does every sum.',
  },
  {
    id: 'faq-2',
    question: 'What if a bid contradicts itself?',
    answer:
      'Drawings and BOMs beat cover letters. We flag the conflict and show you both pages.',
  },
  {
    id: 'faq-3',
    question: 'What files can I send?',
    answer: 'Text-based PDFs: specs, datasheets, drawings, BOMs, test plans and commercial terms. Scanned pages are flagged for manual review.',
  },
  {
    id: 'faq-4',
    question: 'Which equipment is covered?',
    answer:
      '33 kV-class GIS switchgear today. Send us your package and we’ll confirm coverage before you share bids.',
  },
  {
    id: 'faq-5',
    question: 'Are my bids kept confidential?',
    answer: 'Yes. Every audit runs under mutual NDA, and your documents are never used to train models.',
  },
];

export const FINAL_CTA_COPY = {
  badge: 'First tender free',
  headlineLead: 'Send the bids.',
  headlineMuted: 'Get the real price.',
  subtext: 'Spec and vendor quotes in, under NDA. Signed-off results in 24 hours.',
  submitButtonText: 'Request free audit',
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
