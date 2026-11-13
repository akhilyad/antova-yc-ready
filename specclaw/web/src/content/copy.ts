/**
 * Every user-facing string (spec §10, plus the §7.2 stage labels and §8.2 status words it
 * relies on). Strings are verbatim from the spec: change the spec, then this file.
 * Parameterized strings are functions; callers pass already-formatted values (money, dates).
 * Count strings pluralize by n (ruling R12): n = 1 takes the singular noun and verb; any other n
 * gives the §10 wording exactly.
 */

const SITE_NAME = 'SpecClaw'

/** "1 page", "116 pages" (ruling R12). */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Document sections as the backend names them (Citation.section). */
const SECTIONS: Readonly<Record<string, string>> = {
  mr_spec: 'Spec',
  datasheet: 'Datasheet',
  drawing: 'Drawing',
  cover_letter: 'Cover letter',
  bom: 'Bill of materials',
  compliance_table: 'Compliance table',
  test_plan: 'Test plan',
  commercial: 'Commercial terms',
}

export interface FaqItem {
  id?: string
  question: string
  /** `null` until the founder signs the answer off (spec §13); check:launch fails while null. */
  answer: string | null
}

const faq: readonly FaqItem[] = [
  {
    id: 'save-money',
    question: 'How does this save us money?',
    answer:
      'Vendors often win deals with low bids, then charge huge extra fees for things they left out. SpecClaw finds those missing pieces before you sign, so you do not pay surprise bills later.',
  },
  {
    id: 'different-chatgpt',
    question: 'How is this different from tools like ChatGPT?',
    answer:
      'Regular AI guesses and makes mistakes. SpecClaw does not guess. It checks real numbers line by line, calculates exact costs, and clicks straight to the exact page where the vendor hid the note.',
  },
  {
    id: 'files-upload',
    question: 'What files can I upload?',
    answer: 'Any standard bid document: PDFs, Word files, and spreadsheets.',
  },
  {
    id: 'pricing-safe',
    question: 'Is our private pricing safe?',
    answer:
      'Yes. Your bids and project files stay private to you. They are never shared or used to train public AI models.',
  },
]

