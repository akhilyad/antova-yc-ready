"""Rate-table pricing of deviations (spec §11)."""

from decimal import Decimal

import pytest

from samples import scenario
from specclaw_ingest.costs import load_rate_table, price
from specclaw_ingest.ontology import PARAMS_BY_ID
from specclaw_ingest.precedence import resolve
from specclaw_ingest.tests.helpers import QUANTITIES, evidence, priced, requirement

NON_ZERO = [
    (vendor_id, param_id, cell[4])
    for vendor_id, cells in scenario.CELLS.items()
    for param_id, cell in cells.items()
    if cell[4] != "0.00"
]


def _price_quote(param_id: str, quote: str, quantities=QUANTITIES):
    param = PARAMS_BY_ID[param_id]
    resolution = resolve(param, requirement(param_id), [evidence(param_id, "datasheet", 6, quote)], "vendor-x")
    return price(param, requirement(param_id), resolution, load_rate_table("mv_gis_switchgear_v2"), quantities)


# vendor-b offers 18 months from dispatch against 36 from commissioning, with no lag stated in the MR.
# Rate table v2 (strict) flags that warranty shortfall and leaves it unpriced; the EXW-to-DDP class is priced.
UNPRICED_CELLS = {("vendor-b", "PARAM-06")}


def test_ten_non_zero_cells():
    assert len(NON_ZERO) == 10


@pytest.mark.parametrize("vendor_id,param_id,adder", NON_ZERO)
def test_adders_match_spec(vendor_id, param_id, adder):
    _, pricing = priced(vendor_id, param_id)
    assert pricing.adder == Decimal(adder)
    assert pricing.pricing_status == ("UNPRICED" if (vendor_id, param_id) in UNPRICED_CELLS else "PRICED")


def test_totals():
    for vendor_id, total in (("vendor-b", "61650.00"), ("vendor-c", "15000.00"), ("vendor-a", "0.00")):
        assert sum(priced(vendor_id, p)[1].adder for p in PARAMS_BY_ID) == Decimal(total), vendor_id


def test_formula_param01():
    assert priced("vendor-b", "PARAM-01")[1].formula == "11 bays × €1,600.00 + 1 lot × €900.00"


def test_unpriced_current_short():
    pricing = _price_quote("PARAM-02", "Electrolytic copper Cu-ETP busbars rated 2000 A continuous.")
    assert pricing.pricing_status == "UNPRICED"
    assert pricing.adder == Decimal("0")
    assert pricing.unpriced_classes == ["PARAM-02.current_short"]


def test_unpriced_fca():
    pricing = _price_quote("PARAM-06", "Delivery FCA factory gate; warranty 36 months from commissioning.")
    assert pricing.pricing_status == "UNPRICED"
    assert pricing.unpriced_classes == ["PARAM-06.incoterm_fca_to_ddp"]
    assert pricing.adder == Decimal("0")


def test_missing_bay_count_unprices_bay_lines():
    no_bays = {k: v for k, v in QUANTITIES.items() if k != "tender.bay_count"}
    _, p01 = priced("vendor-b", "PARAM-01", no_bays)
    assert p01.pricing_status == "UNPRICED"
    assert p01.unpriced_classes == ["PARAM-01.ik_rating_short"]
    assert p01.adder == Decimal("0")
    _, p03 = priced("vendor-b", "PARAM-03", no_bays)
    assert p03.unpriced_classes == ["PARAM-03.ip_below_ip54"]
    assert p03.adder == Decimal("4500.00")  # the rear plenum line needs no bay count


def test_compliant_is_none():
    _, pricing = priced("vendor-a", "PARAM-01")
    assert pricing.pricing_status == "NONE"
    assert pricing.adder == Decimal("0")
    assert pricing.lines == [] and pricing.formula == ""


def test_rate_table_version():
    assert load_rate_table("mv_gis_switchgear_v1").version == "mv_gis_switchgear_v1"
    assert priced("vendor-b", "PARAM-05")[1].rate_table_version == "mv_gis_switchgear_v2"  # the sample's table


def test_cost_line_drivers():
    lines = priced("vendor-b", "PARAM-06")[1].lines
    assert {line.driver for line in lines} == {"freight", "fixed"}
    labour = [line for line in priced("vendor-b", "PARAM-04")[1].lines if line.driver == "labour"]
    assert len(labour) == 1 and labour[0].qty == Decimal("65") and labour[0].unit == "h"
