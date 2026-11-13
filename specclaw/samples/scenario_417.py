"""Content of the synthetic TENDER-2026-417 pack, written as data.

A second sample tender that covers what TENDER-2026-402 does not:

- four bidders instead of three;
- a bid with no headline price in the document (vendor-b);
- a bid file that cannot be opened (vendor-c);
- a bid with one scanned page that has no text (vendor-d, page 6);
- deviations the rate table has no price for (vendor-b), which must show as unpriced;
- a running header on every page of every document.

The answer key below is written by hand from the evidence sentences. It is never
derived from the pipeline's output. All names are fictional.
"""

from __future__ import annotations

from samples.scenario import (
    BID_SECTIONS,
    COMPLIANCE_TOPICS,
    FOOTER,  # noqa: F401  (part of the pack interface)
    MR_PRECEDENCE,
    MR_SECTIONS,
    DocumentSpec,
    Ev,
    Vendor,
    _build,
)

TENDER_ID = "TENDER-2026-417"
TITLE = "120 MW Wind Farm Collector Substation — 33kV GIS Switchgear Package"
CLIENT = "Halden Ridge Renewables AS (fictional)"
MR_FILE = "MR-Collector-GIS-Rev2.pdf"
MR_NAME = "MR-Collector-GIS-Rev2"

VENDORS = [
    Vendor("vendor-a", "Kestrel Switchgear AG", "Switzerland", "KSG-36",
           "Bid_vendor-a_Kestrel.pdf", "388000.00", "2. COMPLIANCE TABLE"),
    Vendor("vendor-b", "Orbis Elektrik A.S.", "Turkey", "OE-GIS 36",
           "Bid_vendor-b_Orbis.pdf", "", "2. COMPLIANCE TABLE"),  # no price in the document
    Vendor("vendor-c", "Tavish Power Systems Ltd", "United Kingdom", "TPS-36",
           "Bid_vendor-c_Tavish.pdf", "", "2. COMPLIANCE TABLE"),  # the file cannot be opened
    Vendor("vendor-d", "Lindqvist Energi AB", "Sweden", "LQ-36",
           "Bid_vendor-d_Lindqvist.pdf", "372500.00", "2. COMPLIANCE TABLE"),
]
UNREADABLE = {"vendor-c"}
SCANNED_PAGES = {"vendor-d": [6]}

# The unreadable bid: a file that names itself a PDF and holds nothing a reader can open.
CORRUPT_BID = (
    b"%PDF-1.7\n"
    b"% SYNTHETIC SAMPLE - deliberately damaged file, not a real offer\n"
    + b"this file was cut off during upload and has no objects, no xref table and no trailer\n" * 12
)

# --- Evidence -----------------------------------------------------------------

MR_EVIDENCE = [
    Ev("mr.bays", 3, "The switchgear lineup comprises 7 bays (1 incomer, 1 bus coupler, 5 feeders) of gas-insulated switchgear."),
    Ev("mr.p07", 5, "Rated voltage Ur shall be not less than 36 kV.", "PARAM-07"),
    Ev("mr.p01", 5, "Rated short-time withstand current Ik shall be 31.5 kA RMS for a duration of 3 s.", "PARAM-01"),
    Ev("mr.p02", 6, "Main busbars shall be electrolytic copper Cu-ETP rated for 2000 A continuous current.", "PARAM-02"),
    Ev("mr.p03", 6, "Enclosure protection shall be IP54 with internal arc classification IAC AFLR.", "PARAM-03"),
    Ev("mr.p04", 7, "Protection IEDs shall communicate via IEC 61850 Edition 2 with PRP redundancy, with pre-wired RTU marshalling in a central marshalling cabinet.", "PARAM-04"),
    Ev("mr.p08", 7, "Equipment shall be rated for a maximum ambient air temperature of +45 °C without derating.", "PARAM-08"),
    Ev("mr.p05", 13, "A 3-day witnessed integrated factory acceptance test (I-FAT) with primary injection shall be included in the contract price.", "PARAM-05"),
    Ev("mr.p06a", 14, "Delivery shall be DDP project site Rogaland (Incoterms 2020).", "PARAM-06"),
    Ev("mr.p06b", 14, "The defect liability period shall be 24 months from commissioning.", "PARAM-06"),
]

