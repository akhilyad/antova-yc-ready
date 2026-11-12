/**
 * Sample tender TENDER-2026-402, as produced by the specclaw ingest pipeline.
 *
 * Every quote, page, status and adder below is copied from the pipeline's
 * answer key (specclaw/samples/TENDER-2026-402/expected.json) and the cost
 * table in the pipeline design spec (§11.2-11.3). The documents are synthetic:
 * the generator stamps "SYNTHETIC SAMPLE - not a real offer" on every page.
 * Do not edit figures here without regenerating them from the pipeline.
 */

export type CellStatus =
  | 'COMPLIANT'
  | 'DEVIATION_DOWNGRADE'
  | 'CONFLICT_DOWNGRADE'
  | 'OMITTED';

export type VendorId = 'vendor-a' | 'vendor-b' | 'vendor-c';

export type EvidenceSection =
  | 'mr_spec'
  | 'cover_letter'
  | 'compliance_table'
  | 'datasheet'
  | 'drawing'
  | 'bom'
  | 'test_plan'
  | 'commercial';

export interface Citation {
  page: number;
  section: EvidenceSection;
  quote: string;
}

export interface CostLine {
  label: string;
  qty: number;
  unit: string;
  rate: number;
}

export interface MatrixCell {
  status: CellStatus;
  /** Governing value, rendered the way the pipeline renders extracted_text. */
  offered: string;
  citation: Citation;
  /** Overridden lower-tier claim, kept for conflicts. */
  secondary?: Citation;
  costLines: CostLine[];
}

export interface Parameter {
  id: string;
  name: string;
  short: string;
  /** Readable rule text, as generated for the UI (pint_rule). */
  rule: string;
  criticality: 'MANDATORY' | 'HIGH' | 'COMMERCIAL';
  requirement: Citation;
}

export interface Vendor {
  id: VendorId;
  name: string;
  short: string;
  country: string;
  headline: number;
  headlineCitation: string;
}

export const TENDER = {
  id: 'TENDER-2026-402',
  title: '33kV GIS Switchgear & RTU Protection Package',
  project: '350 MWp Solar + BESS Substation',
  mrDoc: 'MR-33kV-GIS-Rev4.pdf',
  bayCount: 11,
  rateTable: 'mv_gis_switchgear_v1',
  documents: [
    { file: 'MR-33kV-GIS-Rev4.pdf', role: 'mr_spec', pages: 26 },
    { file: 'Bid_vendor-a_Nordwerk.pdf', role: 'vendor_bid', pages: 30 },
    { file: 'Bid_vendor-b_VoltSwitch.pdf', role: 'vendor_bid', pages: 30 },
    { file: 'Bid_vendor-c_Deltaport.pdf', role: 'vendor_bid', pages: 30 },
  ],
  /** Negotiation round 3 concedes every adder except PARAM-04. */
  clawbackRound3: 57400,
} as const;

export const TOTAL_PAGES = TENDER.documents.reduce((s, d) => s + d.pages, 0);

export const VENDORS: Vendor[] = [
  {
    id: 'vendor-a',
    name: 'Nordwerk Schaltanlagen GmbH',
    short: 'Nordwerk',
    country: 'DE',
    headline: 452000,
    headlineCitation: 'NWS-36 GIS',
  },
  {
    id: 'vendor-b',
    name: 'VoltSwitch Industrial',
    short: 'VoltSwitch',
    country: 'TR',
    headline: 418000,
    headlineCitation: 'VS-GIS 36',
  },
  {
    id: 'vendor-c',
    name: 'Deltaport Skid Consortium B.V.',
    short: 'Deltaport',
    country: 'NL',
    headline: 439000,
    headlineCitation: 'DPS-36',
  },
];

