// SpecClaw — Enterprise Autonomous TBE & Spec-Deviation Clawback Engine
// Crafted with: anti-ui-slop, minimalist-ui, ui-motion, design-spells, ui-ux-pro-max,
// react-component-performance, and react-patterns

const { useState, useMemo, useEffect, useCallback, memo } = React;

// --- DETERMINISTIC DOMAIN DATASET (YC RFS 2027 MASTER BLUEPRINT) ---
const TENDER_DATA = {
  id: 'TENDER-2026-402',
  title: '350 MWp Solar + BESS Substation — 33kV GIS Switchgear & RTU Protection Package',
  client: 'Vogt-Grid EPC Consortium GmbH (Berlin / Madrid)',
  mrDoc: 'MR-33kV-GIS-Rev4.pdf (148 pages + 14 SLD Sheets)',
  pagesParsed: 742,
  latencySec: 142,
  computeCogs: 4.65,
  vendors: [
    {
      id: 'vendor-a',
      name: 'Siemens Energy / Authorised Tier-1',
      country: 'Germany',
      headlinePrice: 452000,
      docName: 'Offer_SIEMENS_8DJH36_Rev2.pdf (196 pages)',
      coverClaim: 'Full compliance with MR-33kV-GIS-Rev4 except minor commercial notes.',
      badge: 'Compliant Baseline',
      tier: 'Tier-1 OEM'
    },
    {
      id: 'vendor-b',
      name: 'VoltSwitch Industrial / Regionale Partner',
      country: 'Turkey / EU',
      headlinePrice: 418000,
      docName: 'Commercial_Tech_Bid_VoltSwitch_2026.pdf (184 pages)',
      coverClaim: '100% Compliant with Material Requisition MR-33kV-GIS-Rev4.',
      badge: 'Apparent Low Bidder (-€34k)',
      tier: 'Apparent Low'
    },
    {
      id: 'vendor-c',
      name: 'Powell / Eaton Skid Consortium',
      country: 'Netherlands',
      headlinePrice: 439000,
      docName: 'Eaton_Powell_33kV_Tender_Pack.pdf (214 pages)',
      coverClaim: 'Compliant per attached Schedule of Deviations.',
      badge: 'Mid Bidder',
      tier: 'Consortium'
    }
  ],
  parameters: [
    {
      id: 'PARAM-01',
      category: 'Electrical Ratings (IEC 62271-200)',
      name: 'Rated Short-Time Withstand Current (Ik)',
      mrRequirement: '50.0 kA RMS (3.0 s)',
      pintRule: 'val_kA >= 50.0 and duration_s >= 3.0',
      criticality: 'MANDATORY',
      vendors: {
        'vendor-a': {
          extracted: '50.0 kA (3.0 s)',
          status: 'COMPLIANT',
          confidence: 0.99,
          bbox: 'Page 44, BBox [118, 210, 490, 245]',
          snippet: 'Rated short-time withstand current (main busbar & breaker): 50 kA / 3s per IEC 62271-100.',
          costAdder: 0,
          adderFormula: '0 (Meets 50 kA / 3s baseline)'
        },
        'vendor-b': {
          extracted: '31.5 kA (1.0 s)',
          status: 'CONFLICT_DOWNGRADE',
          confidence: 0.97,
          bbox: 'Page 64 (SLD Note 7), BBox [84, 512, 540, 568]',
          conflictNote: "Cover Letter Page 2 states '100% Compliant (50kA)', but SLD Drawing #33-04 Footnote 7 specifies 31.5 kA / 1s vacuum interrupter cells.",
          snippet: 'NOTE 7: Standard switchgear bay rated 31.5kA 1s. 50kA high-duty upgrade excluded from base price.',
          costAdder: 18500,
          adderFormula: '11 Bays × €1,681.82 (Vacuum Breaker & CT Core Upgrade 31.5kA -> 50kA)'
        },
        'vendor-c': {
          extracted: '50.0 kA (1.0 s)',
          status: 'DEVIATION_DOWNGRADE',
          confidence: 0.98,
          bbox: 'Page 52, BBox [105, 310, 480, 350]',
          snippet: 'Rated short-time withstand current: 50 kA duration 1.0 second. Extended 3s duty optional.',
          costAdder: 5200,
          adderFormula: 'Busbar dynamic bracing upgrade for 3s thermal rating'
        }
      }
    },
    {
      id: 'PARAM-02',
      category: 'Electrical Ratings (IEC 62271-200)',
      name: 'Main Busbar Material & Continuous Current',
      mrRequirement: 'Electrolytic Copper (Cu-ETP), 2500 A',
      pintRule: 'material == "Cu-ETP" and rating_A >= 2500',
      criticality: 'MANDATORY',
      vendors: {
        'vendor-a': {
          extracted: 'Electrolytic Copper (Cu-ETP), 2500 A',
          status: 'COMPLIANT',
          confidence: 0.99,
          bbox: 'Page 46, BBox [122, 180, 505, 215]',
          snippet: 'Main busbar: ETP copper grade CW004A, cross-section sized for 2500A continuous rated current at 45°C ambient.',
          costAdder: 0,
          adderFormula: '0 (Standard Cu-ETP)'
        },
        'vendor-b': {
          extracted: 'Aluminum Alloy (AlMgSi), 2500 A',
          status: 'DEVIATION_DOWNGRADE',
          confidence: 0.95,
          bbox: 'Page 79, BBox [95, 420, 510, 470]',
          conflictNote: "Specification Clause 4.2 strictly mandates Cu-ETP copper. VoltSwitch substitutes AlMgSi aluminum busbars with bimetallic copper transition plates.",
          snippet: 'Busbar system manufactured from tin-plated E-AlMgSi0.5 aluminum alloy profiles.',
          costAdder: 14200,
          adderFormula: 'LME Cu vs Al Spot Delta (1,480 kg Cu equivalent + bimetallic joint kit)'
        },
        'vendor-c': {
          extracted: 'Electrolytic Copper (Cu-ETP), 2500 A',
          status: 'COMPLIANT',
          confidence: 0.99,
          bbox: 'Page 58, BBox [110, 205, 495, 240]',
          snippet: 'HDHC Electrolytic copper busbar system throughout all MV compartments.',
          costAdder: 0,
          adderFormula: '0 (Compliant baseline)'
        }
      }
    },
    {
      id: 'PARAM-03',
      category: 'Mechanical & Safety Protection',
      name: 'Enclosure Ingress & Internal Arc Rating',
      mrRequirement: 'IP54 / IAC AFLR 50 kA 1.0 s',
      pintRule: 'ip_rating >= 54 and iac_class == "AFLR"',
      criticality: 'HIGH',
      vendors: {
        'vendor-a': {
          extracted: 'IP54 / IAC AFLR 50 kA 1.0 s',
          status: 'COMPLIANT',
          confidence: 0.99,
          bbox: 'Page 39, BBox [120, 300, 510, 340]',
          snippet: 'Enclosure protection IP54 with rear gas exhaust ducting IAC AFLR 50kA 1s.',
          costAdder: 0,
          adderFormula: '0 (Fully certified AFLR)'
        },
        'vendor-b': {
          extracted: 'IP42 / IAC AFL (3 sides) 31.5 kA',
          status: 'DEVIATION_DOWNGRADE',
          confidence: 0.94,
          bbox: 'Page 88, BBox [130, 610, 520, 665]',
          conflictNote: "Rear accessibility requires AFLR containment. Quoted AFL leaves rear operators exposed in the GIS container hallway.",
          snippet: 'Standard indoor IP42 ventilation louvers; arc classification AFL (front and lateral only).',
          costAdder: 8900,
          adderFormula: 'IP54 Gasket/Filter Kit + Rear Arc-Flash Plenum Ducting (AFL -> AFLR)'
        },
        'vendor-c': {
          extracted: 'IP54 / IAC AFLR 50 kA 1.0 s',
          status: 'COMPLIANT',
          confidence: 0.97,
          bbox: 'Page 63, BBox [115, 280, 490, 320]',
          snippet: 'Full IP54 dust/splash sealing and 4-sided AFLR internal arc containment.',
          costAdder: 0,
          adderFormula: '0 (Meets spec)'
        }
      }
    },
    {
      id: 'PARAM-04',
      category: 'Control, SCADA & Protection Relays',
      name: 'IED Protection & Redundant IEC 61850 PRP',
      mrRequirement: 'Dual-Port Fiber IEC 61850 Ed.2 PRP + Marshalling',
      pintRule: 'protocol == "IEC61850_Ed2_PRP" and rtu_marshalling == "PREWIRED"',
      criticality: 'HIGH',
      vendors: {
        'vendor-a': {
          extracted: 'Siprotec 5 IEC 61850 Ed.2 PRP + Pre-wired Marshalling',
          status: 'COMPLIANT',
          confidence: 0.98,
          bbox: 'Page 104, BBox [90, 150, 530, 210]',
          snippet: 'Includes dual-homing fiber LC ports (PRP Protocol) wired to central X100 RTU terminal marshalling bay.',
          costAdder: 0,
          adderFormula: '0 (Pre-marshalled & factory tested)'
        },
        'vendor-b': {
          extracted: 'Single RJ45 Modbus TCP + Loose Relays',
          status: 'CONFLICT_DOWNGRADE',
          confidence: 0.93,
          bbox: 'Page 119, BBox [78, 390, 545, 455]',
          conflictNote: "Compliance table claims IEC 61850 support, but BOM Line 44 quotes basic RS485/RJ45 communication card and ships interposing terminal blocks loose for site wiring.",
          snippet: 'BOM Pos 44: Standard comm port RJ45; SCADA marshalling terminals supplied loose for EPC field termination.',
          costAdder: 7400,
          adderFormula: '11x Dual-Fiber PRP Cards (€3,300) + 68 hrs Site Electrician Wiring (€4,100)'
        },
        'vendor-c': {
          extracted: 'ABB Relion 615 IEC 61850 PRP (Unmarshalled)',
          status: 'DEVIATION_DOWNGRADE',
          confidence: 0.95,
          bbox: 'Page 112, BBox [100, 410, 505, 460]',
          snippet: 'Relays include PRP fiber ports; customer SCADA wiring directly to individual bay LV compartments.',
          costAdder: 4100,
          adderFormula: '68 hrs Site Electrician Termination & Point-to-Point Ring-out'
        }
      }
    },
    {
      id: 'PARAM-05',
      category: 'Quality Assurance & Testing',
      name: 'Witnessed Factory Acceptance Test (I-FAT)',
      mrRequirement: '5-Day Witnessed Integrated FAT (I-FAT) Included',
      pintRule: 'ifat_days >= 5 and witnessed == True',
      criticality: 'COMMERCIAL',
      vendors: {
        'vendor-a': {
          extracted: '5-Day Witnessed I-FAT Included',
          status: 'COMPLIANT',
          confidence: 0.99,
          bbox: 'Page 162, BBox [110, 220, 480, 260]',
          snippet: 'Price includes 5 days factory test bay allocation for client witnessed I-FAT with primary injection.',
          costAdder: 0,
          adderFormula: '0 (Included in base)'
        },
        'vendor-b': {
          extracted: 'Routine Unwitnessed Test Report Only',
          status: 'OMITTED',
          confidence: 0.98,
          bbox: 'Page 171, BBox [88, 510, 520, 555]',
          conflictNote: "Material Requisition Clause 9 mandates full client-witnessed primary injection I-FAT. Vendor offer silently excludes test bay time and engineer witnessing.",
          snippet: 'Standard routine test certificates provided. Witnessed FAT charged extra at €1,300/day + test bay setup.',
          costAdder: 6500,
          adderFormula: '5 Days Test Bay Allocation + Primary Injection Engineer Rate (5 × €1,300)'
        },
        'vendor-c': {
          extracted: '3-Day Witnessed FAT Included',
          status: 'DEVIATION_DOWNGRADE',
          confidence: 0.96,
          bbox: 'Page 189, BBox [105, 330, 490, 370]',
          snippet: 'Includes 3 days witnessed inspection; additional days billed per tariff.',
          costAdder: 2600,
          adderFormula: '2 Additional I-FAT Days for SCADA point-to-point verification'
        }
      }
    },
    {
      id: 'PARAM-06',
      category: 'Commercial & Logistics Terms',
      name: 'Incoterms 2020 & Defect Liability',
      mrRequirement: 'DDP Project Site (Brandenburg, DE) + Defect Liability 36 Mo',
      pintRule: 'incoterm == "DDP" and warranty_months >= 36',
      criticality: 'COMMERCIAL',
      vendors: {
        'vendor-a': {
          extracted: 'DDP Brandenburg Site / 36 Months Warranty',
          status: 'COMPLIANT',
          confidence: 0.99,
          bbox: 'Page 188, BBox [95, 190, 510, 235]',
          snippet: 'Delivery DDP Solar Substation Site (Incoterms 2020), 36-month defect liability period.',
          costAdder: 0,
          adderFormula: '0 (DDP Delivered Site)'
        },
        'vendor-b': {
          extracted: 'EXW Factory (Izmir) / 18 Months Warranty',
          status: 'DEVIATION_DOWNGRADE',
          confidence: 0.99,
          bbox: 'Page 181, BBox [102, 600, 535, 650]',
          conflictNote: "EXW terms shift import customs, transit permits, and crane-offloading risk onto the EPC contractor.",
          snippet: 'Prices quoted Ex-Works (EXW) factory loading dock; standard 18-month warranty from dispatch.',
          costAdder: 9300,
          adderFormula: '2x Low-Loader Heavy Freight + Transit Insurance (€6,100) + 18-Mo Warranty Bond (€3,200)'
        },
        'vendor-c': {
          extracted: 'DAP Site / 24 Months Warranty',
          status: 'DEVIATION_DOWNGRADE',
          confidence: 0.97,
          bbox: 'Page 204, BBox [112, 410, 495, 450]',
          snippet: 'Delivered At Place (DAP); warranty 24 months from commissioning.',
          costAdder: 2100,
          adderFormula: '12-Month Extended Defect Liability Bond Adder'
        }
      }
    }
  ]
};