VENDOR_EVIDENCE = {
    "vendor-a": [
        Ev("a.cover", 2, "Our offer is in full compliance with MR-Collector-GIS-Rev2."),
        Ev("a.p01", 6, "Rated short-time withstand current (main busbar and breaker): 31.5 kA / 3 s.", "PARAM-01"),
        Ev("a.p02", 6, "Main busbars: silver-plated electrolytic copper Cu-ETP, 2000 A continuous.", "PARAM-02"),
        Ev("a.p07", 6, "Rated voltage Ur: 36 kV.", "PARAM-07"),
        Ev("a.p03", 7, "Enclosure protection IP54 with rear gas exhaust ducting, internal arc classification IAC AFLR.", "PARAM-03"),
        Ev("a.p08", 7, "Rated for ambient temperatures from -25 °C to +45 °C without derating.", "PARAM-08"),
        Ev("a.p04", 8, "Protection IEDs KS-Guard 7 with IEC 61850 Ed.2 PRP dual-port fibre, pre-wired to the central RTU marshalling cabinet.", "PARAM-04"),
        Ev("a.p05", 18, "The price includes a 3-day client-witnessed I-FAT with primary injection.", "PARAM-05"),
        Ev("a.p06", 21, "Delivery DDP project site Rogaland (Incoterms 2020) with a 24-month defect liability period.", "PARAM-06"),
        Ev("a.price", 22, "Total lump-sum price for the complete scope: EUR 388.000,00"),
    ],
    "vendor-b": [
        Ev("b.cover", 2, "We confirm our offer is compliant with Material Requisition MR-Collector-GIS-Rev2."),
        Ev("b.p01", 6, "Rated short-time withstand current: 31.5 kA / 3 s.", "PARAM-01"),
        Ev("b.p02", 6, "Main busbars: electrolytic copper Cu-ETP, 1600 A continuous.", "PARAM-02"),
        Ev("b.p07", 6, "Rated voltage Ur: 36 kV.", "PARAM-07"),
        Ev("b.p03", 7, "Enclosure protection IP54, internal arc classification IAC AFLR.", "PARAM-03"),
        Ev("b.p08", 7, "Maximum ambient temperature 40 °C without derating.", "PARAM-08"),
        Ev("b.p04", 8, "Protection IEDs OE-P3 with IEC 61850 Ed.2 PRP dual-port fibre, pre-wired to the central RTU marshalling cabinet.", "PARAM-04"),
        Ev("b.p05", 18, "The price includes a 3-day client-witnessed I-FAT with primary injection.", "PARAM-05"),
        Ev("b.p06", 21, "Delivery FCA Izmir port (Incoterms 2020); warranty 24 months from commissioning.", "PARAM-06"),
        Ev("b.noprice", 22, "The price is stated in the separate sealed commercial envelope."),
    ],
    "vendor-c": [],
    "vendor-d": [
        Ev("d.cover", 2, "Our offer follows MR-Collector-GIS-Rev2 with the deviations listed in the commercial terms."),
        # Page 6 of this bid is a scan with no text. Its ratings are unknown to the pipeline,
        # so only what the compliance table declares on page 3 can be read.
        Ev("d.p01", 3, "Rated short-time withstand current 31.5 kA for 3 s - Complied", "PARAM-01"),
        Ev("d.p03", 7, "Standard indoor enclosure IP42 with ventilation louvres; internal arc classification IAC AFLR.", "PARAM-03"),
        Ev("d.p08", 7, "Maximum ambient temperature 113 °F without derating.", "PARAM-08"),
        Ev("d.p04", 8, "IEC 61850 Ed.2 relays LQ-R5 with PRP fibre ports; RTU marshalling excluded, customer SCADA wiring directly to individual bay LV compartments.", "PARAM-04"),
        Ev("d.p05", 18, "Includes 1 day witnessed inspection; additional days billed per tariff.", "PARAM-05"),
        Ev("d.p06", 21, "Prices are quoted Ex-Works (EXW) Vasteras factory loading dock; standard warranty 12 months from dispatch.", "PARAM-06"),
        Ev("d.price", 22, "Total lump-sum price for the complete scope: €372,500"),
    ],
}

