"""
Antova Deterministic Validation & Parametric Should-Cost Engine
Strictly separating Probabilistic Vision/LLM extraction from Deterministic Unit & Cost Mathematics.

Adders are built from tagged cost lines (fixed, copper, labour, freight), so the
sensitivity sliders scale only the part of each adder they actually affect.
Unit checks live in antova_ingest.values (Pint); nothing here evaluates code strings.
"""

from collections.abc import Mapping
from decimal import ROUND_HALF_UP, Decimal
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

import pint  # noqa: F401  (version reported by /api/health)
from pydantic import BaseModel


class ComplianceStatus(str, Enum):
    COMPLIANT = "COMPLIANT"
    CONFLICT_DOWNGRADE = "CONFLICT_DOWNGRADE"
    DEVIATION_DOWNGRADE = "DEVIATION_DOWNGRADE"
    DEVIATION_UPGRADE = "DEVIATION_UPGRADE"
    OMITTED = "OMITTED"
    MANUAL_INSPECTION_REQUIRED = "MANUAL_INSPECTION_REQUIRED"


class Criticality(str, Enum):
    MANDATORY = "MANDATORY"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    COMMERCIAL = "COMMERCIAL"


class CostLine(BaseModel):
    label: str
    qty: Decimal
    unit: str
    rate: Decimal
    driver: Literal["fixed", "copper", "labour", "freight"]
    # The rate's range, where the rate table states one. None means the base rate.
    rate_low: Optional[Decimal] = None
    rate_high: Optional[Decimal] = None


class ExtractedParameter(BaseModel):
    extracted_text: str
    status: ComplianceStatus
    confidence: float
    bbox: str
    snippet: str
    conflict_note: Optional[str] = None
    cost_adder: float = 0.0
    adder_formula: str = ""
    cost_lines: List[CostLine] = []
    pricing_status: str = "NONE"
    citation: Optional[Dict[str, Any]] = None
    secondary_citation: Optional[Dict[str, Any]] = None
    checks: List[Dict[str, Any]] = []
    rate_table_version: Optional[str] = None
    # Review flags: [{"code", "message"}]. A person approves every flag before a result is final.
    flags: List[Dict[str, Any]] = []
    # For a COMPLIANT cell: "documentary", or "claim_only" when every supporting citation is a
    # cover-letter or compliance-table statement ("claimed, not shown").
    evidence: Optional[str] = None
    # Every value shown in extracted_text with its own citation: [{"field", "label", "text", "citation"}].
    segments: List[Dict[str, Any]] = []
    # field name -> citation of the passage that value was read from.
    field_citations: Dict[str, Dict[str, Any]] = {}
    # e.g. "assembled from p.11 and p.3" when the values come from different pages.
    assembled_from: Optional[str] = None


class EngineeringParameter(BaseModel):
    id: str
    category: str
    name: str
    mr_requirement: str
    pint_rule: str
    criticality: Criticality
    vendors: Dict[str, ExtractedParameter]
    requirement_citation: Optional[Dict[str, Any]] = None
    checks_spec: List[Dict[str, Any]] = []


class Vendor(BaseModel):
    id: str
    name: str
    country: str
    # In the rate table's currency. None when the price is unknown: never 0.
    headline_price: Optional[float] = None
    doc_name: str
    cover_claim: str
    badge: str
    headline_citation: Optional[Dict[str, Any]] = None
    # PRICED, NOT_FOUND, CURRENCY_UNKNOWN or FX_MISSING. None on tenders stored before the field existed.
    headline_status: Optional[str] = None
    # The currency the bid is priced in, and the amount as the bid states it.
    currency: Optional[str] = None
    headline_original: Optional[str] = None
    # The dated rate used to bring a foreign price into the table's currency.
    fx_rate: Optional[str] = None
    fx_date: Optional[str] = None


class TenderPackage(BaseModel):
    id: str
    title: str
    client: str
    mr_doc: str
    pages_parsed: int
    latency_sec: int
    compute_cogs: float
    vendors: List[Vendor]
    parameters: List[EngineeringParameter]
    equipment_class: str = ""
    rate_table_version: str = ""


class SensitivitySettings(BaseModel):
    copper_multiplier: float = 1.0
    # EUR per site labour hour. None means each labour line's own rate, which is the rate
    # table's base_labour_rate; a number replaces it.
    site_labor_rate: Optional[float] = None
    freight_multiplier: float = 1.0


class Override(BaseModel):
    """A founder's euro adder for one (parameter, vendor) cell; replaces the computed adder and ignores the sliders."""
    adder_eur: Decimal
    note: str


_CENTS = Decimal("0.01")


LEVELING_CURRENCY = "EUR"


