"""Section 4 amendments: A1 ordinal operators, A2 negotiating vendor. (A3 is in test_traceability.py.)"""

import pytest

import antova_engine as engine
from antova_ingest.costs import load_rate_table, price
from antova_ingest.ontology import ORDINALS, PARAMS_BY_ID
from antova_ingest.pipeline import run_ingest
from antova_ingest.precedence import merge_requirement, resolve
from antova_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected
from antova_ingest.tests.helpers import QUANTITIES, evidence, sample_tender
from antova_ingest.values import rule_text

P06 = PARAMS_BY_ID["PARAM-06"]
P03 = PARAMS_BY_ID["PARAM-03"]


def _incoterm(required: str, offered: str):
    mr = [evidence("PARAM-06", "mr_spec", 14, f"Delivery shall be {required} project site (Incoterms 2020)."),
          evidence("PARAM-06", "mr_spec", 14, "The defect liability period shall be 24 months from commissioning.")]
    requirement = merge_requirement(P06, mr)
    offer = evidence("PARAM-06", "commercial", 21,
                     f"Delivery {offered} project site (Incoterms 2020); warranty 24 months from commissioning.")
    return requirement, resolve(P06, requirement, [offer], "vendor-x")


# --- A1 ------------------------------------------------------------------------------

def test_incoterm_order_runs_from_exw_to_ddp():
    order = ORDINALS["incoterm"]
    assert order[0] == "EXW" and order[-3:] == ("DAP", "DPU", "DDP")
    assert order.index("FCA") < order.index("CIF") < order.index("DAP")
    assert ORDINALS["iac"] == ("AF", "AFL", "AFLR")


@pytest.mark.parametrize("required, offered, passes", [
    ("DAP", "DDP", True),   # better than required: the false alarm the amendment removes
    ("DAP", "DPU", True),
    ("DAP", "DAP", True),
    ("DAP", "CIF", False),
    ("DDP", "DAP", False),
    ("FCA", "EXW", False),
])
def test_better_than_required_incoterm_is_compliant(required, offered, passes):
    _, r = _incoterm(required, offered)
    check = next(c for c in r.checks if c.field == "incoterm")
    assert (check.passed, check.operator) == (passes, "ord")
    assert (r.status == engine.ComplianceStatus.COMPLIANT) == passes


def test_better_internal_arc_class_is_compliant():
    requirement = merge_requirement(P03, [evidence("PARAM-03", "mr_spec", 6,
                                                   "Enclosure protection shall be IP54 with internal arc classification IAC AFL.")])
    better = evidence("PARAM-03", "datasheet", 7, "Full IP54 sealing with 4-sided IAC AFLR internal arc containment.")
    worse = evidence("PARAM-03", "datasheet", 7, "Enclosure IP54; internal arc classification IAC AF (front only).")
    assert resolve(P03, requirement, [better], "v").status == engine.ComplianceStatus.COMPLIANT
    assert resolve(P03, requirement, [worse], "v").status == engine.ComplianceStatus.DEVIATION_DOWNGRADE


def test_a_worse_incoterm_is_still_priced_by_its_pair():
    requirement, r = _incoterm("DDP", "EXW")
    pricing = price(P06, requirement, r, load_rate_table("mv_gis_switchgear_v1"), QUANTITIES)
    assert pricing.pricing_status == "PRICED" and pricing.adder == 2 * 2600 + 950


def test_rule_text_reads_at_least():
    requirement, _ = _incoterm("DAP", "DDP")
    assert rule_text(P06, requirement) == "Incoterm ≥ DAP AND Warranty months ≥ 24"


# --- A2 ------------------------------------------------------------------------------

def test_negotiating_vendor_is_the_lowest_true_evaluated_price():
    tender = sample_tender()
    choice = engine.negotiating_choice(tender)
    # Headlines: a 452,000, b 418,000, c 439,000. True prices: a 452,000, c 454,000, and b 479,650 as a
    # lower bound (rate table v2 leaves its dispatch warranty unpriced, so b is not ranked at all).
    assert choice["vendor_id"] == "vendor-a" == engine.negotiating_vendor_id(tender)
    assert choice["lowest_headline"] == "vendor-b" == engine.apparent_low_bidder_id(tender)
    assert choice["basis"] == "lowest true evaluated price"
    assert [(e["vendor_id"], e["reason"]) for e in choice["excluded"]] == [("vendor-b", "UNPRICED_ITEMS")]
    assert "PARAM-06" in choice["excluded"][0]["detail"]
    # Priced with the months-only table v1, vendor-b has a full price (482,800) and nobody is excluded.
    v1 = engine.negotiating_choice(sample_tender(rate_table="mv_gis_switchgear_v1"))
    assert (v1["vendor_id"], v1["excluded"]) == ("vendor-a", [])