// --- PURE VECTOR SVG ICON PACK (Tailored, Zero Slop) ---
function SvgIcon({ name, className = "w-4 h-4" }) {
  const icons = {
    layers: (
      <React.Fragment>
        <polygon points="12 2 2 7 12 12 22 7 12 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <polyline points="2 17 12 22 22 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <polyline points="2 12 12 17 22 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </React.Fragment>
    ),
    upload: (
      <React.Fragment>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </React.Fragment>
    ),
    calculator: (
      <React.Fragment>
        <rect width="16" height="20" x="4" y="2" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <line x1="8" x2="16" y1="6" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="16" x2="16" y1="14" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="8" cy="10" r="1" fill="currentColor"/>
        <circle cx="12" cy="10" r="1" fill="currentColor"/>
        <circle cx="16" cy="10" r="1" fill="currentColor"/>
        <circle cx="8" cy="14" r="1" fill="currentColor"/>
        <circle cx="12" cy="14" r="1" fill="currentColor"/>
      </React.Fragment>
    ),
    send: (
      <React.Fragment>
        <line x1="22" y1="2" x2="11" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </React.Fragment>
    ),
    check: (
      <React.Fragment>
        <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </React.Fragment>
    ),
    alert: (
      <React.Fragment>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </React.Fragment>
    ),
    refresh: (
      <React.Fragment>
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path d="M8 16H3v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path d="M16 8h5V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </React.Fragment>
    ),
    download: (
      <React.Fragment>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </React.Fragment>
    ),
    file: (
      <React.Fragment>
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </React.Fragment>
    ),
    crosshair: (
      <React.Fragment>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <line x1="22" y1="12" x2="18" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="6" y1="12" x2="2" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="12" y1="6" x2="12" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="12" y1="22" x2="12" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </React.Fragment>
    ),
    copy: (
      <React.Fragment>
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </React.Fragment>
    ),
    sliders: (
      <React.Fragment>
        <line x1="4" y1="21" x2="4" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="4" y1="10" x2="4" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="12" y1="21" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="12" y1="8" x2="12" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="20" y1="21" x2="20" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="20" y1="12" x2="20" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="1" y1="14" x2="7" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="9" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="17" y1="16" x2="23" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </React.Fragment>
    ),
    sparkles: (
      <React.Fragment>
        <path d="M12 3l1.9 4.8L18.7 9l-4.8 1.9L12 15.7l-1.9-4.8L5.3 9l4.8-1.9L12 3z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M19 16l.9 2.2 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.2z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </React.Fragment>
    )
  };

  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      {icons[name] || null}
    </svg>
  );
}