_EV_BY_KEY = {e.key: e for e in MR_EVIDENCE}
for _evs in VENDOR_EVIDENCE.values():
    _EV_BY_KEY.update({e.key: e for e in _evs})

# --- Answer key (literal values) ----------------------------------------------

REQUIREMENTS = {
    "PARAM-01": (["mr.p01"], {"ik": "31.5 kA", "ik_duration": "3 s"}),
    "PARAM-02": (["mr.p02"], {"material": "Cu-ETP", "rated_current": "2000 A"}),
    "PARAM-03": (["mr.p03"], {"ip": "IP54", "iac_class": "AFLR"}),
    "PARAM-04": (["mr.p04"], {"protocol": "IEC 61850 Ed. 2 with PRP", "marshalling": "pre-wired"}),
    "PARAM-05": (["mr.p05"], {"witnessed_fat_days_included": "3"}),
    "PARAM-06": (["mr.p06a", "mr.p06b"], {"incoterm": "DDP", "warranty_months": "24"}),
    "PARAM-07": (["mr.p07"], {"rated_voltage": "36 kV"}),
    "PARAM-08": (["mr.p08"], {"max_ambient": "45 °C"}),
}

_PARAM_IDS = list(REQUIREMENTS)
_MANUAL = ("MANUAL_INSPECTION_REQUIRED", None, {}, None, "0.00")

# (status, primary evidence key or None, governing values, secondary page, adder)
CELLS = {
    "vendor-a": {
        "PARAM-01": ("COMPLIANT", "a.p01", {"ik": "31.5 kA", "ik_duration": "3 s"}, None, "0.00"),
        "PARAM-02": ("COMPLIANT", "a.p02", {"material": "Cu-ETP", "rated_current": "2000 A"}, None, "0.00"),
        "PARAM-03": ("COMPLIANT", "a.p03", {"ip": "IP54", "iac_class": "AFLR"}, None, "0.00"),
        "PARAM-04": ("COMPLIANT", "a.p04", {"protocol": "IEC 61850 Ed. 2 with PRP", "marshalling": "pre-wired"}, None, "0.00"),
        "PARAM-05": ("COMPLIANT", "a.p05", {"witnessed_fat_days_included": "3"}, None, "0.00"),
        "PARAM-06": ("COMPLIANT", "a.p06", {"incoterm": "DDP", "warranty_months": "24"}, None, "0.00"),
        "PARAM-07": ("COMPLIANT", "a.p07", {"rated_voltage": "36 kV"}, None, "0.00"),
        "PARAM-08": ("COMPLIANT", "a.p08", {"max_ambient": "45 °C"}, None, "0.00"),
    },
    "vendor-b": {
        "PARAM-01": ("COMPLIANT", "b.p01", {"ik": "31.5 kA", "ik_duration": "3 s"}, None, "0.00"),
        # 1600 A against 2000 A: the rate table has no class for a short busbar rating.
        "PARAM-02": ("DEVIATION_DOWNGRADE", "b.p02", {"material": "Cu-ETP", "rated_current": "1600 A"}, None, "0.00"),
        "PARAM-03": ("COMPLIANT", "b.p03", {"ip": "IP54", "iac_class": "AFLR"}, None, "0.00"),
        "PARAM-04": ("COMPLIANT", "b.p04", {"protocol": "IEC 61850 Ed. 2 with PRP", "marshalling": "pre-wired"}, None, "0.00"),
        "PARAM-05": ("COMPLIANT", "b.p05", {"witnessed_fat_days_included": "3"}, None, "0.00"),
        # FCA against DDP: only EXW and DAP have a rate.
        "PARAM-06": ("DEVIATION_DOWNGRADE", "b.p06", {"incoterm": "FCA", "warranty_months": "24"}, None, "0.00"),
        "PARAM-07": ("COMPLIANT", "b.p07", {"rated_voltage": "36 kV"}, None, "0.00"),
        # 40 °C against 45 °C: no rate for an ambient shortfall.
        "PARAM-08": ("DEVIATION_DOWNGRADE", "b.p08", {"max_ambient": "40 °C"}, None, "0.00"),
    },
    "vendor-c": {param_id: _MANUAL for param_id in _PARAM_IDS},
    "vendor-d": {
        "PARAM-01": ("COMPLIANT", "d.p01", {"ik": "31.5 kA", "ik_duration": "3 s"}, None, "0.00"),
        "PARAM-02": _MANUAL,  # on the scanned page
        # 7 bays x EUR 400 gasket and filter kit.
        "PARAM-03": ("DEVIATION_DOWNGRADE", "d.p03", {"ip": "IP42", "iac_class": "AFLR"}, None, "2800.00"),
        # 65 h x EUR 60 site termination + EUR 200 test kit hire.
        "PARAM-04": ("DEVIATION_DOWNGRADE", "d.p04", {"protocol": "IEC 61850 Ed. 2 with PRP", "marshalling": "not pre-wired"}, None, "4100.00"),
        # 2 missing days x EUR 1,300.
        "PARAM-05": ("DEVIATION_DOWNGRADE", "d.p05", {"witnessed_fat_days_included": "1"}, None, "2600.00"),
        # 1 load x EUR 2,600 + EUR 950 insurance + 12 missing months x EUR 175.
        "PARAM-06": ("DEVIATION_DOWNGRADE", "d.p06", {"incoterm": "EXW", "warranty_months": "12"}, None, "5650.00"),
        "PARAM-07": _MANUAL,  # on the scanned page
        "PARAM-08": ("COMPLIANT", "d.p08", {"max_ambient": "113 °F"}, None, "0.00"),
    },
}

