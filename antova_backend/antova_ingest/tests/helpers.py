"""Shared builders: resolutions and priced tenders from the sample scenario."""

from __future__ import annotations

from decimal import Decimal

import antova_engine as engine
from samples import scenario
from antova_ingest.costs import load_rate_table, price
from antova_ingest.ontology import PARAMETERS, PARAMS_BY_ID
from antova_ingest.precedence import merge_requirement, resolve
from antova_ingest.types import Citation, Evidence
from antova_ingest.values import parse_field

SAMPLE_RATE_TABLE = "mv_gis_switchgear_v2"  # what the sample packs' manifests name

QUANTITIES = {
    "tender.bay_count": Decimal(11),
    "estimate.busbar_cu_kg": Decimal(1480),
    "estimate.heavy_haul_loads": Decimal(2),
}


def section_for(page: int) -> str:
    if page == 2:
        return "cover_letter"
    if page in (3, 4):
        return "compliance_table"
    if 5 <= page <= 9:
        return "datasheet"
    if 10 <= page <= 13:
        return "drawing"
    if 14 <= page <= 16:
        return "bom"
    if 17 <= page <= 19:
        return "test_plan"
    if 20 <= page <= 22:
        return "commercial"
    return "general"


def evidence(param_id: str, section: str, page: int, quote: str) -> Evidence:
    values = {}
    for f in PARAMS_BY_ID[param_id].fields:
        value = parse_field(f.kind, quote, f.name)
        if value is not None:
            values[f.name] = value
    return Evidence(param_id, Citation("test.pdf", page, (10.0, 20.0, 30.0, 40.0), quote, section), values)


def requirement(param_id: str):
    mr = [evidence(param_id, "mr_spec", e.page, e.text) for e in scenario.MR_EVIDENCE if e.param_id == param_id]
    return merge_requirement(PARAMS_BY_ID[param_id], mr)


def vendor_resolution(vendor_id: str, param_id: str, rate_table: str = SAMPLE_RATE_TABLE):
    evs = [evidence(param_id, section_for(e.page), e.page, e.text)
           for e in scenario.VENDOR_EVIDENCE[vendor_id] if e.param_id == param_id]
    # The sample is evaluated with rate table v2, as its manifest says; the table carries the warranty policy.
    policy = load_rate_table(rate_table).policies["warranty_basis"]
    return resolve(PARAMS_BY_ID[param_id], requirement(param_id), evs, vendor_id, warranty_policy=policy)


def priced(vendor_id: str, param_id: str, quantities=None, rate_table: str = SAMPLE_RATE_TABLE):
    param = PARAMS_BY_ID[param_id]
    resolution = vendor_resolution(vendor_id, param_id, rate_table)
    pricing = price(param, requirement(param_id), resolution, load_rate_table(rate_table),
                    QUANTITIES if quantities is None else quantities)
    return resolution, pricing


def sample_tender(headlines: dict[str, float] | None = None, rate_table: str = SAMPLE_RATE_TABLE) -> engine.TenderPackage:
    """The sample tender with real resolutions and cost lines for every cell, priced with `rate_table`."""
    headlines = headlines or {v.id: float(v.headline) for v in scenario.VENDORS}
    vendors = [
        engine.Vendor(id=v.id, name=v.name, country=v.country, headline_price=headlines[v.id],
                      doc_name=v.file, cover_claim="", badge="Bidder")
        for v in scenario.VENDORS
    ]
    parameters = []
    for param in PARAMETERS:
        cells = {}
        for v in scenario.VENDORS:
            resolution, pricing = priced(v.id, param.id, rate_table=rate_table)
            cells[v.id] = engine.ExtractedParameter(
                extracted_text=resolution.extracted_text, status=resolution.status,
                confidence=resolution.confidence, bbox="", snippet="",
                cost_adder=float(pricing.adder), adder_formula=pricing.formula,
                cost_lines=pricing.lines, pricing_status=pricing.pricing_status,
                rate_table_version=pricing.rate_table_version,
            )
        parameters.append(engine.EngineeringParameter(
            id=param.id, category=param.category, name=param.name, mr_requirement="",
            pint_rule="", criticality=param.criticality, vendors=cells,
        ))
    return engine.TenderPackage(
        id="TENDER-2026-402", title="t", client="c", mr_doc="m", pages_parsed=0, latency_sec=0,
        compute_cogs=0.0, vendors=vendors, parameters=parameters,
    )