export const copy = {
  meta: {
    siteName: SITE_NAME,
    /** Document title for a route: "Page not found · Antova". */
    title: (page: string) => `${page} · ${SITE_NAME}`,
  },

  shell: {
    skipLink: 'Skip to content',
    /** The site navigation landmark's name. */
    navLabel: 'Site',
    footer: 'SpecClaw: find hidden costs in vendor bids before you sign.',
  },

  /** Calendar months for dates written out in full ("5 November 2026"). */
  months: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],

  ui: {
    close: 'Close',
  },

  /** Terms used everywhere. */
  terms: {
    bid: 'bid',
    spec: 'spec',
    specFirstMention: 'spec (what you asked to buy)',
    gap: 'gap',
    gapDefinition: 'any shortfall against the spec that costs money to close',
    evaluatedPrice: 'evaluated price',
    evaluatedPriceDefinition: 'the bid plus what it costs to close every gap',
    brief: 'brief',
    footnote: 'footnote',
  },

  landing: {
    /** The landing page's document title. */
    title: 'SpecClaw: The lowest bid is almost never the cheapest.',
    /** The search-result and link-preview description (meta description, og:description). */
    description:
      'Vendors quote low prices, then hide extra costs in the fine print. SpecClaw reads every page, finds what they left out, and shows you the true cost before you sign.',
    /** The landing's section links, beside the wordmark. */
    nav: {
      howItWorks: 'How it works',
      sampleBrief: 'See sample check',
      recheck: 'Get Early Access',
    },
    /** Above the h1: Small Header Tag */
    eyebrow: 'SMART BID CHECKER',
    h1: 'The lowest bid is almost never the cheapest.',
    lede: 'Vendors quote low prices, then hide extra costs in the fine print. SpecClaw reads every page, finds what they left out, and shows you the true cost before you sign.',
    /** Core benefit: */
    tagline: 'Catch missing costs before you sign, not after work starts.',
    watchButton: 'Watch 1-Minute Walkthrough',
    primaryCta: 'See Sample Check',
    secondaryCta: 'Get Early Access',
    uploadTenderCta: 'Upload Files to Check',
    recheckButton: 'Get Early Access',
    recheckTerms: 'Done in minutes. Direct link to every page. Your data stays private.',
    sampleLink: 'See Sample Check',
    sampleLabel: 'Sample Check: Equipment & Contractor Bids',
    trustBadges: ['Done in Minutes', 'Direct Link to Every Page', 'Your Data Stays Private'],
    sideBySide: {
      tag: 'THE REAL PROOF',
      heading: 'How buyers get tricked by low bids',
      subheading: 'A vendor looks like the cheapest choice on page one. Then you read page 48.',
      box1: {
        label: 'PAGE 1 · PROMISED PRICE',
        text: 'Full system supply and delivery.',
        price: '$1,200,000',
        note: 'Looks like the winning bid',
      },
      box2: {
        label: 'PAGE 48 · HIDDEN NOTES',
        text: 'Does not include setup, testing, or basic warranty.',
        addedCost: '+$185,000 in surprise bills later',
        note: 'Hidden deep in the fine print',
      },
      resultBar: {
        label: 'REAL TOTAL COST: $1,385,000',
        tag: 'Rank drops from 1st to 3rd',
        takeaway: 'Catch missing costs before you sign, not after work starts.',
      },
    },
    /** The receipt section */
    receipt: {
      heading: (props?: { vendor?: string; extra?: string }) => {
        void props
        return 'How buyers get tricked by low bids'
      },
      caption: (vendor: string) => `${vendor}: promised price vs real cost`,
      footnote: 'Note',
      item: 'Item',
      amount: 'Amount',
    },
    evidence: {
      superseded: 'Page 1 says full supply and delivery for $1,200,000.',
      governing: 'Page 48 notes say no setup, testing, or basic warranty.',
      outcome: (adder: string) => `Hidden notes add ${adder} in surprise bills later.`,
      link: (n: number) => `See note ${n} in sample check`,
    },
    howItWorks: {
      heading: 'How It Works',
      subheading: 'Three simple steps to check every vendor bid before you sign.',
      steps: [
        {
          title: '01 / Upload Your Files',
          body: 'Drop in what you asked to buy and the bids you received (PDFs, Word documents, or spreadsheets).',
        },
        {
          title: '02 / Instant Check',
          body: 'SpecClaw reads every line in minutes to catch missing work, hidden rules, and missed requirements.',
        },
        {
          title: '03 / See the Real Price',
          body: 'Get a side-by-side view showing the true cost for each vendor, with links directly to the proof.',
        },
      ],
      line: 'Find what vendors left out in minutes, not weeks.',
      examples: {
        spec: (page: number) => `What you asked for, p. ${page}`,
        bid: ({ vendor, source }: { vendor: string; source: string }) => `${vendor} · ${source}`,
        position: ({ x0, y0, x1, y1 }: { x0: number; y0: number; x1: number; y1: number }) =>
          `Location: ${x0}, ${y0} to ${x1}, ${y1}`,
        field: ({ vendor, requirement }: { vendor: string; requirement: string }) =>
          `${vendor} · ${requirement}`,
        verdict: ({ passed, required }: { passed: boolean; required: string }) =>
          `${passed ? 'Meets' : 'Misses'} ${required}`,
        verified: ({ found, total }: { found: number; total: number }) =>
          `${found} of ${total} checks verified word for word`,
        quantity: ({ qty, unit, rate }: { qty: string; unit: string; rate: string }) =>
          `${qty} ${unit} × ${rate}`,
        total: 'Missing cost',
      },
    },
    sandbox: {
      heading: 'Change the rates, watch the ranking',
      note: 'Same numbers as the brief.',
      breakdown: ({
        bid,
        technical,
        commercial,
      }: {
        bid: string
        technical: string
        commercial: string
      }) => `${bid} bid, +${technical} missing parts, +${commercial} extra fees`,
    },
    offer: {
      heading: 'Stop paying surprise bills on big contracts.',
      body: 'Send us what you want to buy and the bids you received. We will run a sample check and show you who is actually cheapest before you sign.',
      button: 'Get Early Access',
      orWriteTo: (address: string) => `Or email ${address}`,
      whatToSendHeading: 'What to send',
      whatToSend: [
        'What you asked to buy (specs or requirements)',
        'Vendor bid proposals and quote sheets',
        'Equipment lists, drawings, or spreadsheets',
        'Any notes or rules vendors sent back',
      ],
      whatComesBackHeading: 'What you get back',
      whatComesBack: [
        'The real total price for each vendor',
        'Every missing item flagged and priced',
        'Direct links to the exact page for every note',
        'A clear side-by-side comparison before you sign',
      ],
    },
    mailto: {
      subject: (equipment: string) => `Evaluation request: ${equipment} package`,
      body: 'Project or equipment to buy:\nEstimated value range:\nParticipating bidders:\nPlease attach your request files and vendor bids.',
    },
    faqHeading: 'Questions & Answers',
    faq,
    disclaimer: (tenderId?: string) => {
      void tenderId
      return 'SpecClaw checks vendor bids against what you asked to buy.'
    },
  },

  /** The founder-supplied legal pages (spec §13); their text lives in src/content/*.md. */
  legal: {
    impressum: 'Impressum',
    privacy: 'Privacy',
  },

  modal: {
    title: (tenderId: string) => `Replay: checking ${tenderId}`,
    /** The title of a live run in review mode, which is not a replay. */
    liveTitle: (tenderId: string) => `Checking ${tenderId}`,
    chipRecorded: 'Recorded run',
    chipLive: 'Live run',
    /** The input documents (DocCard list). */
    documents: {
      heading: 'Documents',
      spec: 'Spec (what you asked to buy)',
      bid: (vendor: string) => `${vendor} bid`,
      pages: (n: number) => count(n, 'page', 'pages'),
    },
    /** The stage list's name (screen readers). */
    stagesHeading: 'Steps',
    /** A stage's state, for screen readers (the glyph shows it on screen). */
    stageState: {
      pending: 'Not started',
      active: 'In progress',
      done: 'Done',
      failed: 'Stopped',
    },
    /** The live announcement as a stage completes; a live run has no finding until the end. */
    stageDone: ({ label, finding }: { label: string; finding: string | null }) =>
      finding === null ? `${label}: done` : `${label}: ${finding}`,
    allDone: 'All steps done.',
    /** A live job the worker hasn't picked up yet. */
    queued: 'Queued. Waiting for the worker to start.',
    /** The job's progress stopped loading (the job may still finish). */
    jobLost: "Couldn't load the job's progress. Check the tender list for its result.",
    pause: 'Pause',
    play: 'Play',
    /** The six plain-language stages (spec §7.2), in order. */
    stages: [
      'Reading the documents',
      'Finding the evidence',
      'Checking each quote is on its page',
      'Reading the values',
      'Settling contradictions',
      'Pricing the gaps',
    ],
    /** Each stage's finding (spec §7.2), in stage order. Counts pluralize by n (R12). */
    findings: {
      read: ({ documents, pages, sheets }: { documents: number; pages: number; sheets: number }) =>
        `${count(documents, 'document', 'documents')}, ${count(pages, 'page', 'pages')}, ${count(sheets, 'drawing sheet', 'drawing sheets')}`,
      find: (n: number) => `${count(n, 'quote', 'quotes')} located`,
      verify: ({ found, total }: { found: number; total: number }) =>
        `${found} of ${total} found word for word`,
      conversion: ({ vendor, from, to }: { vendor: string; from: string; to: string }) =>
        `${vendor}: ${from} → ${to}`,
      valuesRead: 'Values read',
      contradiction: ({
        vendor,
        claimSource,
        claimPage,
        claimed,
        governingSource,
        governingPage,
        stated,
      }: {
        vendor: string
        claimSource: string
        claimPage: string
        claimed: string
        governingSource: string
        governingPage: string
        stated: string
      }) =>
        `${vendor}: ${claimSource} p.${claimPage} says ${claimed}; ${governingSource} p.${governingPage} says ${stated}. The ${governingSource} governs.`,
      /** A conflict note in a shape the replay can't restate: shown as the backend wrote it. */
      conflictNote: ({ vendor, note }: { vendor: string; note: string }) => `${vendor}: ${note}`,
      noContradictions: 'No contradictions found',
      /** A count-based finding for a tender with no recorded run (migrated from v2, R27). */
      unrecorded: 'Not recorded for this tender',
      /** "10 gaps priced. VoltSwitch Industrial +€64,800."; the apparent low bidder, if any. */
      gaps: ({ n, lowBidder }: { n: number; lowBidder: { name: string; adder: string } | null }) =>
        `${count(n, 'gap', 'gaps')} priced.${lowBidder ? ` ${lowBidder.name} ${lowBidder.adder}.` : ''}`,
    },
    skip: 'Skip to result',
    openBrief: 'Open the brief',
    watchAgain: 'Watch again',
    timing: ({ date, seconds, speed }: { date: string; seconds: string; speed: string }) =>
      `Recorded ${date}; the run took ${seconds} s; shown at ${speed}× speed`,
    /** The timing footer of a draft, which has no recorded date yet. */
    timingUndated: ({ seconds, speed }: { seconds: string; speed: string }) =>
      `The run took ${seconds} s; shown at ${speed}× speed`,
    failure: ({ stage, error }: { stage: string; error: string }) =>
      `Stopped at ${stage}: ${error}. Nothing was saved.`,
    tryAgain: 'Try again',
  },

  verdict: {
    reversal: ({
      low,
      lowBid,
      lowEval,
      winner,
      winnerEval,
    }: {
      low: string
      lowBid: string
      lowEval: string
      winner: string
      winnerEval: string
    }) =>
      `${low} bid ${lowBid}, the lowest. With its gaps priced in, it costs ${lowEval}. ${winner} is the lowest evaluated bid at ${winnerEval}.`,
    lowBidHolds: ({ low, lowBid, lowEval }: { low: string; lowBid: string; lowEval: string }) =>
      `${low} is the lowest bid at ${lowBid} and stays lowest once its gaps are priced: ${lowEval}.`,
    noGaps: ({ n, low, lowBid }: { n: number; low: string; lowBid: string }) =>
      n === 1
        ? `The 1 bid meets the spec as written. ${low} is the lowest at ${lowBid}.`
        : `All ${n} bids meet the spec as written. ${low} is the lowest at ${lowBid}.`,
    tie: ({ a, b, evaluated }: { a: string; b: string; evaluated: string }) =>
      `${a} and ${b} tie at ${evaluated} evaluated.`,
    missingPrice: (vendor: string) => `${vendor}'s bid price wasn't found in its documents.`,
    /**
     * "This excludes {k} unpriced gap(s) and {m} item(s) that need inspection.", naming only the
     * non-zero parts, with the "(s)" resolved to singular or plural. `null` when both are zero.
     */
    caveat: ({
      unpricedGaps,
      inspectionItems,
    }: {
      unpricedGaps: number
      inspectionItems: number
    }): string | null => {
      const parts: string[] = []
      if (unpricedGaps > 0) {
        parts.push(`${unpricedGaps} unpriced ${unpricedGaps === 1 ? 'gap' : 'gaps'}`)
      }
      if (inspectionItems > 0) {
        parts.push(
          inspectionItems === 1
            ? `${inspectionItems} item that needs inspection`
            : `${inspectionItems} items that need inspection`,
        )
      }
      return parts.length === 0 ? null : `This excludes ${parts.join(' and ')}.`
    },
  },

  brief: {
    kicker: (tenderId: string) => `Verified brief · ${tenderId}`,
    table: {
      bidder: 'Bidder',
      bidPrice: 'Bid price',
      technicalGaps: 'Technical gaps',
      commercialGaps: 'Commercial gaps',
      evaluatedPrice: 'Evaluated price',
      requirementsMet: 'Requirements met',
    },
    findingsHeading: 'What we found in each bid',
    sidenote: {
      yourSpec: 'Your spec',
      theBidSays: 'The bid says',
      alsoInTheBid: 'Also in the bid',
      onThePage: 'On the page',
      checks: 'Checks',
      howItsPriced: "How it's priced",
    },
    superseded: ({ governing, other }: { governing: string; other: string }) =>
      `The ${governing} governs over the ${other}.`,
    /** Screen-reader prefix of a struck (superseded) quote. */
    contradicted: 'Contradicted:',
    /** A quote's source line: "Drawing, p. 11". */
    citation: ({ section, page }: { section: string; page: number }) => `${section}, p. ${page}`,
    /** A document section as the backend names it ("cover_letter" → "Cover letter"). */
    sectionName: (section: string): string =>
      Object.hasOwn(SECTIONS, section)
        ? (SECTIONS[section] as string)
        : section.charAt(0).toUpperCase() + section.slice(1).replace(/_/g, ' '),
    cropLoading: 'Loading the page image',
    /** Under the crop; the link opens the image at full size. */
    cropOpen: 'Open full size',
    cropOpenSpoken: '(opens in a new tab)',
    checks: {
      result: 'Result',
      requirement: 'Requirement',
      required: 'Required',
      offered: 'Offered',
      readAs: 'Read as',
      passed: 'Passes',
      failed: 'Fails',
    },
    pricing: {
      drivers: {
        fixed: 'Fixed rate',
        copper: 'Moves with the copper price',
        labour: 'Moves with the site labour rate',
        freight: 'Moves with freight',
      },
      rateTable: 'Rate table',
      total: 'Cost to close this gap',
      unpriced: 'The rate table has no price for this gap yet.',
      /** Read for the "=" in a cost line, which is hidden from screen readers. */
      equals: 'equals',
    },
    /** CheckStrip: "2 of 8" shown, " requirements met" for screen readers too. */
    checkStrip: {
      count: ({ met, total }: { met: number; total: number }) => `${met} of ${total}`,
      suffix: 'requirements met',
    },
    /** A footnote link's accessible name: "Footnote 3". */
    footnoteLabel: (n: number) => `Footnote ${n}`,
    ranking: {
      bidOrder: 'By bid price, lowest first',
      evaluatedOrder: 'By evaluated price, lowest first',
      /** "1st", "2nd", "3rd", "4th", "11th". */
      ordinal: (n: number) => {
        const tens = n % 100
        if (tens >= 11 && tens <= 13) return `${n}th`
        const suffix = ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
        return `${n}${suffix}`
      },
      /** The visible label on a worsened line: "1st → 3rd". */
      change: ({ from, to }: { from: string; to: string }) => `${from} → ${to}`,
      /** The text alternative's wording of the same change, after the evaluated-order entry. */
      changeSpoken: (from: string) => `down from ${from} on bid price`,
      item: ({ name, price }: { name: string; price: string }) => `${name}, ${price}`,
    },
    gridHeading: ({ requirements, bidders }: { requirements: number; bidders: number }) =>
      `All checks: ${requirements} ${requirements === 1 ? 'requirement' : 'requirements'} × ${bidders} ${bidders === 1 ? 'bidder' : 'bidders'}`,
    methodHeading: 'How this brief was made',
    unavailableTitle: "This brief isn't available.",
    unavailableBody:
      "The link may be mistyped, or the brief hasn't been shared yet. Ask the person who sent it for a new link.",

    /** Kicker of a brief that is not verified yet (review mode). */
    draftKicker: (tenderId: string) => `Draft brief · ${tenderId}`,
    /** Document titles (before " · Antova") while loading and when unavailable. */
    titleLoading: 'Loading brief',
    titleUnavailable: 'Brief not available',
    loading: 'Loading the brief',
    /** Masthead meta line parts, joined with " · ". */
    meta: {
      pagesRead: (n: number) => count(n, 'page read', 'pages read'),
      checks: (n: number) => count(n, 'check', 'checks'),
      gaps: (n: number) => count(n, 'gap', 'gaps'),
      verified: (date: string) => `Verified ${date}`,
    },
    /** Added after the sample label when the quotes came from the test answer key (§7.1). */
    testExtraction: 'reference extraction',
    testExtractionAlone: 'Reference extraction',
    /** The leveling table's caption (screen readers; the table has no visible heading). */
    tableCaption: 'Bid prices and evaluated prices',
    /** A bid price the documents didn't give. */
    noPrice: 'Not found',
    /** "VoltSwitch Industrial · 6 gaps · +€64,800". */
    findingsVendor: ({ name, gaps, adder }: { name: string; gaps: number; adder: string }) =>
      `${name} · ${count(gaps, 'gap', 'gaps')} · ${adder}`,
    findingsNone: 'No gaps found in this bid.',
    findingsColumns: {
      footnote: 'Footnote',
      requirement: 'Requirement',
      offered: 'The bid says',
      status: 'Status',
      adder: 'Cost to close',
    },
    /**
     * A check-grid cell's link name: "Deltaport, IED Protection …: Gap". A numbered cell adds
     * the footnote number it shows ("…: Gap 8"), right after the status word as on screen, so
     * the name contains the visible label (WCAG 2.5.3). A cell highlighted in review mode adds
     * ", needs review" (the outline alone says nothing to a screen reader).
     */
    gridCell: ({
      vendor,
      requirement,
      status,
      footnote,
      needsReview = false,
    }: {
      vendor: string
      requirement: string
      status: string
      footnote?: number
      needsReview?: boolean
    }) =>
      `${vendor}, ${requirement}: ${status}${footnote === undefined ? '' : ` ${footnote}`}${needsReview ? ', needs review' : ''}`,
    gridCorner: 'Requirement',
    margin: {
      label: 'Evidence',
      hint: 'Select a footnote number, or any cell in the check grid, to see its evidence here.',
    },
    endnotesHeading: 'Footnotes',
    /** The printed brief's closing line. */
    colophon: ({ date, url }: { date: string; url: string }) => `Verified ${date}. ${url}`,
    rates: {
      heading: 'Adjust the rates',
      intro: 'Move a rate and every total is priced again with the same formula.',
      copper: 'Copper price',
      labour: 'Site labour',
      freight: 'Freight',
      /** The visible value: "×1.20", "€60/h". */
      multiplier: (n: string) => `×${n}`,
      perHour: (eur: string) => `${eur}/h`,
      /** aria-valuetext: "1.20 times the rate table", "€60 per hour". */
      multiplierSpoken: (n: string) => `${n} times the rate table`,
      perHourSpoken: (eur: string) => `${eur} per hour`,
      reset: 'Reset rates',
      /** One vendor's line in the live announcement after a re-price. */
      announce: ({ name, price }: { name: string; price: string }) =>
        `${name} evaluated price ${price}`,
    },
    method: {
      /** `effective` is a written-out date ("3 November 2026"), or null when none was recorded. */
      rateTable: (version: string, effective: string | null) =>
        effective === null
          ? `Gaps are priced from rate table ${version}.`
          : `Gaps are priced from rate table ${version}, effective ${effective}.`,
      columns: {
        bidder: 'Bidder',
        requirement: 'Requirement',
        line: 'Cost line',
        driver: 'Price driver',
      },
      division: 'The model located quotes. Code checked units and did every sum.',
      /** How the quotes were located, by the brief's ingest mode. */
      ingest: (mode: string): string => {
        switch (mode) {
          case 'answer_key':
            return 'Test extraction: the quotes came from an answer key, not a model run.'
          case 'replay':
            return 'Recorded run: the quotes came from a saved model run.'
          case 'live':
            return 'Live run: the model located the quotes for this brief.'
          default:
            return `Ingest mode: ${mode}.`
        }
      },
    },
  },

  /** StatusTag words and glyphs (spec §8.2). */
  status: {
    meets: { word: 'Meets spec', glyph: '✓' },
    gap: { word: 'Gap', glyph: '✗' },
    contradiction: { word: 'Contradiction', glyph: '⇄' },
    missing: { word: 'Missing', glyph: '∅' },
    exceeds: { word: 'Exceeds spec', glyph: '↑' },
    unpriced: { word: 'Unpriced', glyph: '€?' },
    needsInspection: { word: 'Needs inspection', glyph: '!' },
  },

  errors: {
    apiUnreachable:
      "Can't reach SpecClaw right now. The figures shown are from the last successful load.",
    apiUnreachableAction: 'Try again',
    repriceFailed: "Couldn't update the prices. Showing the last ones.",
    cropFailed: 'Page image unavailable. The quote above is exact.',
  },

  notFound: {
    title: 'Page not found',
    heading: 'Page not found.',
    homeLink: 'Go to the home page',
  },

  review: {
    gate: {
      title: 'Review access',
      label: 'Review token',
      help: 'Set as ANTOVA_REVIEW_TOKEN on the server.',
      submit: 'Continue',
      error: "That token didn't work.",
      empty: 'Paste the review token first.',
    },
    notConfigured: 'Review is not configured on this server.',
    reingested: 'Ingested again. This brief is back to draft.',
    /** Under the re-ingested banner, before the overrides the re-ingest cleared. */
    reingestedCleared: (n: number) =>
      n === 1
        ? 'The evidence for this override changed, so the new ingest cleared it. Enter it again if it still applies:'
        : `The evidence for these ${n} overrides changed, so the new ingest cleared them. Enter them again if they still apply:`,
    /** One cleared override: "VoltSwitch Industrial, Main Busbar …: +€10,000 (note)". */
    clearedOverride: ({
      vendor,
      requirement,
      amount,
      note,
    }: {
      vendor: string
      requirement: string
      amount: string
      note: string
    }) => `${vendor}, ${requirement}: ${amount} (${note})`,
    reingestedDismiss: 'Dismiss',
    /**
     * Asked before re-ingesting a verified brief, or one with overrides. Named by the tender
     * being re-ingested, which need not be the brief on screen.
     */
    reingestConfirm: {
      title: (tenderId: string) => `Ingest ${tenderId} again?`,
      /** The brief couldn't be looked up, so what re-ingesting loses is unknown. */
      unknownBody:
        "We couldn't check this tender. If its brief is verified or has overrides, ingesting it again takes it back to draft and clears any override whose evidence has changed.",
      body: ({ verified, overrides }: { verified: boolean; overrides: number }) =>
        [
          verified
            ? 'The brief goes back to draft, and the share link stops working until you verify it again.'
            : null,
          overrides > 0
            ? `${count(overrides, 'override', 'overrides')} on this brief: each stays only if the evidence it rests on is unchanged. Any that change are cleared and listed afterwards so you can enter them again.`
            : null,
        ]
          .filter((sentence) => sentence !== null)
          .join(' '),
      confirm: 'Ingest again',
      cancel: 'Cancel',
    },
    signOut: 'Sign out of review',
    allTenders: 'All tenders',
    /** A /review/:tenderId the server doesn't know. */
    missingTender: (tenderId: string) => `There's no tender called ${tenderId}.`,
    draftBanner: 'Draft. Only you can see this.',
    openItems: (n: number) =>
      n === 1
        ? '1 item needs you before this can be verified.'
        : `${n} items need you before this can be verified.`,
    /** One open item in the list under the draft banner: "Deltaport, I-FAT: Gap found but not priced". */
    openItem: ({
      vendor,
      requirement,
      message,
    }: {
      vendor: string
      requirement: string | null
      message: string
    }) =>
      requirement === null ? `${vendor}: ${message}` : `${vendor}, ${requirement}: ${message}`,
    override: {
      heading: 'Override',
      label: 'Override adder (€)',
      why: 'Why',
      whyPlaceholder: "e.g. engineer's estimate after vendor clarification",
      save: 'Save override',
      remove: 'Remove override',
      badge: (note: string) => `Overridden: ${note}`,
      amountError: 'Use digits only, e.g. 18500 or 18500.50',
      noteError: "Say why you're overriding this adder.",
      /** Ruling R10: overrides are locked while the brief is verified (the backend's 409). */
      locked: 'Withdraw the brief before changing overrides',
      saved: 'Override saved.',
      removed: 'Override removed.',
      saveFailed: "Couldn't save the override. Try again.",
      removeFailed: "Couldn't remove the override. Try again.",
    },
    verify: {
      button: 'Mark verified',
      disabled: (n: number) =>
        n === 1 ? 'Resolve 1 open item first' : `Resolve ${n} open items first`,
      dialogTitle: 'Share this brief?',
      dialogBody: 'Anyone with the link will see vendor names and prices.',
      confirm: 'Mark verified',
      cancel: 'Keep as draft',
      success: 'Verified. Share link copied.',
      /** When the browser refuses the clipboard. */
      successNotCopied: 'Verified. Copy the share link below.',
      failed: "Couldn't mark the brief verified. Try again.",
      /** The tender was ingested again after this page loaded; the page reloads the new run. */
      runChanged:
        'This tender was ingested again after you opened it. The page now shows the new run. Check it, then mark it verified.',
      banner: 'Verified · shared',
      copyLink: 'Copy share link',
      linkCopied: 'Share link copied.',
      copyFailed: "Couldn't copy. The share link is below.",
      shareLink: 'Share link',
      stamp: 'Verified',
    },
    withdraw: {
      button: 'Withdraw brief',
      dialogTitle: 'Withdraw this brief?',
      dialogBody: 'The share link will stop working until you verify it again.',
      confirm: 'Withdraw',
      cancel: 'Keep shared',
      success: 'Withdrawn. The share link no longer works.',
      failed: "Couldn't withdraw the brief. Try again.",
    },
    index: {
      heading: 'Tenders',
      caption: 'Tenders and their open items',
      columns: {
        tender: 'Tender',
        title: 'Title',
        status: 'Status',
        openItems: 'Open items',
        ingested: 'Ingested',
        verified: 'Verified',
      },
      status: { DRAFT: 'Draft', VERIFIED: 'Verified' },
      /** "1 item", "3 items" (ruling R12). */
      openItemCount: (n: number) => count(n, 'item', 'items'),
      notVerified: 'Not yet',
      loading: 'Loading tenders',
    },
    ingest: {
      heading: 'Run ingest',
      folderLabel: 'Tender folder ID',
      folderHelp: 'Capital letters, digits and hyphens, e.g. PROJECT-2026-01.',
      folderError: 'Use capital letters, digits and hyphens only, e.g. PROJECT-2026-01.',
      modeLabel: 'Mode',
      modes: {
        auto: 'Auto: recorded answers where saved, the live model for the rest',
        replay: 'Replay: recorded answers only',
        live: 'Live: ask the model again',
      },
      submit: 'Run ingest',
      checking: 'Checking the tender…',
      startFailed: "Couldn't start the ingest. Try again.",
    },
    /**
     * "No tenders yet. Ingest one with `python -m specclaw_ingest.run <folder>` or *Run ingest*."
     * Split so the page can render the command as <code> and "Run ingest" as the action.
     */
    indexEmpty: {
      lead: 'No tenders yet. Ingest one with ',
      command: 'python -m specclaw_ingest.run <folder>',
      or: ' or ',
      action: 'Run ingest',
      end: '.',
    },
  },
} as const