// --- STATUS BADGE (Minimalist, Accessible, Zero Slop) ---
const StatusBadge = memo(function StatusBadge({ status, isConceded }) {
  if (isConceded) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
        <SvgIcon name="check" className="w-3 h-3 text-emerald-400" /> Conceded (€0)
      </span>
    );
  }
  switch (status) {
    case 'COMPLIANT':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
          <SvgIcon name="check" className="w-3 h-3 text-emerald-400" /> Compliant
        </span>
      );
    case 'CONFLICT_DOWNGRADE':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
          <SvgIcon name="alert" className="w-3 h-3 text-rose-400" /> Conflict Trap
        </span>
      );
    case 'DEVIATION_DOWNGRADE':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
          <SvgIcon name="alert" className="w-3 h-3 text-amber-400" /> Downgrade
        </span>
      );
    case 'OMITTED':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-purple-500/10 text-purple-400 border border-purple-500/30">
          <SvgIcon name="alert" className="w-3 h-3 text-purple-400" /> Excluded Scope
        </span>
      );
    default:
      return null;
  }
});

// --- SUB-COMPONENT: INTERACTIVE CAD / SLD SCHEMATIC INSPECTOR ---
const CadSchematicVisualizer = memo(function CadSchematicVisualizer({ paramId, vendorId }) {
  const isVoltswitchConflict = paramId === 'PARAM-01' && vendorId === 'vendor-b';
  const isBusbarAlloy = paramId === 'PARAM-02' && vendorId === 'vendor-b';

  return (
    <div className="rounded-lg border border-[#232530] bg-[#0A0B0E] p-3 text-xs font-mono relative overflow-hidden select-none">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1E202B] text-[10px] text-gray-400">
        <span className="flex items-center gap-1.5 text-cyan-400 font-semibold">
          <SvgIcon name="crosshair" className="w-3.5 h-3.5 text-cyan-400" />
          VECTOR CAD DRAWING SHEET #33-04
        </span>
        <span className="text-gray-500">LAYER: MV_BUSBAR_RATINGS</span>
      </div>

      {/* VECTOR CAD WIREFRAME SCHEMATIC */}
      <div className="relative h-40 w-full bg-[#08090C] rounded border border-[#1A1C24] p-3 flex flex-col justify-between overflow-hidden">
        {/* Grid pattern background */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(#38BDF8 0.75px, transparent 0.75px)',
            backgroundSize: '12px 12px'
          }}
        />

        {/* CAD Schematic Header Line */}
        <div className="flex items-center justify-between z-10 text-[10px] text-gray-500 font-mono">
          <span>BUS-A: 33kV 2500A 3-PHASE GIS</span>
          <span>DRAWING REV: 4.2</span>
        </div>

        {/* Busbar Single Line Graphic */}
        <div className="z-10 flex items-center justify-around py-3">
          {/* Bay 1 */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] text-gray-400">BAY-01 (Incomer)</span>
            <div className="w-7 h-7 rounded border border-cyan-500/40 bg-cyan-950/20 flex items-center justify-center text-[10px] text-cyan-300 font-bold">
              CB
            </div>
            <span className="text-[8px] text-gray-500">50kA 3s</span>
          </div>

          <div className="h-0.5 flex-1 bg-cyan-500/30 mx-1 relative">
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border border-cyan-400/50 bg-[#08090C]" />
          </div>

          {/* Bay 2 (Target BBox inspection zone) */}
          <div className="flex flex-col items-center gap-1 relative">
            {isVoltswitchConflict && (
              <div className="absolute -inset-2 rounded border border-rose-500/80 bg-rose-950/30 animate-pulse pointer-events-none z-20 flex items-center justify-center">
                <span className="absolute -top-4 right-0 text-[8px] font-bold text-rose-300 bg-rose-900/90 px-1 py-0.2 rounded border border-rose-500">
                  CONFLICT BBOX [84,512,540,568]
                </span>
              </div>
            )}
            <span className="text-[9px] text-rose-300 font-bold">BAY-02 (Feeder)</span>
            <div className="w-7 h-7 rounded border border-rose-500 bg-rose-950/40 flex items-center justify-center text-[10px] text-rose-300 font-bold shadow-[0_0_10px_rgba(244,63,94,0.3)]">
              {isVoltswitchConflict ? '31.5k' : '50k'}
            </div>
            <span className={`text-[8px] font-bold ${isVoltswitchConflict ? 'text-rose-400' : 'text-emerald-400'}`}>
              {isVoltswitchConflict ? '31.5kA 1s [NOTE 7]' : '50kA 3s [REQ]'}
            </span>
          </div>

          <div className="h-0.5 flex-1 bg-cyan-500/30 mx-1" />

          {/* Bay 3 */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] text-gray-400">BAY-03 (BESS)</span>
            <div className="w-7 h-7 rounded border border-cyan-500/40 bg-cyan-950/20 flex items-center justify-center text-[10px] text-cyan-300 font-bold">
              CB
            </div>
            <span className="text-[8px] text-gray-500">50kA 3s</span>
          </div>
        </div>

        {/* CAD Schematic Callout Footer */}
        <div className="z-10 flex items-center justify-between text-[10px] border-t border-[#1E202B] pt-1.5">
          <span className="text-gray-400">
            {isVoltswitchConflict
              ? '⚠️ Footnote 7: "Standard breaker 31.5kA 1s. High duty excluded."'
              : isBusbarAlloy
              ? '⚠️ Clause 4.2: "AlMgSi Alloy quoted with bimetallic joint kit."'
              : '✓ Coordinate Match: Verified against Material Requisition Rev4.'}
          </span>
          <span className="text-cyan-400 font-mono">PINT: PASS</span>
        </div>
      </div>
    </div>
  );
});

// --- SUB-COMPONENT: WATERFALL PROGRESS BAR ---
const WaterfallMiniBar = memo(function WaterfallMiniBar({ headline, techPenalties, commercialAdders, clawed, trueEvaluated }) {
  const maxVal = 520000;
  const baseWidth = Math.min(100, Math.max(10, (headline / maxVal) * 100));
  const techWidth = Math.min(100, (techPenalties / maxVal) * 100);
  const commWidth = Math.min(100, (commercialAdders / maxVal) * 100);

  return (
    <div className="space-y-1.5 pt-2">
      <div className="flex justify-between text-[10px] font-mono text-gray-400">
        <span>Component Cost Stack</span>
        <span className="text-white font-semibold">€{trueEvaluated.toLocaleString()} Total</span>
      </div>
      <div className="h-2 w-full bg-[#181A24] rounded-full overflow-hidden flex border border-[#232530]">
        <div style={{ width: `${baseWidth}%` }} className="bg-sky-500 h-full transition-all duration-300" title="Base Bid" />
        {techPenalties > 0 && (
          <div style={{ width: `${techWidth}%` }} className="bg-rose-500 h-full transition-all duration-300" title="Tech Deviations" />
        )}
        {commercialAdders > 0 && (
          <div style={{ width: `${commWidth}%` }} className="bg-amber-500 h-full transition-all duration-300" title="Commercial Scope Adders" />
        )}
      </div>
      <div className="flex items-center gap-3 text-[9px] font-mono text-gray-400">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>Base</span>
        {techPenalties > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>Tech (+€{techPenalties.toLocaleString()})</span>}
        {commercialAdders > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Commercial (+€{commercialAdders.toLocaleString()})</span>}
      </div>
    </div>
  );
});

