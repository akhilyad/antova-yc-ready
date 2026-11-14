"""Content of the synthetic TENDER-2026-402 pack, written as data.

Every evidence sentence the answer key relies on is defined once here and
placed on its pinned page. Filler text is deliberately free of anything the
parameter parsers could read as a value (no units, codes, months or prices).
All names are fictional.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field

TENDER_ID = "TENDER-2026-402"
TITLE = "350 MWp Solar + BESS Substation — 33kV GIS Switchgear & RTU Protection Package"
CLIENT = "Vogt-Grid EPC Consortium GmbH (Berlin / Madrid)"
MR_FILE = "MR-33kV-GIS-Rev4.pdf"
FOOTER = "SYNTHETIC SAMPLE — not a real offer"


@dataclass(frozen=True)
class Ev:
    """One evidence sentence placed on a page."""

    key: str
    page: int
    text: str
    param_id: str | None = None


@dataclass(frozen=True)
class Vendor:
    id: str
    name: str
    country: str
    product: str
    file: str
    headline: str
    compliance_heading: str


@dataclass
class Page:
    blocks: list[tuple[str, str]] = field(default_factory=list)
    drawing: str | None = None  # drawing title block text, for SLD pages
    scanned: bool = False  # drawn as a picture of a page: no extractable text at all


@dataclass
class DocumentSpec:
    filename: str
    title: str
    pages: list[Page]
    running_header: str | None = None  # printed at the top of every page


VENDORS = [
    Vendor("vendor-a", "Nordwerk Schaltanlagen GmbH", "Germany", "NWS-36 GIS",
           "Bid_vendor-a_Nordwerk.pdf", "452000.00", "2. COMPLIANCE STATEMENT"),
    Vendor("vendor-b", "VoltSwitch Industrial", "Turkey / EU", "VS-GIS 36",
           "Bid_vendor-b_VoltSwitch.pdf", "418000.00", "2. COMPLIANCE STATEMENT"),
    Vendor("vendor-c", "Deltaport Skid Consortium B.V.", "Netherlands", "DPS-36",
           "Bid_vendor-c_Deltaport.pdf", "439000.00", "2. SCHEDULE OF DEVIATIONS"),
]
VENDORS_BY_ID = {v.id: v for v in VENDORS}

# --- Evidence -----------------------------------------------------------------

MR_EVIDENCE = [
    Ev("mr.bays", 3, "The switchgear lineup comprises 11 bays (2 incomers, 1 bus coupler, 8 feeders) of gas-insulated switchgear."),
    Ev("mr.p07", 5, "Rated voltage Ur shall be not less than 36 kV.", "PARAM-07"),
    Ev("mr.p01", 5, "Rated short-time withstand current Ik shall be 50 kA RMS for a duration of 3 s.", "PARAM-01"),
    Ev("mr.p02", 6, "Main busbars shall be electrolytic copper Cu-ETP rated for 2500 A continuous current.", "PARAM-02"),
    Ev("mr.p03", 6, "Enclosure protection shall be IP54 with internal arc classification IAC AFLR.", "PARAM-03"),
    Ev("mr.p04", 7, "Protection IEDs shall communicate via IEC 61850 Edition 2 with PRP redundancy, with pre-wired RTU marshalling in a central marshalling cabinet.", "PARAM-04"),
    Ev("mr.p08", 7, "Equipment shall be rated for a maximum ambient air temperature of +40 °C without derating.", "PARAM-08"),
    Ev("mr.p05", 13, "A 5-day witnessed integrated factory acceptance test (I-FAT) with primary injection shall be included in the contract price.", "PARAM-05"),
    Ev("mr.p06a", 14, "Delivery shall be DDP project site Brandenburg (Incoterms 2020).", "PARAM-06"),
    Ev("mr.p06b", 14, "The defect liability period shall be 36 months from commissioning.", "PARAM-06"),
]

VENDOR_EVIDENCE = {
    "vendor-a": [
        Ev("a.cover", 2, "Our offer is in full compliance with MR-33kV-GIS-Rev4 except minor commercial notes."),
        Ev("a.p01", 6, "Rated short-time withstand current (main busbar and breaker): 50 kA / 3 s.", "PARAM-01"),
        Ev("a.p02", 6, "Main busbars: silver-plated high-conductivity electrolytic copper Cu-ETP, 2.5 kA continuous.", "PARAM-02"),
        Ev("a.p07", 6, "Rated voltage Ur: 36 kV.", "PARAM-07"),
        Ev("a.p03", 7, "Enclosure protection IP54 with rear gas exhaust ducting, internal arc classification IAC AFLR 50 kA 1 s.", "PARAM-03"),
        Ev("a.p08", 7, "Rated for ambient temperatures from -25 °C to +40 °C without derating.", "PARAM-08"),
        Ev("a.p04", 8, "Protection IEDs NW-Prot 5 with IEC 61850 Ed.2 PRP dual-port fibre, pre-wired to the central RTU marshalling cabinet.", "PARAM-04"),
        Ev("a.p05", 18, "The price includes a 5-day client-witnessed I-FAT with primary injection.", "PARAM-05"),
        Ev("a.p06", 21, "Delivery DDP project site Brandenburg (Incoterms 2020) with a 36-month defect liability period.", "PARAM-06"),
        Ev("a.price", 22, "Total lump-sum price for the complete scope: €452,000"),
    ],
    "vendor-b": [
        Ev("b.cover", 2, "We confirm our offer is 100% compliant with Material Requisition MR-33kV-GIS-Rev4."),
        Ev("b.p01sec", 2, "The switchgear is fully compliant with the Material Requisition, including the 50 kA / 3 s short-time withstand rating.", "PARAM-01"),
        Ev("b.p04sec", 3, "IEC 61850 Ed.2 with PRP redundancy - Complied", "PARAM-04"),
        Ev("b.p02", 6, "Busbar system manufactured from tin-plated E-AlMgSi0.5 aluminium alloy profiles rated 2500 A continuous.", "PARAM-02"),
        Ev("b.p07", 6, "Rated voltage Ur: 36,000 V.", "PARAM-07"),
        Ev("b.p03", 7, "Standard indoor enclosure IP42 with ventilation louvres; internal arc classification IAC AFL (front and lateral only).", "PARAM-03"),
        Ev("b.p08", 7, "Maximum ambient temperature 40 °C without derating.", "PARAM-08"),
        Ev("b.p01", 11, "NOTE 7: Standard switchgear bay rated 31.5kA 1s. 50kA high-duty upgrade excluded from base price.", "PARAM-01"),
        Ev("b.p04", 15, "BOM Pos 44: Standard communication port RJ45 Modbus TCP; SCADA marshalling terminals supplied loose for EPC field termination.", "PARAM-04"),
        Ev("b.p05", 18, "Standard routine test certificates provided. Witnessed FAT charged extra at €1,300/day plus test bay setup.", "PARAM-05"),
        Ev("b.p06", 21, "Prices are quoted Ex-Works (EXW) Izmir factory loading dock; standard warranty 18 months from dispatch.", "PARAM-06"),
        Ev("b.price", 22, "Total lump-sum price for the complete scope: €418,000"),
    ],
    "vendor-c": [
        Ev("c.cover", 2, "Our offer is compliant per the attached Schedule of Deviations."),
        Ev("c.p01sec", 3, "Deviation 1: Short-time withstand current 50 kA for 1.0 s instead of 3 s.", "PARAM-01"),
        Ev("c.p01", 6, "Short-time withstand capability tested for 50 kA RMS at 1.0 second thermal duration.", "PARAM-01"),
        Ev("c.p02", 6, "HDHC electrolytic copper busbar system rated 2500 A continuous throughout all MV compartments.", "PARAM-02"),
        Ev("c.p07", 6, "Rated voltage Ur: 36 kV.", "PARAM-07"),
        Ev("c.p03", 7, "Full IP54 dust and splash sealing with 4-sided IAC AFLR internal arc containment.", "PARAM-03"),
        Ev("c.p08", 7, "Maximum ambient temperature 104 °F without derating.", "PARAM-08"),
        Ev("c.p04", 8, "IEC 61850 Ed.2 relays DSC-R200 with PRP fibre ports; RTU marshalling excluded, customer SCADA wiring directly to individual bay LV compartments.", "PARAM-04"),
        Ev("c.p05", 18, "Includes 3 days witnessed inspection; additional days billed per tariff.", "PARAM-05"),
        Ev("c.p06", 21, "Delivered At Place (DAP) project site; warranty 24 months from commissioning.", "PARAM-06"),
        Ev("c.price", 22, "Total lump-sum price for the complete scope: €439,000"),
    ],
}

_EV_BY_KEY = {e.key: e for e in MR_EVIDENCE}
for _evs in VENDOR_EVIDENCE.values():
    _EV_BY_KEY.update({e.key: e for e in _evs})

# --- Answer key (literal values) ----------------------------------------------

REQUIREMENTS = {
    "PARAM-01": (["mr.p01"], {"ik": "50 kA", "ik_duration": "3 s"}),
    "PARAM-02": (["mr.p02"], {"material": "Cu-ETP", "rated_current": "2500 A"}),
    "PARAM-03": (["mr.p03"], {"ip": "IP54", "iac_class": "AFLR"}),
    "PARAM-04": (["mr.p04"], {"protocol": "IEC 61850 Ed. 2 with PRP", "marshalling": "pre-wired"}),
    "PARAM-05": (["mr.p05"], {"witnessed_fat_days_included": "5"}),
    "PARAM-06": (["mr.p06a", "mr.p06b"], {"incoterm": "DDP", "warranty_months": "36"}),
    "PARAM-07": (["mr.p07"], {"rated_voltage": "36 kV"}),
    "PARAM-08": (["mr.p08"], {"max_ambient": "40 °C"}),
}

# (status, primary evidence key, governing values, secondary page, adder)
CELLS = {
    "vendor-a": {
        "PARAM-01": ("COMPLIANT", "a.p01", {"ik": "50 kA", "ik_duration": "3 s"}, None, "0.00"),
        "PARAM-02": ("COMPLIANT", "a.p02", {"material": "Cu-ETP", "rated_current": "2.5 kA"}, None, "0.00"),
        "PARAM-03": ("COMPLIANT", "a.p03", {"ip": "IP54", "iac_class": "AFLR"}, None, "0.00"),
        "PARAM-04": ("COMPLIANT", "a.p04", {"protocol": "IEC 61850 Ed. 2 with PRP", "marshalling": "pre-wired"}, None, "0.00"),
        "PARAM-05": ("COMPLIANT", "a.p05", {"witnessed_fat_days_included": "5"}, None, "0.00"),
        "PARAM-06": ("COMPLIANT", "a.p06", {"incoterm": "DDP", "warranty_months": "36"}, None, "0.00"),
        "PARAM-07": ("COMPLIANT", "a.p07", {"rated_voltage": "36 kV"}, None, "0.00"),
        "PARAM-08": ("COMPLIANT", "a.p08", {"max_ambient": "40 °C"}, None, "0.00"),
    },
    "vendor-b": {
        "PARAM-01": ("CONFLICT_DOWNGRADE", "b.p01", {"ik": "31.5 kA", "ik_duration": "1 s"}, 2, "18500.00"),
        "PARAM-02": ("DEVIATION_DOWNGRADE", "b.p02", {"material": "Al", "rated_current": "2500 A"}, None, "14200.00"),
        "PARAM-03": ("DEVIATION_DOWNGRADE", "b.p03", {"ip": "IP42", "iac_class": "AFL"}, None, "8900.00"),
        "PARAM-04": ("CONFLICT_DOWNGRADE", "b.p04", {"protocol": "not IEC 61850", "marshalling": "not pre-wired"}, 3, "7400.00"),
        "PARAM-05": ("OMITTED", "b.p05", {"witnessed_fat_days_included": "0"}, None, "6500.00"),
        # EXW to DDP is priced (6150). The warranty shortfall is not: the bid measures 18 months from
        # dispatch, the MR 36 from commissioning and states no lag between them (rate table v2, strict).
        "PARAM-06": ("DEVIATION_DOWNGRADE", "b.p06", {"incoterm": "EXW", "warranty_months": "18"}, None, "6150.00"),
        "PARAM-07": ("COMPLIANT", "b.p07", {"rated_voltage": "36000 V"}, None, "0.00"),
        "PARAM-08": ("COMPLIANT", "b.p08", {"max_ambient": "40 °C"}, None, "0.00"),
    },
    "vendor-c": {
        "PARAM-01": ("DEVIATION_DOWNGRADE", "c.p01", {"ik": "50 kA", "ik_duration": "1 s"}, None, "6200.00"),
        "PARAM-02": ("COMPLIANT", "c.p02", {"material": "Cu-ETP", "rated_current": "2500 A"}, None, "0.00"),
        "PARAM-03": ("COMPLIANT", "c.p03", {"ip": "IP54", "iac_class": "AFLR"}, None, "0.00"),
        "PARAM-04": ("DEVIATION_DOWNGRADE", "c.p04", {"protocol": "IEC 61850 Ed. 2 with PRP", "marshalling": "not pre-wired"}, None, "4100.00"),
        "PARAM-05": ("DEVIATION_DOWNGRADE", "c.p05", {"witnessed_fat_days_included": "3"}, None, "2600.00"),
        "PARAM-06": ("DEVIATION_DOWNGRADE", "c.p06", {"incoterm": "DAP", "warranty_months": "24"}, None, "2100.00"),
        "PARAM-07": ("COMPLIANT", "c.p07", {"rated_voltage": "36 kV"}, None, "0.00"),
        "PARAM-08": ("COMPLIANT", "c.p08", {"max_ambient": "104 °F"}, None, "0.00"),
    },
}

VENDOR_TOTALS = {
    "vendor-a": ("0.00", "452000.00"),
    "vendor-b": ("61650.00", "479650.00"),
    "vendor-c": ("15000.00", "454000.00"),
}
# Amendment A2: the negotiating vendor is the lowest true evaluated price, Nordwerk (452,000),
# not the lowest headline, VoltSwitch (418,000 headline, 482,800 evaluated). Nordwerk has no
# deviation to close. The clawback figures are what closing VoltSwitch's deviations would
# recover, so they name that vendor.
NEGOTIATING_VENDOR = "vendor-a"
CLAWBACK = {"vendor_id": "vendor-b", "round_2": "33900.00", "round_3": "54250.00"}
BAY_COUNT = 11
# Optional per-cell expectations beyond the tuple above: pricing_status and flag fragments.
CELL_EXTRAS = {
    ("vendor-b", "PARAM-06"): {"pricing_status": "UNPRICED", "flags_include": ["from dispatch"]},
}
# Optional per-vendor expectation: a total with an unpriced item is a lower bound.
VENDOR_PRICE_STATUS = {"vendor-b": "UNPRICED_ITEMS"}
ENGINEERING_ESTIMATES = {"busbar_cu_kg": 1480, "heavy_haul_loads": 2}

# --- Filler -------------------------------------------------------------------

FILLER = {
    "general": [
        "This section describes the general obligations of the supplier for the scope defined in this document.",
        "All correspondence shall reference the tender number and the document revision.",
        "The supplier shall nominate a project manager as the single point of contact for the contract.",
        "Clarifications raised during the tender period are answered in writing and form part of the tender documents.",
        "Information provided by the purchaser is for tender purposes and remains confidential.",
        "The supplier shall comply with the purchaser's site rules and permit-to-work procedures.",
    ],
    "codes": [
        "The equipment shall comply with the latest editions of the following standards.",
        "IEC 62271-1: Common specifications for alternating current switchgear and controlgear.",
        "IEC 62271-200: Metal-enclosed switchgear and controlgear.",
        "IEC 60529: Degrees of protection provided by enclosures.",
        "IEC 60255: Measuring relays and protection equipment.",
    ],
    "technical": [
        "The switchgear shall be suitable for indoor installation in a prefabricated substation building.",
        "All bays shall be of the same type and arrangement to allow interchangeability.",
        "Interlocks shall prevent unsafe operation of switching devices.",
        "Operating handles and indicators shall be accessible from the front of each panel.",
    ],
    "documentation": [
        "Drawings and documents shall be submitted in electronic format for review and approval.",
        "Each document shall carry a title block with document number, revision and approval status.",
        "As-built documentation shall be delivered after commissioning is complete.",
        "Operation and maintenance manuals shall be provided in English and German.",
        "Document reviews by the purchaser do not relieve the supplier of responsibility for correctness.",
    ],
    "quality": [
        "The supplier shall operate a quality management system certified to ISO 9001.",
        "A quality plan shall be issued for review before manufacturing starts.",
        "Non-conformances shall be reported to the purchaser together with the proposed corrective action.",
        "The purchaser reserves the right to audit the supplier and its sub-suppliers.",
        "Material certificates shall be traceable to the delivered equipment.",
    ],
    "packing": [
        "Equipment shall be packed for road transport and outdoor storage at site.",
        "Each package shall be marked with the purchase order number and the destination.",
        "Lifting points and centres of gravity shall be marked on each shipping unit.",
        "Packing lists shall be attached to each package and sent in advance.",
    ],
    "site": [
        "Site supervision for erection and commissioning shall be offered separately.",
        "The supplier's site staff shall attend the purchaser's safety induction.",
        "Commissioning shall follow a procedure agreed with the purchaser.",
        "Site acceptance tests shall be recorded on agreed test sheets.",
    ],
    "spares": [
        "A list of recommended spare parts shall be included with the offer.",
        "Spare parts shall be interchangeable with the corresponding original parts.",
        "Special tools required for maintenance shall be supplied with the equipment.",
        "Spare part prices shall remain valid as stated in the commercial terms.",
    ],
    "training": [
        "Training shall cover operation, maintenance and safety of the switchgear.",
        "Training material shall be provided to each participant.",
        "The training programme shall be agreed with the purchaser before delivery.",
    ],
    "hse": [
        "The supplier shall provide safety data sheets for all hazardous substances.",
        "Insulating gas handling shall follow the applicable environmental regulations.",
        "Waste packaging shall be removed from site by the supplier.",
    ],
    "evaluation": [
        "Offers are evaluated on technical compliance, commercial terms and total cost of ownership.",
        "Deviations shall be listed by the bidder; deviations not listed are deemed not to exist.",
        "The purchaser may request technical clarification meetings with shortlisted bidders.",
    ],
    "attachments": [
        "Attachment A: Single line diagram of the substation.",
        "Attachment B: Datasheet templates to be completed by the bidder.",
        "Attachment C: Site layout and access route.",
    ],
    "cover": [
        "Dear Sirs,",
        "We thank you for the invitation to tender and are pleased to submit our offer.",
        "This offer remains valid for the period stated in the commercial terms.",
        "Yours faithfully,",
    ],
    "datasheet": [
        "The datasheet below is completed against the purchaser's datasheet template.",
        "Installation: indoor, in a prefabricated substation building.",
        "Insulating medium: fluorine-free gas mixture.",
        "Operating mechanism: motor-charged spring mechanism.",
        "Mechanical endurance class according to the applicable standard.",
    ],
    "drawing": [
        "NOTE 1: All dimensions are in millimetres unless stated otherwise.",
        "NOTE 2: Earthing switches are interlocked with the associated circuit breakers.",
        "NOTE 3: Voltage transformers are fitted on incomer bays only.",
        "NOTE 4: Cable terminations are of the plug-in type.",
        "NOTE 5: The bus coupler connects both switchgear sections.",
        "NOTE 6: Auxiliary supplies are distributed from the station board.",
        "NOTE 8: Refer to the general arrangement drawing for panel positions.",
    ],
    "bom": [
        "Pos 10: Circuit breaker panels with vacuum interrupters.",
        "Pos 12: Current transformers for protection and metering.",
        "Pos 20: Cable termination compartments.",
        "Pos 30: Low voltage compartments with terminal blocks.",
        "Pos 40: Protection relay assemblies.",
        "Pos 50: Gas monitoring devices.",
        "Pos 60: Special tools and handling equipment.",
    ],
    "itp": [
        "The inspection and test plan lists all inspections and tests during manufacturing.",
        "Type test certificates from an accredited laboratory are submitted with the offer.",
        "Test results are recorded on test sheets signed by the supplier's quality inspector.",
        "Hold points are agreed with the purchaser during the kick-off meeting.",
    ],
    "commercial": [
        "Prices are fixed and firm for the scope described in this offer.",
        "Payment terms: milestone payments as defined in the purchase order.",
        "The offer is subject to the purchaser's general purchasing conditions.",
        "Taxes are shown separately where applicable.",
        "Unit prices for additional bays are available on request.",
    ],
}

# Section starts: page -> (heading, filler pool). Pages without an entry
# continue the previous section with the same filler pool.
MR_SECTIONS = {
    2: ("1. ORDER OF PRECEDENCE", "general"),
    3: ("2. SCOPE OF SUPPLY", "general"),
    4: ("3. CODES AND STANDARDS", "codes"),
    5: ("4. TECHNICAL REQUIREMENTS", "technical"),
    8: ("5. DOCUMENTATION", "documentation"),
    10: ("6. QUALITY REQUIREMENTS", "quality"),
    11: ("7. PACKING AND MARKING", "packing"),
    12: ("8. SITE SERVICES", "site"),
    13: ("9. FACTORY ACCEPTANCE TEST", "itp"),
    14: ("10. COMMERCIAL REQUIREMENTS", "commercial"),
    15: ("11. SPARE PARTS", "spares"),
    17: ("12. TRAINING", "training"),
    19: ("13. VENDOR DATA REQUIREMENTS", "documentation"),
    22: ("14. HEALTH, SAFETY AND ENVIRONMENT", "hse"),
    24: ("15. EVALUATION CRITERIA", "evaluation"),
    26: ("16. ATTACHMENTS", "attachments"),
}

BID_SECTIONS = {
    2: ("1. COVER LETTER", "cover"),
    3: (None, "compliance"),  # heading depends on the vendor
    5: ("3. TECHNICAL DATASHEET", "datasheet"),
    10: ("4. SINGLE LINE DIAGRAM NOTES", "drawing"),
    14: ("5. BILL OF MATERIALS", "bom"),
    17: ("6. INSPECTION AND TEST PLAN", "itp"),
    20: ("7. COMMERCIAL TERMS AND PRICE SCHEDULE", "commercial"),
    23: ("8. QUALITY ASSURANCE", "quality"),
    25: ("9. SPARE PARTS", "spares"),
    27: ("10. TRAINING", "training"),
    29: ("11. DOCUMENTATION", "documentation"),
}

MR_PRECEDENCE = (
    "In case of conflict between documents, the following order of precedence applies: "
    "this Material Requisition, the technical datasheets, the single line diagrams, "
    "and the vendor's general terms."
)

COMPLIANCE_TOPICS = [
    "Rated short-time withstand current",
    "Busbar material and rating",
    "Enclosure and internal arc classification",
    "Protection and SCADA communication",
    "Factory acceptance testing",
    "Delivery terms and warranty",
    "Rated voltage",
    "Ambient temperature rating",
]


def _filler(pool: str, page: int, count: int) -> list[tuple[str, str]]:
    sentences = FILLER[pool]
    return [("p", sentences[(page + i) % len(sentences)]) for i in range(count)]


def _compliance_rows(vendor: Vendor) -> list[tuple[str, str]]:
    if vendor.id == "vendor-a":
        return [("row", f"{topic} - Complied, see datasheet") for topic in COMPLIANCE_TOPICS]
    if vendor.id == "vendor-b":
        refer = {
            "Factory acceptance testing": "Refer to ITP",
            "Delivery terms and warranty": "Refer to commercial terms",
        }
        rows = []
        for topic in COMPLIANCE_TOPICS:
            if topic == "Protection and SCADA communication":
                continue  # replaced by the evidence row on this page
            rows.append(("row", f"{topic} - {refer.get(topic, 'Refer to datasheet')}"))
        return rows
    return [
        ("row", "Deviation 2: RTU marshalling, refer to datasheet section 3."),
        ("row", "Deviation 3: Factory acceptance testing, refer to inspection and test plan."),
        ("row", "Deviation 4: Delivery terms, refer to commercial terms."),
        ("row", "All other clauses - Complied"),
    ]


def _build(page_count: int, sections: dict, evidence: list[Ev], title_blocks: list[tuple[str, str]],
           compliance_heading: str | None = None, compliance_rows: list | None = None,
           drawing_code: str | None = None) -> list[Page]:
    pages: list[Page] = []
    pool = "general"
    for number in range(1, page_count + 1):
        page = Page()
        if number == 1:
            page.blocks = list(title_blocks)
            pages.append(page)
            continue
        heading = None
        if number in sections:
            heading, pool = sections[number]
            if pool == "compliance":
                heading = compliance_heading
        if heading:
            page.blocks.append(("h", heading))
        here = [e for e in evidence if e.page == number]
        if pool == "compliance" and number == 3:
            page.blocks.extend(("row", e.text) for e in here)
            page.blocks.extend(compliance_rows or [])
        elif pool == "compliance":
            page.blocks.extend(_filler("general", number, 3))
        else:
            # The body always opens with an ordinary sentence, so a page
            # without a heading never looks like a new section.
            fill = _filler(pool, number, 3 if here else 4)
            page.blocks.extend(fill[:1] + [("p", e.text) for e in here] + fill[1:])
        if pool == "drawing" and drawing_code:
            page.drawing = f"Drawing {drawing_code} - sheet {number - 9}"
        pages.append(page)
    return pages


def documents() -> list[DocumentSpec]:
    mr_evidence = list(MR_EVIDENCE)
    mr_title = [
        ("title", "Vogt-Grid EPC Consortium GmbH"),
        ("p", "Material Requisition MR-33kV-GIS-Rev4"),
        ("p", TITLE),
        ("p", f"Tender reference {TENDER_ID}"),
    ]
    mr_pages = _build(26, MR_SECTIONS, mr_evidence, mr_title)
    mr_pages[1].blocks.insert(1, ("p", MR_PRECEDENCE))
    docs = [DocumentSpec(MR_FILE, "Material Requisition MR-33kV-GIS-Rev4", mr_pages)]
    for vendor in VENDORS:
        title = [
            ("title", vendor.name),
            ("p", "Technical and Commercial Offer"),
            ("p", f"Product: {vendor.product}"),
            ("p", "Submitted in response to Material Requisition MR-33kV-GIS-Rev4"),
        ]
        pages = _build(
            30, BID_SECTIONS, VENDOR_EVIDENCE[vendor.id], title,
            compliance_heading=vendor.compliance_heading,
            compliance_rows=_compliance_rows(vendor),
            drawing_code=f"{vendor.product.split()[0]}-SLD",
        )
        pages[1].blocks.append(("p", vendor.name))
        docs.append(DocumentSpec(vendor.file, f"Offer — {vendor.name}", pages))
    return docs


def manifest() -> dict:
    return {
        "tender_id": TENDER_ID,
        "title": TITLE,
        "client": CLIENT,
        "equipment_class": "mv_gis_switchgear",
        "rate_table": "mv_gis_switchgear_v2",
        "documents": [{"file": MR_FILE, "role": "mr_spec"}] + [
            {"file": v.file, "role": "vendor_bid", "vendor_id": v.id,
             "vendor_name": v.name, "country": v.country}
            for v in VENDORS
        ],
        "engineering_estimates": dict(ENGINEERING_ESTIMATES),
        "synthetic": True,
    }


def _candidates(evidence: list[Ev]) -> list[dict]:
    return [{"param_id": e.param_id, "page": e.page, "quote": e.text} for e in evidence if e.param_id]


def _quote_ref(key: str) -> dict:
    e = _EV_BY_KEY[key]
    return {"page": e.page, "quote": e.text}


def expected() -> dict:
    requirements = {}
    for param_id, (keys, values) in REQUIREMENTS.items():
        evs = [_EV_BY_KEY[k] for k in keys]
        requirements[param_id] = {"page": evs[0].page, "quotes": [e.text for e in evs], "values": values}
    cells = {}
    for vendor_id, by_param in CELLS.items():
        cells[vendor_id] = {}
        for param_id, (status, key, values, secondary, adder) in by_param.items():
            e = _EV_BY_KEY[key]
            cells[vendor_id][param_id] = {
                "status": status, "page": e.page, "quote": e.text, "values": values,
                "secondary_page": secondary, "adder": adder,
            }
            cells[vendor_id][param_id].update(copy.deepcopy(CELL_EXTRAS.get((vendor_id, param_id), {})))
    vendors = {
        v.id: {"name": v.name, "headline_price": v.headline,
               "total_adders": VENDOR_TOTALS[v.id][0], "true_evaluated_price": VENDOR_TOTALS[v.id][1]}
        for v in VENDORS
    }
    for vendor_id, status in VENDOR_PRICE_STATUS.items():
        vendors[vendor_id]["price_status"] = status
    ideal = {
        MR_FILE: {
            "page_sections": [],
            "candidates": _candidates(MR_EVIDENCE),
            "tender_facts": [{"fact": "bay_count", **_quote_ref("mr.bays")}],
            "headline_price": None,
            "cover_claim": None,
        }
    }
    for v in VENDORS:
        prefix = v.id[-1]
        ideal[v.file] = {
            "page_sections": [{"page": 1, "section": "general"}],
            "candidates": _candidates(VENDOR_EVIDENCE[v.id]),
            "tender_facts": [],
            "headline_price": _quote_ref(f"{prefix}.price"),
            "cover_claim": _quote_ref(f"{prefix}.cover"),
        }
    return {
        "tender_id": TENDER_ID,
        "bay_count": BAY_COUNT,
        "requirements": requirements,
        "cells": cells,
        "vendors": vendors,
        "negotiating_vendor": NEGOTIATING_VENDOR,
        "clawback": dict(CLAWBACK),
        "ideal_locate": ideal,
    }