# vendor -> (total adders, true evaluated price or None when there is no headline price)
VENDOR_TOTALS = {
    "vendor-a": ("0.00", "388000.00"),
    "vendor-b": ("0.00", None),
    "vendor-c": ("0.00", None),
    "vendor-d": ("15150.00", "387650.00"),
}
BADGES = {
    "vendor-a": "Compliant Baseline",
    "vendor-b": "Price not found",
    "vendor-c": "Price not found",
    "vendor-d": "Lowest Evaluated Price",  # also the lowest headline (amendment A2 names the badge)
}
UNPRICED = [
    {"vendor_id": "vendor-b", "param_id": "PARAM-02", "classes": ["PARAM-02.current_short"]},
    {"vendor_id": "vendor-b", "param_id": "PARAM-06", "classes": ["PARAM-06.incoterm_fca_to_ddp"]},
    {"vendor_id": "vendor-b", "param_id": "PARAM-08", "classes": ["PARAM-08.ambient_short"]},
]
# Each warning the run must give, as the text it starts with (the unreadable file's
# reason comes from the PDF library and is not pinned here).
WARNING_PREFIXES = [
    "vendor-c: cannot open PDF",
    "Bid_vendor-d_Lindqvist.pdf: page 6 has no text",
    "Bid_vendor-d_Lindqvist.pdf: 1 of 30 pages has no text layer (p.6)",
    "vendor-b: headline price not found",
]
# Lindqvist (vendor-d) negotiates. Round 2 concedes PARAM-01/03/05; round 3 adds PARAM-02/06.
CLAWBACK = {"round_2": "5400.00", "round_3": "11050.00"}
NEGOTIATING_VENDOR = "vendor-d"
BAY_COUNT = 7
ENGINEERING_ESTIMATES = {"busbar_cu_kg": 940, "heavy_haul_loads": 1}
STATS = {"documents": 5, "pages_parsed": 116, "deviations_found": 17}