def line_amount(line: CostLine, s: SensitivitySettings, bound: str = "base") -> Decimal:
    """One cost line's amount under the current sliders, at its base, low or high rate.

    A labour line is hours x an hourly rate: the slider's rate when one is set, else the
    line's own (the rate table's base_labour_rate). No constant is assumed here.
    """
    if line.driver == "labour" and s.site_labor_rate is not None:
        return line.qty * Decimal(str(s.site_labor_rate))
    rate = line.rate
    if bound == "low" and line.rate_low is not None:
        rate = line.rate_low
    elif bound == "high" and line.rate_high is not None:
        rate = line.rate_high
    if line.driver == "copper":
        return line.qty * rate * Decimal(str(s.copper_multiplier))
    if line.driver == "freight":
        return line.qty * rate * Decimal(str(s.freight_multiplier))
    return line.qty * rate


def cents(value: Decimal) -> Decimal:
    """`value` rounded half up to whole cents."""
    return value.quantize(_CENTS, rounding=ROUND_HALF_UP)


def adder_decimal(extraction: ExtractedParameter, s: SensitivitySettings, bound: str = "base") -> Decimal:
    """One cell's adder in exact whole cents."""
    if not extraction.cost_lines:
        return cents(Decimal(str(extraction.cost_adder)))  # legacy data without cost lines
    return cents(sum((line_amount(line, s, bound) for line in extraction.cost_lines), Decimal("0")))


def adder_amount(extraction: ExtractedParameter, s: SensitivitySettings, bound: str = "base") -> float:
    return float(adder_decimal(extraction, s, bound))


def headline_status(vendor: Vendor) -> str:
    """PRICED when the vendor has a usable headline price, else why it has none."""
    if vendor.headline_price:
        return "PRICED"
    return vendor.headline_status if vendor.headline_status not in (None, "PRICED") else "NOT_FOUND"


def apparent_low_bidder_id(tender: TenderPackage) -> Optional[str]:
    """The lowest headline price among vendors with a known price: the bid that looks cheapest."""
    priced = [v for v in tender.vendors if v.headline_price]
    return min(priced, key=lambda v: v.headline_price).id if priced else None


_EXCLUSION_DETAIL = {
    "NO_HEADLINE": "no headline price was found in the bid",
    "CURRENCY_UNKNOWN": "the headline price names no currency",
    "FX_MISSING": "the headline price is in another currency and the rate table has no dated FX rate",
}


def negotiating_choice(
    tender: TenderPackage,
    sensitivity: Optional["SensitivitySettings"] = None,
    overrides: Mapping[tuple[str, str], "Override"] | None = None,
) -> Dict[str, Any]:
    """Who to negotiate with, and who was left out of the comparison and why (amendment A2).

    The negotiating vendor is the lowest true evaluated price among vendors that are fully
    priced. The lowest headline is often not the lowest real cost; that is what this product
    is for. A vendor with no usable headline, or with a deviation that has no rate, has no
    complete price to rank, so it is excluded and named.
    """
    financials = evaluate_vendor_financials(tender, sensitivity or SensitivitySettings(), [], "", overrides)
    priced = [f for f in financials if f["price_status"] == "PRICED"]
    excluded = []
    for f in financials:
        if f["price_status"] == "PRICED":
            continue
        if f["price_status"] == "UNPRICED_ITEMS":
            items = [i["param_id"] for i in f["itemized_breakdown"] if i["pricing_status"] == "UNPRICED"]
            detail = f"has deviations with no rate ({', '.join(items)}), so its price is only a lower bound"
        else:
            detail = _EXCLUSION_DETAIL.get(f["price_status"], "has no complete price")
        excluded.append({"vendor_id": f["vendor_id"], "reason": f["price_status"], "detail": detail})
    best = min(priced, key=lambda f: f["true_evaluated_price"]) if priced else None
    return {
        "vendor_id": best["vendor_id"] if best else None,
        "basis": "lowest true evaluated price",
        "true_evaluated_price": best["true_evaluated_price"] if best else None,
        "lowest_headline": apparent_low_bidder_id(tender),
        "excluded": excluded,
    }


def negotiating_vendor_id(
    tender: TenderPackage,
    sensitivity: Optional["SensitivitySettings"] = None,
    overrides: Mapping[tuple[str, str], "Override"] | None = None,
) -> Optional[str]:
    """The vendor to negotiate with: lowest true evaluated price among fully priced vendors."""
    return negotiating_choice(tender, sensitivity, overrides)["vendor_id"]


