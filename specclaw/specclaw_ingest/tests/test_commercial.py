"""WP5: commercial correctness. Prices are never guessed, never zeroed and always carry a status."""

import copy
import json
from decimal import Decimal

import pytest

import specclaw_engine as engine
from samples import mutate
from specclaw_ingest import config, costs
from specclaw_ingest.costs import ConfigError, RateLine, load_rate_table, parse_rate_table
from specclaw_ingest.ontology import PARAMETERS
from specclaw_ingest.pipeline import _implausible_headlines, run_ingest
from specclaw_ingest.tests.fakes import AnswerKeyLocator
from specclaw_ingest.tests.helpers import sample_tender
from specclaw_ingest.values import read_price

V1 = "mv_gis_switchgear_v1"


def _by_vendor(financials):
    return {f["vendor_id"]: f for f in financials}


def _evaluate(tender, **sliders):
    return _by_vendor(engine.evaluate_vendor_financials(tender, engine.SensitivitySettings(**sliders), []))


def _ingest(operators, tmp_path, seed=0):
    target = mutate.generate(operators, tmp_path, seed)
    expected = json.loads((target / "expected.json").read_text(encoding="utf-8"))
    return run_ingest(target, locator=AnswerKeyLocator(expected)), expected


def _raw_table() -> dict:
    return json.loads((costs.RATES_DIR / f"{V1}.json").read_text(encoding="utf-8"))


# --- unknown prices are null, with a status ------------------------------------------

def test_unknown_headline_is_null_everywhere_never_zero():
    tender = sample_tender({"vendor-a": 452000.0, "vendor-b": None, "vendor-c": 439000.0})
    row = _evaluate(tender)["vendor-b"]
    assert row["headline_price"] is None
    assert row["true_evaluated_price"] is None
    assert (row["true_evaluated_low"], row["true_evaluated_high"]) == (None, None)
    assert row["price_status"] == "NO_HEADLINE"
    assert row["total_adders"] == 61650.0  # the adders are known and still shown (the warranty is unpriced under v2)


def test_legacy_zero_headline_is_treated_as_unknown():
    tender = sample_tender({"vendor-a": 452000.0, "vendor-b": 0.0, "vendor-c": 439000.0})
    row = _evaluate(tender)["vendor-b"]
    assert (row["headline_price"], row["true_evaluated_price"], row["price_status"]) == (None, None, "NO_HEADLINE")


def test_every_price_row_carries_a_status():
    rows = _evaluate(sample_tender())
    for vendor_id, row in rows.items():
        # vendor-b's dispatch warranty has no price under v2, so its total is a lower bound.
        assert row["price_status"] == ("UNPRICED_ITEMS" if vendor_id == "vendor-b" else "PRICED")
        assert row["currency"] == "EUR"
        allowed = ("PRICED", "NONE", "UNPRICED") if vendor_id == "vendor-b" else ("PRICED", "NONE")
        assert all(item["pricing_status"] in allowed for item in row["itemized_breakdown"])
    unpriced = [i["param_id"] for i in rows["vendor-b"]["itemized_breakdown"] if i["pricing_status"] == "UNPRICED"]
    assert unpriced == ["PARAM-06"]


def test_missing_headline_pack_has_a_null_price_and_a_status(tmp_path):
    result, expected = _ingest(["missing_headline"], tmp_path)
    vendor_id = next(v for v, want in expected["vendors"].items() if want["headline_price"] is None)
    vendor = next(v for v in result.tender.vendors if v.id == vendor_id)
    assert vendor.headline_price is None and vendor.headline_status == "NOT_FOUND"
    payload = result.tender.model_dump(mode="json")
    assert next(v for v in payload["vendors"] if v["id"] == vendor_id)["headline_price"] is None


# --- reading a price: amount, currency, basis ------------------------------------------

