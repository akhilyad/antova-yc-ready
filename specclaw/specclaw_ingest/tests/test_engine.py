"""Leveling in the engine: sliders scale only tagged cost lines."""

from decimal import Decimal

import specclaw_engine as engine
from specclaw_ingest.tests.helpers import sample_tender


def _financials(tender=None, conceded=(), closing_with=None, **sliders):
    settings = engine.SensitivitySettings(**sliders)
    return {r["vendor_id"]: r for r in engine.evaluate_vendor_financials(
        tender or sample_tender(), settings, list(conceded), closing_with)}


def _row(result, param_id):
    return next(item for item in result["itemized_breakdown"] if item["param_id"] == param_id)


def _adder(result, param_id):
    return _row(result, param_id)["adder_eur"]


def _by_vendor(results):
    return {r["vendor_id"]: r for r in results}


def test_default_sliders_equal_base():
    results = _financials()
    assert results["vendor-a"]["total_adders"] == 0.0
    # Rate table v2: vendor-b's dispatch warranty is unpriced, so its total is a lower bound (not 64,800 / 482,800).
    assert results["vendor-b"]["total_adders"] == 61650.0
    assert results["vendor-b"]["true_evaluated_price"] == 479650.0
    assert results["vendor-b"]["price_status"] == "UNPRICED_ITEMS"
    assert results["vendor-c"]["total_adders"] == 15000.0
    assert results["vendor-c"]["true_evaluated_price"] == 454000.0


def test_copper_slider_scales_only_copper_line():
    assert _adder(_financials(copper_multiplier=2.0)["vendor-b"], "PARAM-02") == 26780.0


def test_labour_slider():
    results = _financials(site_labor_rate=75.0)
    assert _adder(results["vendor-b"], "PARAM-04") == 8375.0
    assert _adder(results["vendor-c"], "PARAM-04") == 5075.0


def test_freight_slider_spares_warranty():
    results = _financials(freight_multiplier=1.5)
    # vendor-b: EXW-to-DDP freight scales (7,800 + 950 insurance); its warranty shortfall is unpriced, so no line.
    assert _adder(results["vendor-b"], "PARAM-06") == 8750.0
    assert _adder(results["vendor-c"], "PARAM-06") == 2100.0  # all warranty months: unchanged


def test_negotiating_vendor_is_lowest_true_evaluated_price():
    # Amendment A2 (was: lowest headline, vendor-b at 418,000). True prices: a 452,000, c 454,000, b 482,800.
    assert engine.negotiating_vendor_id(sample_tender()) == "vendor-a"
    assert engine.apparent_low_bidder_id(sample_tender()) == "vendor-b"


def test_negotiating_vendor_ignores_unknown_price():
    tender = sample_tender({"vendor-a": 452000.0, "vendor-b": 0.0, "vendor-c": 439000.0})
    assert engine.negotiating_vendor_id(tender) == "vendor-a"
    assert engine.apparent_low_bidder_id(tender) == "vendor-c"


def test_concessions_only_for_negotiating_vendor():
    results = _financials(conceded=["PARAM-06"], closing_with="vendor-b")
    assert results["vendor-b"]["clawed_back_amount"] == 6150.0  # the priced incoterm class; the warranty has no price
    assert results["vendor-b"]["total_adders"] == 55500.0
    assert results["vendor-b"]["price_status"] == "PRICED"  # the unpriced cell was conceded, so nothing is left unpriced
    assert results["vendor-c"]["clawed_back_amount"] == 0.0
    assert results["vendor-c"]["total_adders"] == 15000.0


def test_legacy_extraction_uses_cost_adder():
    legacy = engine.ExtractedParameter(
        extracted_text="x", status=engine.ComplianceStatus.DEVIATION_DOWNGRADE, confidence=1.0,
        bbox="", snippet="", cost_adder=1234.5,
    )
    for settings in (engine.SensitivitySettings(), engine.SensitivitySettings(copper_multiplier=2.0)):
        assert engine.adder_amount(legacy, settings) == 1234.5


def test_override_replaces_adder_and_ignores_sliders():
    tender = sample_tender()
    settings = engine.SensitivitySettings(copper_multiplier=2.0)
    overrides = {("PARAM-02", "vendor-b"): engine.Override(adder_eur=Decimal("10000.00"), note="n")}
    base = _by_vendor(engine.evaluate_vendor_financials(tender, settings, []))
    over = _by_vendor(engine.evaluate_vendor_financials(tender, settings, [], overrides=overrides))
    row = _row(over["vendor-b"], "PARAM-02")
    assert row["adder_eur"] == 10000.0
    assert row["is_overridden"] is True
    assert row["override_note"] == "n"
    expected = base["vendor-b"]["true_evaluated_price"] - _adder(base["vendor-b"], "PARAM-02") + 10000.0
    assert over["vendor-b"]["true_evaluated_price"] == round(expected, 2)
    assert over["vendor-c"] == base["vendor-c"]  # keyed per (param, vendor): other vendors untouched


def test_override_counts_by_criticality():
    tender = sample_tender()
    overrides = {("PARAM-06", "vendor-a"): engine.Override(adder_eur=Decimal("2500.00"), note="freight quote")}
    result = _by_vendor(engine.evaluate_vendor_financials(tender, engine.SensitivitySettings(), [], overrides=overrides))
    assert result["vendor-a"]["total_commercial_adder"] == 2500.0
    assert result["vendor-a"]["total_tech_penalty"] == 0.0


def test_override_on_conceded_param_is_clawed_back():
    tender = sample_tender()
    overrides = {("PARAM-06", "vendor-b"): engine.Override(adder_eur=Decimal("4000.00"), note="n")}
    result = _by_vendor(engine.evaluate_vendor_financials(
        tender, engine.SensitivitySettings(), ["PARAM-06"], "vendor-b", overrides=overrides))
    assert result["vendor-b"]["clawed_back_amount"] == 4000.0
    assert result["vendor-b"]["total_adders"] == 55500.0


def test_no_overrides_unchanged():
    tender = sample_tender()
    settings = engine.SensitivitySettings()
    without = engine.evaluate_vendor_financials(tender, settings, ["PARAM-06"])
    with_none = engine.evaluate_vendor_financials(tender, settings, ["PARAM-06"], overrides=None)
    assert with_none == without
    for result in with_none:
        for row in result["itemized_breakdown"]:
            assert row["is_overridden"] is False
            assert row["override_note"] is None