def evaluate_vendor_financials(
    tender: TenderPackage,
    sensitivity: SensitivitySettings,
    conceded_params: List[str],
    negotiating_vendor: Optional[str] = None,
    overrides: Mapping[tuple[str, str], Override] | None = None,
) -> List[Dict[str, Any]]:
    """
    True Evaluated Price = Headline Quote + Sum(Tech Penalties) + Sum(Commercial Adders).
    Every sum is exact (Decimal, whole cents); a float appears only in the returned figures.
    Concessions apply only to the vendor in negotiation and move its adders to clawed_back_amount.
    `negotiating_vendor` names that vendor; None means the lowest true evaluated price (A2).
    Overrides, keyed (param_id, vendor_id), replace a cell's computed adder before concessions apply.
    """
    conceded_set = set(conceded_params)
    overrides = overrides or {}
    if negotiating_vendor is None and conceded_set:
        negotiating_vendor = negotiating_vendor_id(tender, sensitivity, overrides)
    negotiating = negotiating_vendor
    results = []
    for v in tender.vendors:
        zero = Decimal("0")
        total_tech_penalty = total_commercial_adder = clawed_back_amount = total_low = total_high = zero
        itemized_breakdown = []
        has_unpriced = False
        for p in tender.parameters:
            extraction = p.vendors.get(v.id)
            if extraction is None:
                continue
            override = overrides.get((p.id, v.id))
            adder = cents(override.adder_eur) if override is not None else adder_decimal(extraction, sensitivity)
            # A founder's override is one figure, so it has no range.
            adder_low = adder if override is not None else adder_decimal(extraction, sensitivity, "low")
            adder_high = adder if override is not None else adder_decimal(extraction, sensitivity, "high")
            is_conceded = v.id == negotiating and p.id in conceded_set
            # An override is the founder's own figure, so the cell is priced whatever the table said.
            pricing_status = "OVERRIDDEN" if override is not None else extraction.pricing_status
            if pricing_status == "UNPRICED" and not is_conceded:
                has_unpriced = True
            if is_conceded:
                clawed_back_amount += adder
            elif p.criticality == Criticality.COMMERCIAL:
                total_commercial_adder += adder
            else:
                total_tech_penalty += adder
            if not is_conceded:
                total_low += adder_low
                total_high += adder_high
            itemized_breakdown.append({
                "param_id": p.id,
                "param_name": p.name,
                "status": extraction.status.value,
                "is_conceded": is_conceded,
                "adder_eur": float(adder),
                "adder_low_eur": float(adder_low),
                "adder_high_eur": float(adder_high),
                "criticality": p.criticality.value,
                "pricing_status": pricing_status,
                "is_overridden": override is not None,
                "override_note": override.note if override is not None else None,
            })
        total_adders = total_tech_penalty + total_commercial_adder
        status = headline_status(v)
        if status != "PRICED":
            # No usable headline: there is no true evaluated price, only the adders. Never 0 + adders.
            headline = true_evaluated = true_low = true_high = None
            price_status = "NO_HEADLINE" if status == "NOT_FOUND" else status
        else:
            headline = v.headline_price
            exact_headline = Decimal(str(headline))
            true_evaluated = float(cents(exact_headline + total_adders))
            true_low = float(cents(exact_headline + total_low))
            true_high = float(cents(exact_headline + total_high))
            # UNPRICED_ITEMS: a lower bound, some deviation has no rate yet.
            price_status = "UNPRICED_ITEMS" if has_unpriced else "PRICED"
        results.append({
            "vendor_id": v.id,
            "name": v.name,
            "country": v.country,
            "badge": v.badge,
            "headline_price": headline,
            "currency": LEVELING_CURRENCY,
            "total_tech_penalty": float(cents(total_tech_penalty)),
            "total_commercial_adder": float(cents(total_commercial_adder)),
            "total_adders": float(cents(total_adders)),
            "total_adders_low": float(cents(total_low)),
            "total_adders_high": float(cents(total_high)),
            "clawed_back_amount": float(cents(clawed_back_amount)),
            "true_evaluated_price": true_evaluated,
            "true_evaluated_low": true_low,
            "true_evaluated_high": true_high,
            "price_status": price_status,
            "itemized_breakdown": itemized_breakdown,
        })
    return results


def mask_unknown_prices(financials: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Kept for callers written before evaluate_vendor_financials returned null for an unknown price."""
    return list(financials)


def rank_flip(financials: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """A warning when, within the adder ranges, the lowest-evaluated vendor could change.

    Only fully priced vendors are ranked. The lowest is the lowest base price; it is not
    stable when another vendor's low end is below its high end.
    """
    priced = [f for f in financials if f["price_status"] == "PRICED"]
    if len(priced) < 2:
        return None
    best = min(priced, key=lambda f: f["true_evaluated_price"])
    rivals = [f["vendor_id"] for f in priced
              if f["vendor_id"] != best["vendor_id"] and f["true_evaluated_low"] < best["true_evaluated_high"]]
    if not rivals:
        return None
    return {
        "lowest": best["vendor_id"],
        "could_be": rivals,
        "message": (f"The ranking is not stable: {best['vendor_id']} is lowest at its base price, but within the "
                    f"adder ranges {', '.join(rivals)} could be lower."),
    }