@pytest.mark.parametrize("text, amount, currency", [
    ("Total lump-sum price for the complete scope: €418,000", "418000", "EUR"),
    ("Total price EUR 418.000,00 excluding VAT", "418000.00", "EUR"),
    ("Total lump-sum price: USD 455,000", "455000", "USD"),
    ("Total lump-sum price: $455,000.50", "455000.50", "USD"),
    ("Gesamtpreis 418.000 EUR", "418000", "EUR"),
    ("Total price: 3 950 000 SEK", "3950000", "SEK"),
    ("Total lump-sum price for the complete scope: 418,000", "418000", None),
])
def test_price_is_read_with_its_currency(text, amount, currency):
    read = read_price(text)
    assert (read.amount, read.currency) == (Decimal(amount), currency)


def test_price_without_a_number_or_in_shorthand_is_not_read():
    assert read_price("Prices are fixed and firm for the scope described in this offer.") is None
    assert read_price("Total price: €452k") is None


@pytest.mark.parametrize("text, basis", [
    ("Price per bay: €38,000", "per bay"),
    ("Unit price €38,000 each", "each"),
    ("€38,000 per panel, 11 panels", "per panel"),
    ("Price: €38,000 per unit", "per unit"),
    ("Total lump-sum price for the complete scope: €418,000", None),
])
def test_per_unit_basis_is_detected(text, basis):
    assert read_price(text).per_unit == basis


def test_per_bay_headline_is_reported_as_read_with_a_warning(tmp_path):
    result, expected = _ingest(["per_bay_headline"], tmp_path)
    vendor_id = expected["per_unit_headline"]
    vendor = next(v for v in result.tender.vendors if v.id == vendor_id)
    assert vendor.headline_price == 38000.0  # as read: a person corrects it, the pipeline does not
    assert any(w.startswith(f"{vendor_id}: headline price") and "per bay" in w for w in result.warnings)
    assert any(w.startswith(f"{vendor_id}: headline price") and "median" in w for w in result.warnings)


# --- headline plausibility: 50% from the median of the others ----------------------------

def test_headline_more_than_half_away_from_the_median_is_flagged():
    assert _implausible_headlines({"a": 452000.0, "b": 439000.0, "c": 890000.0})[0].startswith("c:")
    assert _implausible_headlines({"a": 452000.0, "b": 439000.0, "c": 200000.0})[0].startswith("c:")
    assert _implausible_headlines({"a": 452000.0, "b": 439000.0, "c": 418000.0}) == []
    assert _implausible_headlines({"a": 452000.0, "b": 439000.0, "c": 600000.0}) == []  # +35%
    assert _implausible_headlines({"a": 452000.0, "b": None, "c": None}) == []


# --- currency ---------------------------------------------------------------------------

def test_foreign_currency_without_an_fx_rate_is_unpriced(tmp_path):
    result, expected = _ingest(["currency_mismatch"], tmp_path)
    vendor_id = expected["foreign_currency"]["vendor_id"]
    vendor = next(v for v in result.tender.vendors if v.id == vendor_id)
    assert (vendor.headline_price, vendor.headline_status, vendor.currency) == (None, "FX_MISSING", "USD")
    assert vendor.headline_original == expected["foreign_currency"]["amount"]
    row = _by_vendor(engine.evaluate_vendor_financials(result.tender, engine.SensitivitySettings(), []))[vendor_id]
    assert (row["true_evaluated_price"], row["price_status"]) == (None, "FX_MISSING")
    assert any(f"{vendor_id}: headline price is in USD" in w for w in result.warnings)


def test_dated_fx_rate_converts_and_is_recorded():
    table = parse_rate_table({**_raw_table(), "fx_rates": {"USD": {"rate": "0.92", "date": "2026-11-03"}}})
    converted = costs.convert(Decimal("455000"), "USD", table)
    assert converted == {"amount": Decimal("418600.00"), "rate": Decimal("0.92"), "date": "2026-11-03"}
    assert costs.convert(Decimal("455000"), "GBP", table) is None
    assert costs.convert(Decimal("418000"), "EUR", table) == {"amount": Decimal("418000"), "rate": None, "date": None}


def test_fx_rate_needs_a_date():
    with pytest.raises(ConfigError, match="date"):
        parse_rate_table({**_raw_table(), "fx_rates": {"USD": {"rate": "0.92"}}})