def _compliance_rows(vendor: Vendor) -> list[tuple[str, str]]:
    if vendor.id == "vendor-d":
        # The short-time withstand row is the evidence row placed on this page.
        return [("row", f"{topic} - Refer to datasheet") for topic in COMPLIANCE_TOPICS
                if topic != "Rated short-time withstand current"]
    return [("row", f"{topic} - Complied, see datasheet") for topic in COMPLIANCE_TOPICS]


def documents() -> list[DocumentSpec]:
    mr_title = [
        ("title", "Halden Ridge Renewables AS"),
        ("p", f"Material Requisition {MR_NAME}"),
        ("p", TITLE),
        ("p", f"Tender reference {TENDER_ID}"),
    ]
    mr_pages = _build(26, MR_SECTIONS, list(MR_EVIDENCE), mr_title)
    mr_pages[1].blocks.insert(1, ("p", MR_PRECEDENCE))
    docs = [DocumentSpec(MR_FILE, f"Material Requisition {MR_NAME}", mr_pages,
                         running_header=f"HALDEN RIDGE RENEWABLES AS - MATERIAL REQUISITION {MR_NAME.upper()}")]
    for vendor in VENDORS:
        if vendor.id in UNREADABLE:
            continue
        title = [
            ("title", vendor.name),
            ("p", "Technical and Commercial Offer"),
            ("p", f"Product: {vendor.product}"),
            ("p", f"Submitted in response to Material Requisition {MR_NAME}"),
        ]
        pages = _build(
            30, BID_SECTIONS, VENDOR_EVIDENCE[vendor.id], title,
            compliance_heading=vendor.compliance_heading,
            compliance_rows=_compliance_rows(vendor),
            drawing_code=f"{vendor.product.split()[0]}-SLD",
        )
        pages[1].blocks.append(("p", vendor.name))
        for number in SCANNED_PAGES.get(vendor.id, []):
            pages[number - 1].blocks = []
            pages[number - 1].scanned = True
        docs.append(DocumentSpec(vendor.file, f"Offer — {vendor.name}", pages,
                                 running_header=f"{vendor.name.upper()} - TECHNICAL AND COMMERCIAL OFFER"))
    return docs


def raw_files() -> dict[str, bytes]:
    return {vendor.file: CORRUPT_BID for vendor in VENDORS if vendor.id in UNREADABLE}


def manifest() -> dict:
    return {
        "tender_id": TENDER_ID,
        "title": TITLE,
        "client": CLIENT,
        "equipment_class": "mv_gis_switchgear",
        "rate_table": "mv_gis_switchgear_v1",
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


def _quote_ref(key: str) -> dict | None:
    e = _EV_BY_KEY.get(key)
    return {"page": e.page, "quote": e.text} if e else None


def expected() -> dict:
    requirements = {}
    for param_id, (keys, values) in REQUIREMENTS.items():
        evs = [_EV_BY_KEY[k] for k in keys]
        requirements[param_id] = {"page": evs[0].page, "quotes": [e.text for e in evs], "values": values}
    cells = {}
    for vendor_id, by_param in CELLS.items():
        cells[vendor_id] = {}
        for param_id, (status, key, values, secondary, adder) in by_param.items():
            e = _EV_BY_KEY[key] if key else None
            cells[vendor_id][param_id] = {
                "status": status, "page": e.page if e else None, "quote": e.text if e else None,
                "values": values, "secondary_page": secondary, "adder": adder,
            }
    vendors = {
        v.id: {"name": v.name, "headline_price": v.headline or None, "badge": BADGES[v.id],
               "total_adders": VENDOR_TOTALS[v.id][0], "true_evaluated_price": VENDOR_TOTALS[v.id][1]}
        for v in VENDORS
    }
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
        if v.id in UNREADABLE:
            continue  # never reaches the locate call
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
        "unpriced": list(UNPRICED),
        "warning_prefixes": list(WARNING_PREFIXES),
        "scanned_pages": {v.file: SCANNED_PAGES[v.id] for v in VENDORS if v.id in SCANNED_PAGES},
        "unreadable_files": [v.file for v in VENDORS if v.id in UNREADABLE],
        "stats": dict(STATS),
        "ideal_locate": ideal,
    }
