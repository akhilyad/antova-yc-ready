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

/** Plain-English names for the four outcomes. */
export const STATUS_PLAIN = {
  COMPLIANT: 'Meets spec',
  DEVIATION_DOWNGRADE: 'Below spec',
  CONFLICT_DOWNGRADE: 'Contradicts itself',
  OMITTED: 'Left out',
} as const;

export const HERO_COPY = {
  eyebrow: 'Bid audits for electrical tenders',
  headlineLead: 'Find what the lowest bid',
  headlineItalic: 'left out.',
  subtext:
    'Drop in your spec and every vendor quote. See each missing item and price gap, with the page it came from.',
  ctaLabel: 'Audit a tender free',
  subline: 'First tender free · under NDA · draft audit in 24 hours',
};

export const MANIFESTO_COPY = {
  lead: 'An industrial equipment bid runs hundreds of pages. The missing breaker hides in one footnote.',
  italic: 'Antova catches it before award.',
};

export const PROBLEM_STACK_SECTION = {
  eyebrow: 'Where bids go wrong',
  heading: 'The lowest bid is a claim, not a price.',
  cards: [
    {
      id: 'card-01',
      phaseTag: '01 · The quote',
      title: 'You picked the lowest quote.',
      titleItalic: 'It wasn’t the lowest price.',
      description: 'Vendor B quoted €34,000 under Vendor A. Brought up to spec, it costs at least €27,650 more than Vendor A.',
      visualType: 'headline-trap',
    },
    {
      id: 'card-02',
      phaseTag: '02 · The fine print',
      title: 'The cover letter said compliant.',
      titleItalic: 'The drawing didn’t.',
      description: 'Page 2 promises 50 kA. A note on page 11 says 31.5 kA.',
      visualType: 'buried-conflict',
    },
    {
      id: 'card-03',
      phaseTag: '03 · After award',
      title: 'You signed the PO.',
      titleItalic: 'Then the extras arrived.',
      description: 'Factory testing, freight and copper busbars, all outside the price. €26,850 in change orders.',
      visualType: 'variation-orders',
    },
  ] as ProblemStackItem[],
};

export const INTRO_COPY = {
  heading: 'Every bid, checked against your spec.',
  body: 'Line by line. Every gap priced.',
  before: 'Your spreadsheet',
  after: 'With Antova',
};

export const HOW_IT_WORKS = {
  eyebrow: 'How it works',
  heading: 'The model finds quotes.',
  headingItalic: 'Code does the maths.',
  steps: [
    {
      id: 'read',
      title: 'Read',
      body: 'AI finds the sentence in each bid that answers each requirement. It returns the page and the exact words, nothing more.',
    },
    {
      id: 'check',
      title: 'Check',
      body: 'A quote that is not on its page word for word is thrown out. Code reads the values, converts the units and tests them against your spec.',
    },
    {
      id: 'price',
      title: 'Price',
      body: 'Each gap is priced from a rate table you can read. If a quantity is unknown, the gap is marked unpriced, never counted as zero.',
    },
    {
      id: 'review',
      title: 'Approve',
      body: 'A person on your procurement team approves every flag before the audit is final. Each one links to the page and exact words behind it. Drawings outrank cover letters, and a contradiction shows both pages. The award decision stays with you.',
    },
  ],
  deliverablesHeading: 'What you get back',
  deliverables: [
    'An evaluated price for every vendor, with unpriced items marked',
    'The page and exact quote behind every flagged cell',
    'Contradictions shown with both pages side by side',
    'Passes that only a cover letter claims, marked as claimed',
    'Questions to send each vendor, as a CSV',
    'A negotiation view: what each concession is worth',
    'A PDF report',
  ],
  audience:
    'Built for procurement and estimating engineers comparing 3 to 8 bids on one electrical package. 33 kV switchgear today.',
};

export const PRICING_SECTION_COPY = {
  eyebrow: 'Pricing',
  headline: 'Priced per tender.',
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    name: 'Free first audit',
    priceAmount: 0,
    priceDisplay: '€0',
    suffix: '/ first tender',
    billingTerms: 'Under NDA',
    audienceInfo: 'Run it next to your own evaluation',
    features: [
      'One package, 3 to 5 bids',
      'Every gap cited and priced',
      'Draft audit in 24 hours, approved by your team',
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
    features: [
      'Up to 8 bids, priced at your rates',
      'Revised bids re-run through negotiation',
      'PDF report',
    ],
    buttonText: 'Audit a tender free',
    href: '#audit',
  },
  {
    name: 'Pack of Five',
    priceAmount: 6000,
    priceDisplay: '€6,000',
    suffix: '/ 5 tenders',
    audienceInfo: '€1,200 per tender',
    features: ['Everything in Per Tender', '20% below the per-tender rate'],
    buttonText: 'Request a pack of five',
    href: '#audit',
  },
];

export const FAQ_SECTION_COPY = {
  eyebrow: 'Questions',
  heading: 'Questions.',
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
      'No. AI finds the passage and its page. A quote that is not on that page word for word is thrown out. Fixed rules check the rest against your spec and do every sum.',
  },
  {
    id: 'faq-human',
    question: 'Does a person check the results?',
    answer:
      'Yes. Reading, checking and pricing are automatic. A manager, engineer or analyst on your procurement team approves every flag before an audit is final. The award decision stays with you.',
  },
  {
    id: 'faq-tested',
    question: 'Has it been tested on real tenders?',
    answer:
      'The engine is tested on synthetic tenders. Your first audit is free so you can run it next to your own evaluation, and every flag cites the page it came from.',
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
    answer: 'Searchable PDFs: your spec and each vendor’s full bid. Scanned pages are flagged for manual review.',
  },
  {
    id: 'faq-4',
    question: 'Which equipment is covered?',
    answer:
      '33 kV switchgear today. For other electrical packages, send yours and we’ll confirm fit before you share bids.',
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
  subtext: 'Spec and vendor quotes in, under NDA. Draft audit in 24 hours, approved by your team.',
  submitButtonText: 'Audit a tender free',
  equipmentHelp: '33 kV switchgear today. Other packages: we’ll confirm fit before you share bids.',
};

export const EQUIPMENT_OPTIONS = [
  'MV switchgear',
  'Other electrical package',
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