# --- config fails at load ------------------------------------------------------------------

def test_shipped_configuration_is_valid():
    config.validate_config()


def test_every_ontology_field_has_a_parser_a_rule_a_class_and_rate_lines():
    for name in config.rate_table_names():
        table = load_rate_table(name)
        for param in PARAMETERS:
            for f in param.fields:
                assert f.kind in config.PARSED_KINDS, (param.id, f.name)
                assert f.operator in config.OPERATORS, (param.id, f.name)
                for cls in costs.classes_for_field(param, f):
                    assert cls in table.deviation_rates or cls in table.unpriced_classes, (name, cls)


def test_field_without_a_class_fails_at_load(monkeypatch):
    monkeypatch.delitem(costs._CLASS_SUFFIX, ("PARAM-07", "rated_voltage"))
    with pytest.raises(ConfigError, match="PARAM-07.*rated_voltage.*deviation class"):
        config.validate_config()


def test_class_with_neither_rates_nor_an_unpriced_declaration_fails_at_load():
    raw = _raw_table()
    raw["unpriced_classes"].remove("PARAM-07.voltage_short")
    with pytest.raises(ConfigError, match="PARAM-07.voltage_short"):
        config.validate_table(parse_rate_table(raw))


def test_broken_rate_table_fails_at_load_with_a_clear_message():
    raw = _raw_table()
    del raw["base_labour_rate"]
    with pytest.raises(ConfigError, match="base_labour_rate"):
        parse_rate_table(raw)
    raw = _raw_table()
    raw["deviation_rates"]["PARAM-04.marshalling_not_prewired"][0]["rate"] = "75.00"
    with pytest.raises(ConfigError, match="labour.*base_labour_rate"):
        parse_rate_table(raw)
    raw = _raw_table()
    raw["deviation_rates"]["PARAM-03.iac_not_aflr"][0].update({"low": "5000.00", "high": "6000.00"})
    with pytest.raises(ConfigError, match="low"):
        parse_rate_table(raw)
    raw = _raw_table()
    raw["deviation_rates"]["PARAM-03.iac_not_aflr"][0]["qty"] = "site.unknown_quantity"
    with pytest.raises(ConfigError, match="site.unknown_quantity"):
        parse_rate_table(raw)


def test_ingest_fails_before_any_work_on_a_config_gap(monkeypatch, tmp_path):
    from specclaw_ingest.pipeline import IngestFailed
    from specclaw_ingest.tests.fakes import PACK, load_expected

    monkeypatch.delitem(costs._CLASS_SUFFIX, ("PARAM-08", "max_ambient"))
    config.reset()
    locator = AnswerKeyLocator(load_expected())
    with pytest.raises(IngestFailed, match="ConfigError.*PARAM-08"):
        run_ingest(PACK, locator=locator)
    assert locator.calls == []  # nothing was located: the gap was caught at startup
    monkeypatch.undo()
    config.reset()


def test_missing_incoterm_pair_is_still_unpriced_at_run_time(tmp_path):
    result, expected = _ingest(["unpriced_class"], tmp_path)
    cell = next(p for p in result.tender.parameters if p.id == "PARAM-02").vendors[expected["unpriced_class"]["vendor_id"]]
    assert cell.pricing_status == "UNPRICED" and cell.cost_adder == 0.0
    assert expected["unpriced_class"]["class"] in {c for item in result.stats["unpriced_items"] for c in item["classes"]}


# --- labour: the table declares its rate, the slider overrides it ----------------------------

def _labour_tender(rate: str):
    tender = sample_tender()
    for p in tender.parameters:
        for cell in p.vendors.values():
            for line in cell.cost_lines:
                if line.driver == "labour":
                    line.rate = Decimal(rate)
    return tender


def _param04(tender, **sliders):
    row = _evaluate(tender, **sliders)["vendor-c"]
    return next(i["adder_eur"] for i in row["itemized_breakdown"] if i["param_id"] == "PARAM-04")