export const PARAMETERS: Parameter[] = [
  {
    id: 'PARAM-01',
    name: 'Rated short-time withstand current',
    short: 'Short-time withstand',
    rule: 'Ik ≥ 50 kA AND t ≥ 3 s',
    criticality: 'MANDATORY',
    requirement: {
      page: 5,
      section: 'mr_spec',
      quote:
        'Rated short-time withstand current Ik shall be 50 kA RMS for a duration of 3 s.',
    },
  },
  {
    id: 'PARAM-02',
    name: 'Main busbar material & continuous current',
    short: 'Busbar',
    rule: 'material = Cu-ETP AND Ir ≥ 2500 A',
    criticality: 'MANDATORY',
    requirement: {
      page: 6,
      section: 'mr_spec',
      quote:
        'Main busbars shall be electrolytic copper Cu-ETP rated for 2500 A continuous current.',
    },
  },
  {
    id: 'PARAM-03',
    name: 'Enclosure ingress & internal arc',
    short: 'Enclosure IP / IAC',
    rule: 'IP ≥ IP54 AND IAC = AFLR',
    criticality: 'HIGH',
    requirement: {
      page: 6,
      section: 'mr_spec',
      quote:
        'Enclosure protection shall be IP54 with internal arc classification IAC AFLR.',
    },
  },
  {
    id: 'PARAM-04',
    name: 'IED protection & redundant IEC 61850 PRP',
    short: 'IEC 61850 PRP',
    rule: 'protocol = IEC 61850 Ed.2 PRP AND marshalling = pre-wired',
    criticality: 'HIGH',
    requirement: {
      page: 7,
      section: 'mr_spec',
      quote:
        'Protection IEDs shall communicate via IEC 61850 Edition 2 with PRP redundancy, with pre-wired RTU marshalling in a central marshalling cabinet.',
    },
  },
  {
    id: 'PARAM-05',
    name: 'Witnessed Factory Acceptance Test',
    short: 'Witnessed FAT',
    rule: 'witnessed FAT days in price ≥ 5',
    criticality: 'COMMERCIAL',
    requirement: {
      page: 13,
      section: 'mr_spec',
      quote:
        'A 5-day witnessed integrated factory acceptance test (I-FAT) with primary injection shall be included in the contract price.',
    },
  },
  {
    id: 'PARAM-06',
    name: 'Incoterms & defect liability',
    short: 'Incoterm / warranty',
    rule: 'incoterm = DDP AND warranty ≥ 36 months',
    criticality: 'COMMERCIAL',
    requirement: {
      page: 14,
      section: 'mr_spec',
      quote:
        'Delivery shall be DDP project site Brandenburg (Incoterms 2020). The defect liability period shall be 36 months from commissioning.',
    },
  },
  {
    id: 'PARAM-07',
    name: 'Rated voltage',
    short: 'Rated voltage',
    rule: 'Ur ≥ 36 kV',
    criticality: 'MANDATORY',
    requirement: {
      page: 5,
      section: 'mr_spec',
      quote: 'Rated voltage Ur shall be not less than 36 kV.',
    },
  },
  {
    id: 'PARAM-08',
    name: 'Max ambient temperature without derating',
    short: 'Max ambient',
    rule: 'T_amb,max ≥ 40 °C',
    criticality: 'MANDATORY',
    requirement: {
      page: 7,
      section: 'mr_spec',
      quote:
        'Equipment shall be rated for a maximum ambient air temperature of +40 °C without derating.',
    },
  },
];

const ok = (
  offered: string,
  page: number,
  section: EvidenceSection,
  quote: string
): MatrixCell => ({
  status: 'COMPLIANT',
  offered,
  citation: { page, section, quote },
  costLines: [],
});

