export interface DeviationItem {
  id: string;
  vendorId: string;
  name: string;
  page: string;
  quote: string;
  penalty: number;
}

export interface VendorBid {
  id: 'A' | 'B';
  name: string;
  stickerPrice: number;
  trueDeviations: DeviationItem[];
  pushbackDeviations: DeviationItem[];
  absorbedAmount?: number;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface ProblemStackItem {
  id: string;
  phaseTag: string;
  title: string;
  description: string;
  visualType: 'sticker-illusion' | 'document-avalanche' | 'change-orders';
}

export interface BentoFeatureItem {
  id: string;
  spanCols: 1 | 2;
  kicker: string;
  title: string;
  description: string;
  graphicType:
    | 'excel-export'
    | 'code-checks'
    | 'rate-tables'
    | 'pushback-schedules';
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

export const HERO_COPY = {
  eyebrow: 'TECHNICAL BID EVALUATION FOR ELECTRICAL TENDERS',
  headline: 'Audit tenders in minutes, not weeks.',
  // Two-line split used by the dithering hero card.
  headlineLead: 'Audit tenders in minutes,',
  headlineMuted: 'not weeks.',
  badge: 'Technical bid evaluation · electrical tenders',
  subtext:
    'Upload vendor bids. Antova verifies technical specifications against employer requirements, exposes unpriced scope gaps, and calculates true project cost before contract award.',
  ctaLabel: 'Audit a tender',
  subline:
    'Results in minutes. Human-reviewed within 24 hours. Mutual NDA included.',
};

export const VENDOR_BIDS: VendorBid[] = [
  {
    id: 'B',
    name: 'Vendor B',
    stickerPrice: 418000,
    absorbedAmount: 46500,
    trueDeviations: [
      {
        id: 'b-1',
        vendorId: 'B',
        name: 'Short-circuit rating below spec',
        page: 'p. 14',
        quote:
          'Rated short-time withstand current (Ik): 25 kA (1s) per IEC 62271-200.',
        penalty: 21000,
      },
      {
        id: 'b-2',
        vendorId: 'B',
        name: 'Ex-works instead of DDP delivery',
        page: 'p. 28',
        quote:
          'Prices quoted Ex-Works factory unpacked; transport and site offloading excluded.',
        penalty: 14300,
      },
      {
        id: 'b-3',
        vendorId: 'B',
        name: 'Witness FAT excluded',
        page: 'p. 31',
        quote:
          'Routine factory test reports included; client witness FAT charged separately.',
        penalty: 9500,
      },
      {
        id: 'b-4',
        vendorId: 'B',
        name: 'SF6 handling excluded',
        page: 'p. 19',
        quote: 'First gas filling at site and SF6 gas carts by purchaser.',
        penalty: 8000,
      },
      {
        id: 'b-5',
        vendorId: 'B',
        name: 'Mandatory spares missing',
        page: 'p. 33',
        quote:
          'Mandatory 2-year commissioning spares not included in base scope.',
        penalty: 12000,
      },
    ],
    pushbackDeviations: [
      {
        id: 'b-pb-1',
        vendorId: 'B',
        name: 'Ex-works instead of DDP delivery',
        page: 'p. 28',
        quote:
          'Prices quoted Ex-Works factory unpacked; transport and site offloading excluded.',
        penalty: 14300,
      },
      {
        id: 'b-pb-2',
        vendorId: 'B',
        name: 'Witness FAT excluded',
        page: 'p. 31',
        quote:
          'Vendor absorbed €5,500 of witness testing; €4,000 travel and bay time remains.',
        penalty: 4000,
      },
    ],
  },
  {
    id: 'A',
    name: 'Vendor A',
    stickerPrice: 452000,
    trueDeviations: [],
    pushbackDeviations: [],
  },
];

export const SAMPLE_DATA_LABEL = 'Sample tender, illustrative data';

export const HERO_CHART_COPY = {
  packageHeader: '33kV GIS SWITCHGEAR PACKAGE',
  subheads: {
    sticker: 'Base Quote: €418,000 | Scope Gaps: Unaudited',
    true: 'Base Quote: €418,000 | Scope Gaps: +€64,800',
    pushback: 'Base Quote: €418,000 | Remaining Scope Gaps: +€18,300',
  },
  bannerTags: {
    sticker: 'INITIAL QUOTE VIEW',
    true: 'LEVELED AUDIT VIEW',
    pushback: 'POST-PUSHBACK VIEW',
  },
  callouts: {
    sticker: 'Vendor B appears €34,000 cheaper than Vendor A.',
    true: 'Vendor B costs €30,800 more than Vendor A.',
    pushback: 'Pushback brings Vendor B €15,700 under Vendor A.',
  },
  rightStats: {
    sticker: 'Unpriced scope exclusions hidden',
    true: '5 scope exclusions priced (+€64,800)',
    pushback: 'Vendor B absorbs €46,500 of scope gaps',
  },
};

export const PROBLEM_STACK_SECTION = {
  eyebrow: 'THE PROCUREMENT BOTTLENECK',
  heading: 'Where project margins disappear.',
  cards: [
    {
      id: 'card-01',
      phaseTag: '01 / BID EVALUATION',
      title: 'The lowest quote is rarely the cheapest bid.',
      description:
        'Suppliers often submit aggressive base pricing, knowing omitted testing protocols, missing auxiliary components, and factory-pickup terms will be recovered through post-award change orders.',
      visualType: 'sticker-illusion',
    },
    {
      id: 'card-02',
      phaseTag: '02 / TECHNICAL AUDIT',
      title: '300-page datasheets. Zero time to check every line.',
      description:
        'Engineering teams spend weeks manually cross-referencing single-line diagrams, schedules, and datasheets. Tight project deadlines make human oversight inevitable.',
      visualType: 'document-avalanche',
    },
    {
      id: 'card-03',
      phaseTag: '03 / CONTRACT EXECUTION',
      title: 'The real cost hits after the contract is signed.',
      description:
        'Once the purchase order is issued, every unpriced technical deviation turns into a non-negotiable variation order, eroding project margins when buyer leverage is gone.',
      visualType: 'change-orders',
    },
  ] as ProblemStackItem[],
};

export const SOLUTION_TRANSITION_COPY = {
  eyebrow: 'AUTOMATED TENDER AUDIT',
  headline: 'Catch the gaps before you award the contract.',
  subtext:
    'Every technical requirement is verified against engineering rules. Every flagged deviation cites the exact page and clause in the source PDF.',
  compareMockup: {
    asQuotedLabel: 'As Quoted',
    auditedLabel: 'Audited',
    documentTitle: 'Vendor_B_MV_Switchgear_Offer.pdf',
    baseQuoteBadge: 'Base Quote: €418,000',
    auditedExclusionNotice: '+€64,800',
    auditedTruePriceBadge: '€482,800 Leveled',
  },
  depthCardMockup: {
    documentTitle: 'Section 4.2 - Factory Acceptance Testing',
    citationHeader: 'p. 147 §4.2 - EXTRACTED EXCLUSION',
    highlightedText:
      'Witness FAT and bay reservation are excluded from the base contract price.',
    calculatedDeltaPill: '+€4,000 (FAT Excluded)',
  },
  flaggedDeviations: {
    eyebrow: 'FLAGGED IN VENDOR B',
    heading: 'Three clauses, one leveled price.',
    body: 'Each deviation is pinned to the page that caused it, so the clarification letter writes itself. Hover the stack to bring a finding forward.',
    cards: [
      {
        title: 'p. 147 §4.2',
        description: 'Witness FAT excluded · +€4,000',
        date: 'Flagged at upload',
      },
      {
        title: 'p. 88 §2.1',
        description: 'Ex-works, not DDP · +€39,800',
        date: 'Flagged at upload',
      },
      {
        title: 'p. 14 §1.3',
        description: '25.0 kA vs 31.5 kA · +€21,000',
        date: 'Flagged at upload',
      },
    ],
  },
};

export const BENTO_SECTION_COPY = {
  eyebrow: 'SYSTEM ARCHITECTURE',
  headline: 'Every number traced to the source document.',
};

export const BENTO_PUSHBACK_NOTICES = [
  'p. 147 - Include 2-day witness testing in base price',
  'p. 88 - Confirm delivered terms (DDP) vs. factory pickup',
  'p. 14 - Match 31.5 kA busbar rating without surcharge',
];

export const BENTO_FEATURES: BentoFeatureItem[] = [
  {
    id: 'excel-export',
    spanCols: 2,
    kicker: 'FINANCIAL AUDITING',
    title: 'Audit-ready financial models',
    description:
      'Export complete spreadsheets where every formula is preserved and every calculated cost links directly to the vendor PDF.',
    graphicType: 'excel-export',
  },
  {
    id: 'code-checks',
    spanCols: 1,
    kicker: 'SPECIFICATION CHECKS',
    title: 'Rule-based verification',
    description:
      'Verify electrical ratings, fault limits, and unit conversions against fixed engineering rules.',
    graphicType: 'code-checks',
  },
  {
    id: 'rate-tables',
    spanCols: 1,
    kicker: 'COST GOVERNANCE',
    title: 'Standardized cost benchmarks',
    description:
      "Price scope gaps using your organization's agreed rates for testing, freight terms, and spare parts.",
    graphicType: 'rate-tables',
  },
  {
    id: 'pushback-schedules',
    spanCols: 2,
    kicker: 'COMMERCIAL WORKFLOWS',
    title: 'Structured supplier clarification',
    description:
      'Generate formal clarification schedules with exact page and clause references ready to issue back to bidders.',
    graphicType: 'pushback-schedules',
  },
];

export const PRICING_SECTION_COPY = {
  eyebrow: 'PRICING PLANS',
  headline: 'Simple, transparent pricing.',
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    name: 'Shadow Audit',
    priceAmount: 0,
    priceDisplay: '€0',
    suffix: '/ first tender',
    billingTerms: 'Free under mutual NDA',
    audienceInfo: 'For evaluating your first live tender package',
    features: [
      '1 equipment package across 3 to 5 competing vendor bids',
      'Line-item verification linked to exact PDF page coordinates',
      'True project cost calculated from standard benchmark tables',
      'Automated cross-audit of sales letters against technical schedules',
      'Structured clarification schedules ready to issue to suppliers',
      'Engineering review and sign-off within 24 hours under NDA',
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
    audienceInfo: 'For single-project EPC procurement',
    featuresHeader: 'EVERYTHING IN SHADOW AUDIT, PLUS:',
    features: [
      'Up to 8 vendor bids for switchgear, control panels, or battery storage',
      'Ingests native PDFs, scanned schematics, Excel BOMs, and Word addenda',
      'Rule-based verification of electrical limits and unit conversions',
      'Custom cost benchmarks for missing factory tests, freight terms, and spares',
      'Audit-ready Excel export with cell-level links to source PDF pages',
      'Re-audit revised vendor submissions to track price and scope concessions',
      'Senior engineering review and sign-off within 24 hours under NDA',
    ],
    buttonText: 'Audit a tender',
    href: '#audit',
  },
  {
    name: 'Pack of Five',
    priceAmount: 6000,
    priceDisplay: '€6,000',
    suffix: '/ 5 tenders',
    audienceInfo: 'For teams running several tenders a year (€1,200 each)',
    featuresHeader: 'EVERYTHING IN PER TENDER, FOR FIVE PACKAGES:',
    features: [
      'Five tender packages at €1,200 each, 20% below the per-tender rate',
      'Same verification, Excel export, and re-audit of revised bids on every package',
      'Same engineering review and sign-off under NDA',
    ],
    buttonText: 'Request a pack of five',
    href: '#audit',
  },
];

export const FAQ_SECTION_COPY = {
  eyebrow: 'VERIFICATION & INTEGRATION',
  heading: 'Technical & commercial questions.',
  description:
    'How Antova verifies electrical bids, protects confidential tender packages, and integrates with your engineering workflow.',
  supportHeading: 'Still have a question about your tender?',
  supportDescription:
    'Ask the founder directly. You get an engineer who has reviewed switchgear bids, usually within the same working day.',
  supportButtonText: 'Message Akhil on LinkedIn',
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'faq-1',
    question: 'Does Antova use generative AI to guess engineering values?',
    answer:
      'No. Text and tables are extracted from vendor documents, but all specification comparisons, unit conversions, and cost calculations run through deterministic engineering rules.',
  },
  {
    id: 'faq-2',
    question: 'How is tender confidentiality protected?',
    answer:
      'Every evaluation runs under a bilateral mutual NDA. All documents are encrypted at rest and in transit, and customer bid data is never shared or used to train public models.',
  },
  {
    id: 'faq-3',
    question: 'What file formats are supported?',
    answer:
      'Native PDFs, scanned equipment drawings, Excel bill of materials (BOM), and Word contract addenda.',
  },
  {
    id: 'faq-4',
    question: 'What equipment packages can be audited today?',
    answer:
      'Medium-voltage and high-voltage switchgear, PLC automation panels, and BESS (battery storage) skids.',
  },
];

export const FINAL_CTA_COPY = {
  eyebrow: 'START YOUR AUDIT',
  badge: 'First tender audited free',
  headline: 'Audit your first tender package for free.',
  // Two-line split used by the dithering CTA card.
  headlineLead: 'Audit your first tender',
  headlineMuted: 'package for free.',
  subtext:
    'Submit your vendor bids today. Receive your leveled evaluation sheet in minutes, verified by an engineer within 24 hours under mutual NDA.',
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