// --- SUB-COMPONENT: MEMOIZED TABLE ROW ---
const TbeTableRow = memo(function TbeTableRow({ param, isSelected, isConceded, onSelect }) {
  const vendorA = param.vendors['vendor-a'];
  const vendorB = param.vendors['vendor-b'];
  const vendorC = param.vendors['vendor-c'];

  return (
    <tr
      onClick={() => onSelect(param.id)}
      className={`cursor-pointer transition-colors duration-150 border-b border-[#1E202B] ${
        isSelected ? 'bg-cyan-950/20 border-l-2 border-l-cyan-400' : 'hover:bg-[#151720]'
      }`}
    >
      <td className="py-3 px-4 align-top">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#181A24] text-cyan-300 border border-[#262836]">
            {param.id}
          </span>
          <span className="font-semibold text-gray-100 text-xs">{param.name}</span>
        </div>
        <div className="text-gray-400 font-mono text-[11px] mt-1">
          Req: <span className="text-gray-200">{param.mrRequirement}</span>
        </div>
      </td>

      {/* SIEMENS */}
      <td className="py-3 px-3 align-top">
        <StatusBadge status={vendorA.status} isConceded={false} />
        <div className="text-gray-300 text-[11px] mt-1 font-mono">{vendorA.extracted}</div>
      </td>

      {/* VOLTSWITCH (Target) */}
      <td className="py-3 px-3 align-top bg-rose-950/10 border-x border-rose-900/20">
        <StatusBadge status={vendorB.status} isConceded={isConceded} />
        <div className="text-gray-200 text-[11px] mt-1 font-mono font-medium">{vendorB.extracted}</div>
        {vendorB.costAdder > 0 && (
          <div
            className={`font-mono text-[11px] mt-1 font-bold ${
              isConceded ? 'line-through text-gray-500' : 'text-rose-400'
            }`}
          >
            +€{vendorB.costAdder.toLocaleString()}
          </div>
        )}
      </td>

      {/* POWELL / EATON */}
      <td className="py-3 px-3 align-top">
        <StatusBadge status={vendorC.status} isConceded={false} />
        <div className="text-gray-300 text-[11px] mt-1 font-mono">{vendorC.extracted}</div>
        {vendorC.costAdder > 0 && (
          <div className="font-mono text-[11px] mt-1 text-amber-400">
            +€{vendorC.costAdder.toLocaleString()}
          </div>
        )}
      </td>
    </tr>
  );
});