export const CELLS: Record<VendorId, Record<string, MatrixCell>> = {
  'vendor-a': {
    'PARAM-01': ok('50 kA (3 s)', 6, 'datasheet', 'Rated short-time withstand current (main busbar and breaker): 50 kA / 3 s.'),
    'PARAM-02': ok('Cu-ETP, 2.5 kA', 6, 'datasheet', 'Main busbars: silver-plated high-conductivity electrolytic copper Cu-ETP, 2.5 kA continuous.'),
    'PARAM-03': ok('IP54, AFLR', 7, 'datasheet', 'Enclosure protection IP54 with rear gas exhaust ducting, internal arc classification IAC AFLR 50 kA 1 s.'),
    'PARAM-04': ok('61850 Ed.2 PRP, pre-wired', 8, 'datasheet', 'Protection IEDs NW-Prot 5 with IEC 61850 Ed.2 PRP dual-port fibre, pre-wired to the central RTU marshalling cabinet.'),
    'PARAM-05': ok('5 days', 18, 'test_plan', 'The price includes a 5-day client-witnessed I-FAT with primary injection.'),
    'PARAM-06': ok('DDP, 36 months', 21, 'commercial', 'Delivery DDP project site Brandenburg (Incoterms 2020) with a 36-month defect liability period.'),
    'PARAM-07': ok('36 kV', 6, 'datasheet', 'Rated voltage Ur: 36 kV.'),
    'PARAM-08': ok('+40 °C', 7, 'datasheet', 'Rated for ambient temperatures from -25 °C to +40 °C without derating.'),
  },
  'vendor-b': {
    'PARAM-01': {
      status: 'CONFLICT_DOWNGRADE',
      offered: '31.5 kA (1 s)',
      citation: {
        page: 11,
        section: 'drawing',
        quote:
          'NOTE 7: Standard switchgear bay rated 31.5kA 1s. 50kA high-duty upgrade excluded from base price.',
      },
      secondary: {
        page: 2,
        section: 'cover_letter',
        quote:
          'The switchgear is fully compliant with the Material Requisition, including the 50 kA / 3 s short-time withstand',
      },
      costLines: [
        { label: 'Breaker & CT upgrade', qty: 11, unit: 'bays', rate: 1600 },
        { label: 'Type-test documentation', qty: 1, unit: 'lot', rate: 900 },
      ],
    },
    'PARAM-02': {
      status: 'DEVIATION_DOWNGRADE',
      offered: 'Al, 2500 A',
      citation: {
        page: 6,
        section: 'datasheet',
        quote:
          'Busbar system manufactured from tin-plated E-AlMgSi0.5 aluminium alloy profiles rated 2500 A continuous.',
      },
      costLines: [
        { label: 'Cu-Al price delta', qty: 1480, unit: 'kg', rate: 8.5 },
        { label: 'Bimetallic joint kit', qty: 1, unit: 'lot', rate: 1620 },
      ],
    },
    'PARAM-03': {
      status: 'DEVIATION_DOWNGRADE',
      offered: 'IP42, AFL',
      citation: {
        page: 7,
        section: 'datasheet',
        quote:
          'Standard indoor enclosure IP42 with ventilation louvres; internal arc classification IAC AFL (front and lateral only).',
      },
      costLines: [
        { label: 'IP54 gasket/filter kit', qty: 11, unit: 'bays', rate: 400 },
        { label: 'Rear arc plenum ducting', qty: 1, unit: 'lot', rate: 4500 },
      ],
    },
    'PARAM-04': {
      status: 'CONFLICT_DOWNGRADE',
      offered: 'Modbus TCP, loose terminals',
      citation: {
        page: 15,
        section: 'bom',
        quote:
          'BOM Pos 44: Standard communication port RJ45 Modbus TCP; SCADA marshalling terminals supplied loose for EPC field termination.',
      },
      secondary: {
        page: 3,
        section: 'compliance_table',
        quote: 'IEC 61850 Ed.2 with PRP redundancy - Complied',
      },
      costLines: [
        { label: 'Dual-fibre PRP card', qty: 11, unit: 'bays', rate: 300 },
        { label: 'Site marshalling labour', qty: 65, unit: 'h', rate: 60 },
        { label: 'Ring-out test kit hire', qty: 1, unit: 'lot', rate: 200 },
      ],
    },
    'PARAM-05': {
      status: 'OMITTED',
      offered: '0 days in price',
      citation: {
        page: 18,
        section: 'test_plan',
        quote:
          'Standard routine test certificates provided. Witnessed FAT charged extra at €1,300/day plus test bay setup.',
      },
      costLines: [{ label: 'Witnessed FAT shortfall', qty: 5, unit: 'days', rate: 1300 }],
    },
    'PARAM-06': {
      status: 'DEVIATION_DOWNGRADE',
      offered: 'EXW, 18 months',
      citation: {
        page: 21,
        section: 'commercial',
        quote:
          'Prices are quoted Ex-Works (EXW) Izmir factory loading dock; standard warranty 18 months from dispatch.',
      },
      costLines: [
        { label: 'Heavy haul EXW → DDP', qty: 2, unit: 'loads', rate: 2600 },
        { label: 'Transit insurance', qty: 1, unit: 'lot', rate: 950 },
        { label: 'Warranty shortfall', qty: 18, unit: 'months', rate: 175 },
      ],
    },
    'PARAM-07': ok('36,000 V', 6, 'datasheet', 'Rated voltage Ur: 36,000 V.'),
    'PARAM-08': ok('40 °C', 7, 'datasheet', 'Maximum ambient temperature 40 °C without derating.'),
  },
  'vendor-c': {
    'PARAM-01': {
      status: 'DEVIATION_DOWNGRADE',
      offered: '50 kA (1 s)',
      citation: {
        page: 6,
        section: 'datasheet',
        quote:
          'Short-time withstand capability tested for 50 kA RMS at 1.0 second thermal duration.',
      },
      costLines: [
        { label: 'Thermal step-up', qty: 11, unit: 'bays', rate: 500 },
        { label: 'Thermal study', qty: 1, unit: 'lot', rate: 700 },
      ],
    },
    'PARAM-02': ok('Cu-ETP, 2500 A', 6, 'datasheet', 'HDHC electrolytic copper busbar system rated 2500 A continuous throughout all MV compartments.'),
    'PARAM-03': ok('IP54, AFLR', 7, 'datasheet', 'Full IP54 dust and splash sealing with 4-sided IAC AFLR internal arc containment.'),
    'PARAM-04': {
      status: 'DEVIATION_DOWNGRADE',
      offered: '61850 Ed.2 PRP, not pre-wired',
      citation: {
        page: 8,
        section: 'datasheet',
        quote:
          'IEC 61850 Ed.2 relays DSC-R200 with PRP fibre ports; RTU marshalling excluded, customer SCADA wiring directly to individual bay LV compartments.',
      },
      costLines: [
        { label: 'Site marshalling labour', qty: 65, unit: 'h', rate: 60 },
        { label: 'Ring-out test kit hire', qty: 1, unit: 'lot', rate: 200 },
      ],
    },
    'PARAM-05': {
      status: 'DEVIATION_DOWNGRADE',
      offered: '3 days in price',
      citation: {
        page: 18,
        section: 'test_plan',
        quote: 'Includes 3 days witnessed inspection; additional days billed per tariff.',
      },
      costLines: [{ label: 'Witnessed FAT shortfall', qty: 2, unit: 'days', rate: 1300 }],
    },
    'PARAM-06': {
      status: 'DEVIATION_DOWNGRADE',
      offered: 'DAP, 24 months',
      citation: {
        page: 21,
        section: 'commercial',
        quote: 'Delivered At Place (DAP) project site; warranty 24 months from commissioning.',
      },
      costLines: [
        { label: 'DAP → DDP (intra-EU)', qty: 1, unit: 'lot', rate: 0 },
        { label: 'Warranty shortfall', qty: 12, unit: 'months', rate: 175 },
      ],
    },
    'PARAM-07': ok('36 kV', 6, 'datasheet', 'Rated voltage Ur: 36 kV.'),
    'PARAM-08': ok('104 °F', 7, 'datasheet', 'Maximum ambient temperature 104 °F without derating.'),
  },
};