def test_table_declares_its_base_labour_rate():
    table = load_rate_table(V1)
    assert table.base_labour_rate == Decimal("60.00")
    labour = [l for lines in table.deviation_rates.values() for l in lines if l.driver == "labour"]
    assert labour and all(l.rate == table.base_labour_rate for l in labour)


def test_default_slider_uses_the_table_rate():
    assert engine.SensitivitySettings().site_labor_rate is None
    assert _param04(sample_tender()) == 4100.0          # 65 h x 60 + 200
    assert _param04(_labour_tender("80.00")) == 5400.0  # 65 h x 80 + 200


def test_slider_overrides_the_table_rate():
    assert _param04(sample_tender(), site_labor_rate=75.0) == 5075.0          # 65 h x 75 + 200
    assert _param04(_labour_tender("80.00"), site_labor_rate=75.0) == 5075.0  # the slider replaces the 80


# --- adder ranges and the rank-flip warning ---------------------------------------------------

def test_rate_line_range_defaults_to_its_base():
    line = next(iter(load_rate_table(V1).deviation_rates["PARAM-03.iac_not_aflr"]))
    assert (line.low, line.rate, line.high) == (Decimal("4500.00"), Decimal("4500.00"), Decimal("4500.00"))


def test_financials_report_the_range_per_vendor():
    rows = _evaluate(sample_tender())
    for row in rows.values():  # v1 declares no ranges, so low = base = high
        assert row["total_adders_low"] == row["total_adders"] == row["total_adders_high"]
        assert row["true_evaluated_low"] == row["true_evaluated_price"] == row["true_evaluated_high"]


def _with_ranges(tender, low: str, high: str):
    tender = copy.deepcopy(tender)
    for p in tender.parameters:
        for cell in p.vendors.values():
            for line in cell.cost_lines:
                line.rate_low = (line.rate * Decimal(low)).quantize(Decimal("0.01"))
                line.rate_high = (line.rate * Decimal(high)).quantize(Decimal("0.01"))
    return tender


def test_ranges_flow_from_the_cost_lines():
    row = _evaluate(_with_ranges(sample_tender(), "0.8", "1.5"))["vendor-c"]
    assert (row["total_adders_low"], row["total_adders"], row["total_adders_high"]) == (12000.0, 15000.0, 22500.0)
    assert (row["true_evaluated_low"], row["true_evaluated_high"]) == (451000.0, 461500.0)
    item = next(i for i in row["itemized_breakdown"] if i["param_id"] == "PARAM-01")
    assert (item["adder_low_eur"], item["adder_eur"], item["adder_high_eur"]) == (4960.0, 6200.0, 9300.0)


def test_rank_flip_warning_when_the_lowest_vendor_could_change():
    stable = engine.evaluate_vendor_financials(sample_tender(), engine.SensitivitySettings(), [])
    assert engine.rank_flip(stable) is None  # 452,000 / 454,000 / 482,800 with zero-width ranges
    wide = engine.evaluate_vendor_financials(_with_ranges(sample_tender(), "0.8", "1.5"), engine.SensitivitySettings(), [])
    flip = engine.rank_flip(wide)
    # vendor-a is 452,000 with no adders; vendor-c could be as low as 451,000.
    assert flip["lowest"] == "vendor-a" and flip["could_be"] == ["vendor-c"]
    assert "not stable" in flip["message"]


def test_rank_flip_ignores_vendors_without_a_full_price():
    tender = _with_ranges(sample_tender({"vendor-a": 452000.0, "vendor-b": 418000.0, "vendor-c": None}), "0.8", "1.5")
    assert engine.rank_flip(engine.evaluate_vendor_financials(tender, engine.SensitivitySettings(), [])) is None


def test_ranges_reach_the_cost_lines_from_a_table_that_declares_them():
    raw = _raw_table()
    raw["deviation_rates"]["PARAM-03.iac_not_aflr"][0].update({"low": "3500.00", "high": "6500.00"})
    line = parse_rate_table(raw).deviation_rates["PARAM-03.iac_not_aflr"][0]
    assert isinstance(line, RateLine) and (line.low, line.high) == (Decimal("3500.00"), Decimal("6500.00"))