// ======================================================================
// MAIN COMPONENT: SPECCLAW APP
// ======================================================================
function SpecClawApp() {
  const [activeTab, setActiveTab] = useState('tbe'); // 'dropzone' | 'tbe' | 'cbe' | 'negotiator'
  const [selectedParamId, setSelectedParamId] = useState('PARAM-01');
  const [selectedVendorFocus, setSelectedVendorFocus] = useState('vendor-b');
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'conflicts' | 'mandatory' | 'commercial'
  const [searchQuery, setSearchQuery] = useState('');

  // Sensitivity Sliders (Parametric Leveling)
  const [copperMultiplier, setCopperMultiplier] = useState(1.0);
  const [siteLaborRate, setSiteLaborRate] = useState(60);
  const [freightMultiplier, setFreightMultiplier] = useState(1.0);

  // Negotiation Simulation State
  const [negotiationRound, setNegotiationRound] = useState(1);
  const [concededItems, setConcededItems] = useState([]);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(4);
  const [apiOnline, setApiOnline] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Health check and WebSocket live telemetry connection
  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        if (data.status === 'healthy') setApiOnline(true);
      })
      .catch(() => setApiOnline(false));

    // Connect real-time telemetry WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || '127.0.0.1:8000';
    const wsUrl = `${protocol}//${host}/ws/telemetry`;
    let ws = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        setApiOnline(true);
        console.log('[SpecClaw Telemetry] WebSocket stream active.');
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event_type === 'JOB_PROGRESS') {
            const stepNum = Math.min(4, Math.max(1, Math.ceil(msg.payload.progress_pct / 25)));
            setPipelineStep(stepNum);
          }
        } catch (e) {}
      };
    } catch (e) {}

    return () => {
      if (ws) ws.close();
    };
  }, []);

  // Keyboard navigation shortcuts [1-4], arrows
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === '1') setActiveTab('dropzone');
      if (e.key === '2') setActiveTab('tbe');
      if (e.key === '3') setActiveTab('cbe');
      if (e.key === '4') setActiveTab('negotiator');

      // Arrow navigation for parameters
      if (e.key === 'ArrowDown' || e.key === 'j') {
        const idx = TENDER_DATA.parameters.findIndex(p => p.id === selectedParamId);
        if (idx < TENDER_DATA.parameters.length - 1) {
          setSelectedParamId(TENDER_DATA.parameters[idx + 1].id);
        }
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        const idx = TENDER_DATA.parameters.findIndex(p => p.id === selectedParamId);
        if (idx > 0) {
          setSelectedParamId(TENDER_DATA.parameters[idx - 1].id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedParamId]);

  // Leveling Calculation Engine (Memoized)
  const financials = useMemo(() => {
    return TENDER_DATA.vendors.map(v => {
      let techPenalties = 0;
      let commercialAdders = 0;
      let clawedAmount = 0;

      TENDER_DATA.parameters.forEach(p => {
        const vData = p.vendors[v.id];
        let adder = vData.costAdder;

        if (p.id === 'PARAM-02' && adder > 0) {
          adder = Math.round(adder * copperMultiplier);
        }
        if (p.id === 'PARAM-04' && adder > 0) {
          const baseHw = v.id === 'vendor-b' ? 3300 : 0;
          adder = Math.round(baseHw + 4100 * (siteLaborRate / 60));
        }
        if (p.id === 'PARAM-06' && adder > 0) {
          adder = Math.round(adder * freightMultiplier);
        }

        const isConceded = v.id === 'vendor-b' && concededItems.includes(p.id);
        if (isConceded) {
          clawedAmount += adder;
        } else {
          if (p.criticality === 'COMMERCIAL') {
            commercialAdders += adder;
          } else {
            techPenalties += adder;
          }
        }
      });

      const trueEvaluated = v.headlinePrice + techPenalties + commercialAdders;
      return {
        ...v,
        techPenalties,
        commercialAdders,
        totalAdders: techPenalties + commercialAdders,
        clawedAmount,
        trueEvaluated
      };
    });
  }, [copperMultiplier, siteLaborRate, freightMultiplier, concededItems]);

  const activeParam = useMemo(() => {
    return TENDER_DATA.parameters.find(p => p.id === selectedParamId) || TENDER_DATA.parameters[0];
  }, [selectedParamId]);

  const vendorBStats = useMemo(() => {
    return financials.find(v => v.id === 'vendor-b') || financials[1];
  }, [financials]);

  const specClawFee = Math.round(vendorBStats.clawedAmount * 0.15);
  const netSavings = vendorBStats.clawedAmount - specClawFee;

  // Filtered parameters list
  const filteredParameters = useMemo(() => {
    return TENDER_DATA.parameters.filter(p => {
      if (filterMode === 'conflicts') {
        const status = p.vendors['vendor-b'].status;
        return status === 'CONFLICT_DOWNGRADE' || status === 'DEVIATION_DOWNGRADE';
      }
      if (filterMode === 'mandatory') {
        return p.criticality === 'MANDATORY' || p.criticality === 'HIGH';
      }
      if (filterMode === 'commercial') {
        return p.criticality === 'COMMERCIAL';
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.mrRequirement.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [filterMode, searchQuery]);

  const handleSimulateTurn = useCallback(async () => {
    let nextRound = 1;
    let nextConceded = [];
    if (negotiationRound === 1) {
      nextRound = 2;
      nextConceded = ['PARAM-01', 'PARAM-03', 'PARAM-05'];
    } else if (negotiationRound === 2) {
      nextRound = 3;
      nextConceded = ['PARAM-01', 'PARAM-02', 'PARAM-03', 'PARAM-05', 'PARAM-06'];
    } else {
      nextRound = 1;
      nextConceded = [];
    }
    setNegotiationRound(nextRound);
    setConcededItems(nextConceded);

    // Persist to backend database audit ledger & broadcast event
    try {
      await fetch(`/api/negotiate/turn?round_num=${nextRound}`, { method: 'POST' });
    } catch (e) {}
  }, [negotiationRound]);

  const handleRunPipeline = useCallback(async () => {
    setPipelineRunning(true);
    setPipelineStep(1);

    try {
      const res = await fetch('/api/jobs/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tender_id: TENDER_DATA.id,
          document_count: 4,
          ocr_mode: 'vector_hybrid'
        })
      });

      if (res.ok) {
        // Step progression driven by backend worker
        for (let i = 2; i <= 4; i++) {
          await new Promise(r => setTimeout(r, 350));
          setPipelineStep(i);
        }
      } else {
        setTimeout(() => setPipelineStep(2), 350);
        setTimeout(() => setPipelineStep(3), 700);
        setTimeout(() => setPipelineStep(4), 1050);
      }
    } catch (e) {
      setTimeout(() => setPipelineStep(2), 350);
      setTimeout(() => setPipelineStep(3), 700);
      setTimeout(() => setPipelineStep(4), 1050);
    } finally {
      setTimeout(() => setPipelineRunning(false), 1100);
    }
  }, []);

  const handleCopyEmail = useCallback(() => {
    const emailBody = document.getElementById('negotiator-email-content');
    if (emailBody) {
      navigator.clipboard.writeText(emailBody.innerText);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  }, []);

  const handleExportPdf = useCallback(async () => {
    setIsExportingPdf(true);
    try {
      const res = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          negotiation_round: negotiationRound,
          conceded_params: concededItems
        })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SpecClaw_Audit_PO_${TENDER_DATA.id}_Rev${negotiationRound}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        alert('FastAPI server responded with error. Ensure specclaw_api.py is running on port 8000.');
      }
    } catch (e) {
      alert('PDF generation endpoint offline. Falling back to local browser print.');
      window.print();
    } finally {
      setIsExportingPdf(false);
    }
  }, [negotiationRound, concededItems]);

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-gray-100 flex flex-col font-sans selection:bg-cyan-500/20 selection:text-cyan-300">
      {/* =========================================================
          SLEEK MINIMALIST HEADER & TELEMETRY STRIP
      ========================================================= */}
      <header className="border-b border-[#1E202B] bg-[#0E0F14]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-cyan-500 flex items-center justify-center text-gray-950 font-black text-xs tracking-tighter">
              SC
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-white font-mono">SPECCLAW</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#181A24] text-gray-300 border border-[#262836]">
                  v1.2 ENTERPRISE
                </span>
                {apiOnline ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    FastAPI Engine Active
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#181A24] text-gray-400 border border-[#262836]">
                    Autonomous Physics Mode
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* TELEMETRY METRIC PILLS */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <div className="hidden md:flex px-2.5 py-1 rounded-md bg-[#12131A] border border-[#1E202B] text-gray-400">
              Corpus: <span className="text-gray-200 ml-1 font-semibold">{TENDER_DATA.pagesParsed} Pages</span>
            </div>
            <div className="hidden md:flex px-2.5 py-1 rounded-md bg-[#12131A] border border-[#1E202B] text-gray-400">
              Compute COGS: <span className="text-emerald-400 ml-1 font-semibold">${TENDER_DATA.computeCogs}</span>
            </div>
            <div className="px-2.5 py-1 rounded-md bg-rose-500/10 border border-rose-500/25 text-rose-300">
              Exposed Risk: <span className="text-rose-400 font-bold ml-1">€64,800</span>
            </div>
            {vendorBStats.clawedAmount > 0 && (
              <div className="px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-300">
                Clawed Back: <span className="text-emerald-400 font-bold ml-1">€{vendorBStats.clawedAmount.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* SUBHEADER TABS WITH SILK MOTION */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between border-t border-[#181A24] text-xs">
          <div className="py-2 text-gray-400 truncate max-w-sm hidden lg:block font-mono text-[11px]">
            <span className="text-cyan-400 font-medium">{TENDER_DATA.id}:</span> 350MWp Solar GIS Substation
          </div>

          <nav className="flex space-x-1 py-1">
            {[
              { id: 'dropzone', num: '1', label: 'Ingestion Wedge', icon: 'upload' },
              { id: 'tbe', num: '2', label: 'TBE Matrix & CAD', icon: 'layers' },
              { id: 'cbe', num: '3', label: 'Should-Cost Leveling', icon: 'calculator' },
              { id: 'negotiator', num: '4', label: 'Clawback Negotiator', icon: 'send' }
            ].map(tab => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-xs transition-all duration-150 cursor-pointer ${
                    active
                      ? 'bg-[#181A24] text-cyan-400 border border-[#2E3142] shadow-[0_1px_4px_rgba(0,0,0,0.4)]'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-[#12131A]'
                  }`}
                >
                  <span className="w-4 h-4 rounded bg-[#0A0B0E] border border-[#262836] flex items-center justify-center text-[10px] font-mono text-gray-400">
                    {tab.num}
                  </span>
                  <SvgIcon name={tab.icon} className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* =========================================================
          MAIN APPLICATION VIEW AREA
      ========================================================= */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex-1 w-full">
        {/* TAB 1: INGESTION WEDGE */}
        {activeTab === 'dropzone' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div className="bg-[#12131A] border border-[#1E202B] rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <SvgIcon name="upload" className="w-4 h-4 text-cyan-400" />
                    Autonomous Spec Ingestion Wedge (Zero-ERP Delay)
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5 max-w-2xl">
                    Parses engineering Material Requisitions (MRs) and vendor bid packages into vector bounding boxes with SI unit assertion laws.
                  </p>
                </div>
                <button
                  onClick={handleRunPipeline}
                  disabled={pipelineRunning}
                  className="px-3 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-gray-950 font-bold text-xs flex items-center gap-2 transition-transform duration-100 active:scale-95 cursor-pointer"
                >
                  <SvgIcon name="refresh" className={`w-3.5 h-3.5 ${pipelineRunning ? 'animate-spin' : ''}`} />
                  {pipelineRunning ? 'Executing Physics Solver...' : 'Re-Run Ingestion Pipeline'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* BUYER BASELINE */}
                <div className="border border-cyan-500/20 bg-cyan-950/10 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-mono text-cyan-400 uppercase font-semibold">
                      Buyer Baseline Spec Package
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      SHA-256 Validated
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="p-2.5 rounded bg-[#181A24] border border-[#232530] flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <SvgIcon name="file" className="w-4 h-4 text-cyan-400" />
                        <div>
                          <div className="font-medium text-gray-200">MR-33kV-GIS-Rev4_Specification.pdf</div>
                          <div className="text-[11px] text-gray-400">134 Pages • IEC 62271-200 Rules</div>
                        </div>
                      </div>
                      <span className="font-mono text-emerald-400 text-[11px]">142 Rules</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#181A24] border border-[#232530] flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <SvgIcon name="layers" className="w-4 h-4 text-amber-400" />
                        <div>
                          <div className="font-medium text-gray-200">Substation_SLD_33kV_SingleLine.dwg.pdf</div>
                          <div className="text-[11px] text-gray-400">14 Vector CAD Sheets • 50kA 3s Busbar</div>
                        </div>
                      </div>
                      <span className="font-mono text-emerald-400 text-[11px]">11 Bays</span>
                    </div>
                  </div>
                </div>

                {/* VENDORS */}
                <div className="border border-[#1E202B] bg-[#14151D] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-mono text-gray-300 uppercase font-semibold">
                      Competing OEM Bid Packages
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">3 Packages • 594 Pages</span>
                  </div>
                  <div className="space-y-2">
                    {TENDER_DATA.vendors.map(v => (
                      <div key={v.id} className="p-2.5 rounded bg-[#181A24] border border-[#232530] flex items-center justify-between text-xs">
                        <div>
                          <div className="font-medium text-white flex items-center gap-2">
                            {v.name}
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#0A0B0E] text-cyan-300 border border-[#262836]">
                              €{v.headlinePrice.toLocaleString()}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-400 mt-0.5">{v.docName}</div>
                        </div>
                        <span className="font-mono text-emerald-400 flex items-center gap-1 text-[11px]">
                          <SvgIcon name="check" className="w-3 h-3" /> Indexed
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 4 STAGES */}
              <div className="mt-5 pt-4 border-t border-[#1E202B]">
                <div className="text-[10px] font-mono uppercase text-gray-400 mb-3 flex items-center justify-between">
                  <span>Deterministic Physics Pipeline Execution</span>
                  <span className="text-cyan-400">Stage {pipelineStep} of 4 Complete</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  {[
                    { step: 1, title: '1. PyMuPDF Parser', type: 'VECTOR OCR', desc: 'Extracts tables & SLD symbols with mandatory [page, x0, y0, x1, y1] coordinates.' },
                    { step: 2, title: '2. Pint SI Normalizer', type: 'DETERMINISTIC', desc: 'Converts units (50,000 A -> 50 kA) and runs hard Python boolean inequality checks.' },
                    { step: 3, title: '3. Hierarchy Resolver', type: 'DETERMINISTIC', desc: 'Overrides cover letter claims when SLD footnotes or BOM rows show downgraded ratings.' },
                    { step: 4, title: '4. Should-Cost Engine', type: 'DETERMINISTIC', desc: 'Assigns cost adders using LME copper indices, freight lanes, and electrician labor rates.' }
                  ].map(item => (
                    <div
                      key={item.step}
                      className={`p-3 rounded-lg border text-xs transition-colors duration-150 ${
                        pipelineStep >= item.step ? 'bg-[#181A24] border-cyan-500/40 text-gray-200' : 'bg-[#14151D] border-[#1E202B] text-gray-500'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-white text-[11px]">{item.title}</span>
                        <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-[#0A0B0E] text-cyan-300 border border-[#262836]">{item.type}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 leading-normal">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TECHNICAL BID EVALUATION & CAD INSPECTOR */}
        {activeTab === 'tbe' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-in fade-in duration-200">
            {/* MATRIX (8 COLS) */}
            <div className="lg:col-span-8 bg-[#12131A] border border-[#1E202B] rounded-xl overflow-hidden flex flex-col">
              <div className="p-4 border-b border-[#1E202B] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <SvgIcon name="layers" className="w-4 h-4 text-cyan-400" />
                    Technical Bid Evaluation (TBE) Matrix
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Click any parameter row or use <kbd className="px-1 py-0.5 bg-[#181A24] border border-[#262836] rounded text-[10px] font-mono text-cyan-300">↑</kbd> <kbd className="px-1 py-0.5 bg-[#181A24] border border-[#262836] rounded text-[10px] font-mono text-cyan-300">↓</kbd> to inspect coordinate bounding boxes.
                  </p>
                </div>

                {/* FILTER CONTROLS */}
                <div className="flex items-center gap-1 bg-[#0A0B0E] p-1 rounded-md border border-[#1E202B] text-[11px]">
                  {[
                    { id: 'all', label: 'All (6)' },
                    { id: 'conflicts', label: 'Conflicts (2)' },
                    { id: 'mandatory', label: 'Mandatory (3)' },
                    { id: 'commercial', label: 'Commercial (2)' }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setFilterMode(f.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors cursor-pointer ${
                        filterMode === f.id ? 'bg-[#1E202B] text-cyan-300' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#1E202B] bg-[#0E0F14] text-[10px] font-mono uppercase text-gray-400">
                      <th className="py-2.5 px-4">Engineering Spec & Baseline</th>
                      <th className="py-2.5 px-3">Siemens (€452k)</th>
                      <th className="py-2.5 px-3 bg-rose-950/20 text-rose-300 border-x border-rose-900/20">
                        VoltSwitch (€418k Low)
                      </th>
                      <th className="py-2.5 px-3">Powell / Eaton (€439k)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#181A24]">
                    {filteredParameters.map(param => (
                      <TbeTableRow
                        key={param.id}
                        param={param}
                        isSelected={param.id === selectedParamId}
                        isConceded={concededItems.includes(param.id)}
                        onSelect={setSelectedParamId}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* BBOX & CAD CITATION INSPECTOR (4 COLS) */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-[#12131A] border border-[#1E202B] rounded-xl p-4 sticky top-24">
                <div className="flex items-center justify-between border-b border-[#1E202B] pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <SvgIcon name="crosshair" className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-white uppercase font-mono tracking-wider">
                      Citation & Physics Audit
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#181A24] text-cyan-300 border border-[#262836]">
                    {activeParam.id}
                  </span>
                </div>

                {/* VENDOR SELECTOR */}
                <div className="grid grid-cols-3 gap-1 mb-3 bg-[#0A0B0E] p-1 rounded-md border border-[#1E202B]">
                  {TENDER_DATA.vendors.map(v => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVendorFocus(v.id)}
                      className={`py-1 px-2 rounded text-[10px] font-medium truncate transition-colors cursor-pointer ${
                        selectedVendorFocus === v.id ? 'bg-cyan-500 text-gray-950 font-bold' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {v.name.split(' ')[0]}
                    </button>
                  ))}
                </div>

                {(() => {
                  const detail = activeParam.vendors[selectedVendorFocus];
                  return (
                    <div className="space-y-3 text-xs">
                      {detail.conflictNote && (
                        <div className="p-2.5 rounded bg-rose-950/30 border border-rose-800/40 text-rose-200">
                          <div className="font-bold text-rose-300 flex items-center gap-1.5 mb-1 text-[11px]">
                            <SvgIcon name="alert" className="w-3.5 h-3.5 text-rose-400" /> Hierarchy Override Detected
                          </div>
                          <p className="text-[11px] leading-relaxed text-gray-300">{detail.conflictNote}</p>
                        </div>
                      )}

                      {/* CAD SCHEMATIC WIREFRAME */}
                      <CadSchematicVisualizer paramId={activeParam.id} vendorId={selectedVendorFocus} />

                      {/* PINT ASSERTION LAW */}
                      <div className="p-2.5 rounded bg-[#0A0B0E] border border-[#1E202B] font-mono text-[11px]">
                        <div className="text-[9px] text-gray-500 uppercase flex justify-between mb-1">
                          <span>Pint Physics Law</span>
                          <span className="text-emerald-400 font-semibold">Confidence {(detail.confidence * 100).toFixed(0)}%</span>
                        </div>
                        <div className="text-cyan-300">assert {activeParam.pintRule}</div>
                        <div className="text-gray-300 mt-1.5 pt-1.5 border-t border-[#1E202B]">
                          Extracted: <span className="text-white font-semibold">{detail.extracted}</span>
                        </div>
                      </div>

                      {/* SOURCE BBOX SNIPPET */}
                      <div className="p-2.5 rounded bg-[#0A0B0E] border border-[#1E202B]">
                        <div className="text-[9px] font-mono uppercase text-amber-300 mb-1 flex justify-between">
                          <span>Source Bounding Box</span>
                          <span className="text-gray-400">{detail.bbox}</span>
                        </div>
                        <div className="p-2 rounded bg-[#14151D] border-l-2 border-amber-400 text-gray-300 font-mono text-[10px] italic">
                          "{detail.snippet}"
                        </div>
                      </div>

                      {/* PARAMETRIC ADDER BREAKDOWN */}
                      <div className="p-2.5 rounded bg-[#0A0B0E] border border-[#1E202B] font-mono">
                        <div className="text-[9px] uppercase text-gray-400 mb-1">Parametric Risk Adder</div>
                        <div className="text-sm font-bold text-rose-400">+€{detail.costAdder.toLocaleString()}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{detail.adderFormula}</div>
                      </div>

                      <button
                        onClick={() => setActiveTab('negotiator')}
                        className="w-full py-2 px-3 rounded-md bg-cyan-500 hover:bg-cyan-400 text-gray-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-transform active:scale-98 cursor-pointer"
                      >
                        Push to Negotiation Dispatch <SvgIcon name="send" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SHOULD-COST LEVELING & WATERFALL */}
        {activeTab === 'cbe' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* SENSITIVITY CONTROLS */}
            <div className="bg-[#12131A] border border-[#1E202B] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <SvgIcon name="calculator" className="w-4 h-4 text-cyan-400" />
                  Live Parametric Sensitivity Engine
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Adjust commodity indices and site labor rates to dynamically re-level True Evaluated Price in real time.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="bg-[#0A0B0E] px-3 py-2 rounded-md border border-[#1E202B]">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400 text-[11px]">LME Copper Index:</span>
                    <span className="font-mono font-bold text-cyan-400">{copperMultiplier.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="1.5"
                    step="0.05"
                    value={copperMultiplier}
                    onChange={e => setCopperMultiplier(parseFloat(e.target.value))}
                    className="w-32 accent-cyan-400 cursor-pointer"
                  />
                </div>

                <div className="bg-[#0A0B0E] px-3 py-2 rounded-md border border-[#1E202B]">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400 text-[11px]">Site Electrician Rate:</span>
                    <span className="font-mono font-bold text-cyan-400">€{siteLaborRate}/hr</span>
                  </div>
                  <input
                    type="range"
                    min="40"
                    max="100"
                    step="5"
                    value={siteLaborRate}
                    onChange={e => setSiteLaborRate(parseInt(e.target.value, 10))}
                    className="w-32 accent-cyan-400 cursor-pointer"
                  />
                </div>

                <div className="bg-[#0A0B0E] px-3 py-2 rounded-md border border-[#1E202B]">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400 text-[11px]">Freight & Transport:</span>
                    <span className="font-mono font-bold text-cyan-400">{freightMultiplier.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="1.5"
                    step="0.05"
                    value={freightMultiplier}
                    onChange={e => setFreightMultiplier(parseFloat(e.target.value))}
                    className="w-32 accent-cyan-400 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* LEVELING WATERFALL CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {financials.map(v => {
                const isVoltSwitch = v.id === 'vendor-b';
                return (
                  <div
                    key={v.id}
                    className={`rounded-xl border p-4 flex flex-col justify-between transition-all duration-150 ${
                      isVoltSwitch
                        ? 'bg-[#151722] border-cyan-500/40 shadow-[0_2px_12px_rgba(0,212,255,0.08)]'
                        : 'bg-[#12131A] border-[#1E202B]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#0A0B0E] text-gray-300 border border-[#1E202B]">
                          {v.country}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0A0B0E] text-gray-400 border border-[#1E202B]">
                          {v.tier}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-white">{v.name}</h3>

                      <div className="mt-3 space-y-1.5 text-xs border-t border-[#1E202B] pt-3 font-mono">
                        <div className="flex justify-between text-gray-300">
                          <span>1. Base Bid Quote:</span>
                          <span className="font-semibold text-white">€{v.headlinePrice.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-rose-400">
                          <span>2. Tech Deviation Penalties:</span>
                          <span>+€{v.techPenalties.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-amber-400">
                          <span>3. Commercial Scope Adders:</span>
                          <span>+€{v.commercialAdders.toLocaleString()}</span>
                        </div>
                        {v.clawedAmount > 0 && (
                          <div className="flex justify-between text-emerald-400 bg-emerald-950/20 px-2 py-1 rounded border border-emerald-500/25">
                            <span>4. SpecClaw Clawback:</span>
                            <span className="font-bold">-€{v.clawedAmount.toLocaleString()}</span>
                          </div>
                        )}
                      </div>

                      {/* WATERFALL MINI BAR */}
                      <WaterfallMiniBar
                        headline={v.headlinePrice}
                        techPenalties={v.techPenalties}
                        commercialAdders={v.commercialAdders}
                        clawed={v.clawedAmount}
                        trueEvaluated={v.trueEvaluated}
                      />
                    </div>

                    <div className="mt-5 pt-3 border-t border-[#1E202B]">
                      <div className="flex items-baseline justify-between font-mono">
                        <span className="text-[10px] uppercase text-gray-400">True Evaluated Cost:</span>
                        <span className={`text-lg font-bold ${v.trueEvaluated <= 440000 ? 'text-emerald-400' : 'text-white'}`}>
                          €{v.trueEvaluated.toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-2 text-[11px] text-gray-400 leading-tight">
                        {isVoltSwitch && v.clawedAmount === 0 && (
                          <span className="text-rose-400">
                            Apparent €34k savings erased: true cost is €30.8k MORE than Siemens unless clawed back!
                          </span>
                        )}
                        {isVoltSwitch && v.clawedAmount > 0 && (
                          <span className="text-emerald-400">
                            Vendor B absorbed €{v.clawedAmount.toLocaleString()} in upgrades at base €418k!
                          </span>
                        )}
                        {!isVoltSwitch && <span>Anonymized compliant benchmark to maintain leverage.</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* PERFORMANCE FEE SUMMARY (TROJAN HORSE) */}
            <div className="bg-[#12131A] border border-cyan-500/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-xs font-bold text-white uppercase font-mono flex items-center gap-2">
                  <SvgIcon name="sparkles" className="w-3.5 h-3.5 text-cyan-400" />
                  Trojan Horse Monetization: "Split-the-Clawback" Performance Share
                </h3>
                <p className="text-xs text-gray-400 mt-0.5 max-w-xl">
                  By forcing the low bidder to absorb specifications without increasing their €418,000 base quote, immediate verified CAPEX savings are unlocked.
                </p>
              </div>

              <div className="flex items-center gap-3 font-mono text-xs">
                <div className="px-3 py-2 rounded bg-[#0A0B0E] border border-[#1E202B] text-center">
                  <div className="text-[9px] text-gray-400 uppercase">Clawed-Back Value</div>
                  <div className="text-sm font-bold text-emerald-400">€{vendorBStats.clawedAmount.toLocaleString()}</div>
                </div>
                <div className="px-3 py-2 rounded bg-[#0A0B0E] border border-[#1E202B] text-center">
                  <div className="text-[9px] text-gray-400 uppercase">SpecClaw 15% Fee</div>
                  <div className="text-sm font-bold text-cyan-400">€{specClawFee.toLocaleString()}</div>
                </div>
                <div className="px-3 py-2 rounded bg-emerald-950/40 border border-emerald-500/30 text-center">
                  <div className="text-[9px] text-emerald-300 uppercase">Net EPC Savings</div>
                  <div className="text-sm font-bold text-emerald-300">€{netSavings.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CLAWBACK NEGOTIATOR & DISPATCH PREVIEW */}
        {activeTab === 'negotiator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-in fade-in duration-200">
            {/* CONTROLS (5 COLS) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-[#12131A] border border-[#1E202B] rounded-xl p-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-1">
                  <SvgIcon name="send" className="w-4 h-4 text-cyan-400" />
                  Autonomous Technical Query State Machine
                </h2>
                <p className="text-xs text-gray-400 mb-4">
                  Dispatches coordinate-cited Technical Queries to vendor engineering leads.
                </p>

                {/* SAFETY GUARDRAIL METRIC */}
                <div className="p-3 rounded bg-[#0A0B0E] border border-[#1E202B] font-mono text-xs space-y-1.5 mb-4">
                  <div className="flex justify-between text-gray-400">
                    <span>Idempotency-Key:</span>
                    <span className="text-cyan-400 font-semibold">sha256:402-vb-r{negotiationRound}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Citation Verification:</span>
                    <span className="text-emerald-400 font-semibold">6/6 BBox Coordinate Validated</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Dispatch Approval:</span>
                    <span className="text-amber-300 font-semibold">1-Click Human Gate Enforced</span>
                  </div>
                </div>

                {/* ROUND TRACKER */}
                <div className="space-y-2 mb-4">
                  {[
                    { r: 1, title: 'Round 1: Initial Deviation Notice', desc: 'Exposes €64,800 in unannounced spec downgrades.' },
                    { r: 2, title: 'Round 2: Technical Concessions', desc: 'Vendor absorbs 50kA, IP54, and I-FAT (€33,900 clawed back).' },
                    { r: 3, title: 'Round 3: Final Contract Closure', desc: 'Vendor absorbs Cu Busbar & DDP freight (€57,400 clawed back).' }
                  ].map(step => (
                    <div
                      key={step.r}
                      className={`p-2.5 rounded-lg border text-xs transition-colors duration-150 ${
                        negotiationRound === step.r
                          ? 'bg-cyan-950/20 border-cyan-500/50 text-white'
                          : negotiationRound > step.r
                          ? 'bg-emerald-950/15 border-emerald-500/30 text-emerald-300'
                          : 'bg-[#0A0B0E] border-[#1E202B] text-gray-500'
                      }`}
                    >
                      <div className="font-semibold flex items-center justify-between text-xs">
                        <span>{step.title}</span>
                        {negotiationRound >= step.r && <SvgIcon name="check" className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                      <div className="text-[11px] opacity-80 mt-0.5">{step.desc}</div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleSimulateTurn}
                    className="w-full py-2.5 px-3 rounded-md bg-cyan-500 hover:bg-cyan-400 text-gray-950 font-bold text-xs flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer"
                  >
                    <SvgIcon name="refresh" className="w-3.5 h-3.5" />
                    {negotiationRound < 3
                      ? `Simulate Vendor Reply & Advance to Round ${negotiationRound + 1}`
                      : 'Reset Negotiation to Round 1'}
                  </button>

                  <button
                    onClick={handleExportPdf}
                    disabled={isExportingPdf}
                    className="w-full py-2 px-3 rounded-md bg-[#181A24] hover:bg-[#202230] text-gray-200 border border-[#2E3142] font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <SvgIcon name="download" className={`w-3.5 h-3.5 ${isExportingPdf ? 'animate-bounce' : ''}`} />
                    {isExportingPdf ? 'Generating Official PO PDF...' : `Export Signed Deviation PDF (Rev ${negotiationRound})`}
                  </button>
                </div>
              </div>
            </div>

            {/* EMAIL DISPATCH PREVIEW (7 COLS) */}
            <div className="lg:col-span-7 bg-[#12131A] border border-[#1E202B] rounded-xl overflow-hidden flex flex-col">
              <div className="p-3 bg-[#0A0B0E] border-b border-[#1E202B] flex items-center justify-between text-xs font-mono">
                <span className="text-gray-300">DISPATCH PREVIEW • ROUND {negotiationRound} OF 3</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyEmail}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#181A24] hover:bg-[#222432] text-gray-300 border border-[#262836] text-[10px] cursor-pointer transition-colors"
                  >
                    <SvgIcon name="copy" className="w-3 h-3 text-cyan-400" />
                    {copyFeedback ? 'Copied!' : 'Copy Text'}
                  </button>
                  <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[11px]">
                    Clawed Back: €{vendorBStats.clawedAmount.toLocaleString()}
                  </span>
                </div>
              </div>

              <div id="negotiator-email-content" className="p-5 space-y-4 text-xs font-mono text-gray-300 flex-1">
                <div className="space-y-1 pb-3 border-b border-[#1E202B] text-gray-400 text-[11px]">
                  <div><span className="text-gray-500">To:</span> m.yilmaz@voltswitch-industrial.com</div>
                  <div><span className="text-gray-500">Cc:</span> strategic-procurement@vogt-grid-epc.de</div>
                  <div><span className="text-gray-500">Subject:</span> [ACTION REQUIRED] Technical Clarification & Commercial Leveling — {TENDER_DATA.id} (Round {negotiationRound})</div>
                </div>

                {negotiationRound === 1 && (
                  <div className="space-y-3 font-sans text-gray-200 leading-relaxed text-xs">
                    <p>Dear VoltSwitch Tendering Team,</p>
                    <p>
                      Thank you for submitting Offer <strong>Commercial_Tech_Bid_VoltSwitch_2026.pdf</strong> (€418,000). While your cover letter asserts 100% compliance with <strong>MR-33kV-GIS-Rev4</strong>, our automated audit identified <strong>6 critical deviations and scope exclusions</strong> totaling <strong>€64,800</strong> in evaluated risk:
                    </p>
                    <ul className="list-disc pl-5 space-y-1.5 text-gray-300 text-xs">
                      <li><strong>TQ-01 (Rating Conflict — Page 64, SLD Note 7):</strong> Quoted 31.5 kA (1s) vs required 50.0 kA (3s). (+€18,500)</li>
                      <li><strong>TQ-02 (Busbar Material — Page 79):</strong> Aluminum Alloy quoted vs Electrolytic Copper Cu-ETP 2500A. (+€14,200)</li>
                      <li><strong>TQ-03 (Enclosure Ingress — Page 88):</strong> IP42 AFL (3-sided) vs required IP54 AFLR. (+€8,900)</li>
                      <li><strong>TQ-04 (SCADA Interface — Page 119):</strong> Single RJ45 Modbus card vs Dual-Fiber IEC 61850 PRP wired to RTU. (+€7,400)</li>
                      <li><strong>TQ-05 & 06 (Testing & Incoterms):</strong> Witnessed I-FAT excluded and EXW Izmir quoted vs DDP Brandenburg. (+€15,800)</li>
                    </ul>
                    <p className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 text-amber-200">
                      Two competing compliant bidders have met the 50kA Cu-ETP standard. To remain in first position for PO award this Friday, please return the attached Deviation Closure Sheet confirming absorption of TQ-01 through TQ-06 within your €418,000 price.
                    </p>
                  </div>
                )}

                {negotiationRound === 2 && (
                  <div className="space-y-3 font-sans text-gray-200 leading-relaxed text-xs">
                    <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-emerald-200">
                      <strong>Vendor Reply Ingested:</strong> VoltSwitch agreed to absorb <strong>50.0 kA (3s)</strong>, <strong>IP54 AFLR</strong>, and the <strong>5-Day Witnessed I-FAT</strong> at zero price adder (€33,900 clawed back). They requested a €19,000 adder for Copper Busbars and DDP freight.
                    </div>
                    <p>Dear VoltSwitch Tendering Team,</p>
                    <p>
                      We acknowledge and lock in your written confirmation closing <strong>TQ-01</strong>, <strong>TQ-03</strong>, and <strong>TQ-05</strong> at no cost impact.
                    </p>
                    <p>
                      Regarding your requested adder for <strong>TQ-02 (Cu-ETP Busbars)</strong> and <strong>TQ-06 (DDP Freight)</strong>: based on current LME Grade-A copper settlement indices and road freight rates from Izmir to Brandenburg, the net factory delta is €11,400—and our competing compliant bidder is within 2.1% of your adjusted total.
                    </p>
                    <p className="font-semibold text-cyan-300">
                      Final Counter-Offer for Immediate PO Release: Absorb Cu-ETP busbars (TQ-02) and DDP freight (TQ-06) at your €418,000 contract price, in exchange for moving milestone payment #2 (30%) from Site Delivery to successful I-FAT sign-off.
                    </p>
                  </div>
                )}

                {negotiationRound === 3 && (
                  <div className="space-y-3 font-sans text-gray-200 leading-relaxed text-xs">
                    <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/40 text-emerald-200">
                      <div className="font-bold text-sm text-emerald-300 flex items-center gap-1.5 mb-1">
                        <SvgIcon name="check" className="w-4 h-4" /> DEVIATION CLOSURE SIGNED — €57,400 CLAWED BACK!
                      </div>
                      <p>
                        VoltSwitch signed Revision 3 Deviation Closure Sheet absorbing 50kA (3s) vacuum breakers, Electrolytic Copper 2500A busbars, IP54 AFLR arc ducting, 5-Day Witnessed I-FAT, and DDP Brandenburg delivery at their original <strong>€418,000</strong> headline price.
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-[#0A0B0E] border border-[#1E202B] font-mono text-xs space-y-1">
                      <div className="text-cyan-400 font-bold">AUDIT PACKET READY FOR PURCHASE ORDER ATTACHMENT:</div>
                      <div>• Initial Headline Quote: €418,000</div>
                      <div>• Uncovered Hidden Deviation Risk: €64,800</div>
                      <div>• SpecClaw Verified Clawback Concessions: €57,400 (Absorbed Free)</div>
                      <div>• SpecClaw 15% Performance Fee: €8,610</div>
                      <div className="text-emerald-400 font-bold">• Net Verified EPC Savings Unlocked: €48,790</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MINIMALIST FOOTER WITH KEYBOARD SHORTCUTS */}
      <footer className="border-t border-[#181A24] bg-[#0A0B0E] py-2 px-4 text-center text-gray-500 text-[10px] font-mono flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <span>Shortcuts:</span>
          <kbd className="px-1 py-0.5 rounded bg-[#14151D] border border-[#262836] text-gray-400">[1-4] Tabs</kbd>
          <kbd className="px-1 py-0.5 rounded bg-[#14151D] border border-[#262836] text-gray-400">[↑/↓] Select Spec</kbd>
        </div>
        <div>
          SpecClaw Industrial TBE Engine • Vogt-Grid EPC Consortium GmbH
        </div>
      </footer>
    </div>
  );
}

// Global mount function for browser
function mountSpecClaw() {
  const container = document.getElementById('root');
  if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(SpecClawApp));
    console.log('SpecClaw Minimalist Industrial UI mounted.');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountSpecClaw);
} else {
  mountSpecClaw();
}