export const STATUS_LABEL: Record<CellStatus, string> = {
  COMPLIANT: 'Compliant',
  DEVIATION_DOWNGRADE: 'Deviation',
  CONFLICT_DOWNGRADE: 'Conflict',
  OMITTED: 'Omitted',
};

export const SECTION_LABEL: Record<EvidenceSection, string> = {
  mr_spec: 'MR spec',
  cover_letter: 'Cover letter',
  compliance_table: 'Compliance table',
  datasheet: 'Datasheet',
  drawing: 'Drawing (SLD)',
  bom: 'BOM',
  test_plan: 'Test plan (ITP)',
  commercial: 'Commercial terms',
};

/** Evidence tiers from ontology.py: tier 1 governs tier 2 governs tier 3. */
export const SECTION_TIER: Record<EvidenceSection, 0 | 1 | 2 | 3> = {
  mr_spec: 0,
  drawing: 1,
  bom: 1,
  datasheet: 1,
  test_plan: 1,
  commercial: 1,
  compliance_table: 2,
  cover_letter: 3,
};

export function cellAdder(cell: MatrixCell): number {
  return cell.costLines.reduce((s, l) => s + Math.round(l.qty * l.rate * 100), 0) / 100;
}

export function vendorAdders(vendorId: VendorId): number {
  return Object.values(CELLS[vendorId]).reduce((s, c) => s + cellAdder(c), 0);
}

export type PriceView = 'headline' | 'evaluated' | 'round3';

/**
 * Round 3 applies to the negotiating vendor (lowest headline: VoltSwitch) and
 * concedes every adder except PARAM-04.
 */
export function vendorPrice(vendor: Vendor, view: PriceView): number {
  if (view === 'headline') return vendor.headline;
  const adders = vendorAdders(vendor.id);
  if (view === 'round3' && vendor.id === NEGOTIATING_VENDOR) {
    return vendor.headline + adders - TENDER.clawbackRound3;
  }
  return vendor.headline + adders;
}

export const NEGOTIATING_VENDOR: VendorId = 'vendor-b';

export const PIPELINE_STAGES = [
  { pct: 5, name: 'Intake', detail: 'Manifest validated · SHA-256 per file' },
  { pct: 20, name: 'Parse', detail: 'Pages of words with boxes · sections tagged' },
  { pct: 60, name: 'Locate', detail: 'Claude returns candidate quotes per document' },
  { pct: 70, name: 'Verify citations', detail: 'Quotes matched word-for-word on the page' },
  { pct: 80, name: 'Read values & check', detail: 'Typed values · Pint unit checks' },
  { pct: 85, name: 'Resolve precedence', detail: 'Governing value · status per cell' },
  { pct: 90, name: 'Price', detail: 'Cost lines from the versioned rate table' },
  { pct: 100, name: 'Persist', detail: 'One transaction · leveling cache cleared' },
] as const;