def test_vendors_without_a_full_price_are_excluded_and_named():
    # Table v1, so vendor-b is fully priced here and the exclusions come only from what this test sets up.
    tender = sample_tender({"vendor-a": None, "vendor-b": 418000.0, "vendor-c": 439000.0},
                           rate_table="mv_gis_switchgear_v1")
    cell = next(p for p in tender.parameters if p.id == "PARAM-07").vendors["vendor-c"]
    cell.status, cell.pricing_status = engine.ComplianceStatus.DEVIATION_DOWNGRADE, "UNPRICED"
    choice = engine.negotiating_choice(tender)
    assert choice["vendor_id"] == "vendor-b"  # the only fully priced vendor, though its true price is highest
    assert {e["vendor_id"]: e["reason"] for e in choice["excluded"]} == {
        "vendor-a": "NO_HEADLINE", "vendor-c": "UNPRICED_ITEMS"}
    assert "PARAM-07" in next(e["detail"] for e in choice["excluded"] if e["vendor_id"] == "vendor-c")


def test_no_fully_priced_vendor_means_no_negotiating_vendor():
    tender = sample_tender({"vendor-a": None, "vendor-b": None, "vendor-c": None})
    assert engine.negotiating_choice(tender)["vendor_id"] is None


def test_sliders_can_change_who_is_lowest():
    # Copper at 2.5x adds 12,580 x 1.5 to vendor-b only; a and c do not move. Cheaper labour
    # takes 65 h x 40 = 2,600 off vendor-c: 454,000 - 2,600 = 451,400, below vendor-a's 452,000.
    cheap_labour = engine.SensitivitySettings(site_labor_rate=20.0)
    assert engine.negotiating_vendor_id(sample_tender(), cheap_labour) == "vendor-c"


def test_concessions_default_to_the_negotiating_vendor_and_accept_a_named_one():
    tender = sample_tender()
    conceded = ["PARAM-01", "PARAM-02", "PARAM-03", "PARAM-05", "PARAM-06"]
    default = {f["vendor_id"]: f for f in engine.evaluate_vendor_financials(tender, engine.SensitivitySettings(), conceded)}
    assert default["vendor-a"]["clawed_back_amount"] == 0.0  # the lowest true price has nothing to close
    assert default["vendor-b"]["clawed_back_amount"] == 0.0
    named = {f["vendor_id"]: f for f in engine.evaluate_vendor_financials(
        tender, engine.SensitivitySettings(), conceded, "vendor-b")}
    # PARAM-06 contributes only its priced EXW-to-DDP class (6,150); the warranty shortfall has no price.
    assert named["vendor-b"]["clawed_back_amount"] == 54250.0


def test_sample_tender_names_nordwerk_and_keeps_the_low_bidder_badge():
    result = run_ingest(PACK, locator=AnswerKeyLocator(load_expected()))
    badges = {v.id: v.badge for v in result.tender.vendors}
    assert badges == {"vendor-a": "Lowest Evaluated Price", "vendor-b": "Apparent Low Bidder", "vendor-c": "Bidder"}
    choice = result.stats["negotiating_vendor"]
    assert (choice["vendor_id"], choice["lowest_headline"]) == ("vendor-a", "vendor-b")
    # The risk hidden in the cheapest-looking bid is still what the run reports.
    # vendor-b is the lowest headline but now has an unpriced warranty item: it is excluded from the
    # comparison, and its exposed risk is a lower bound (61,650 priced, warranty unpriced).
    assert [(e["vendor_id"], e["reason"]) for e in choice["excluded"]] == [("vendor-b", "UNPRICED_ITEMS")]
    assert result.stats["exposed_risk_eur"] == 61650.0
