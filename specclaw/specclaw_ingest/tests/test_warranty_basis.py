"""Item 2c: a warranty is measured from somewhere. The engine never invents the gap between two start points."""

import pytest

from samples import mutate
from samples.scenario import manifest
from specclaw_engine import ComplianceStatus
from specclaw_ingest.costs import load_rate_table, price
from specclaw_ingest.ontology import PARAMS_BY_ID
from specclaw_ingest.pipeline import run_ingest
from specclaw_ingest.precedence import resolve
from specclaw_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected
from specclaw_ingest.tests.helpers import QUANTITIES, evidence
from specclaw_ingest.types import Citation
from specclaw_ingest.values import parse_commissioning_lag, parse_field

PARAM = PARAMS_BY_ID["PARAM-06"]
MR = "Delivery shall be DDP project site. The defect liability period shall be 36 months from commissioning."
LAG_CITATION = Citation("MR.pdf", 14, (1.0, 2.0, 3.0, 4.0),
                        "Commissioning is planned 6 months after delivery.", "mr_spec")
LAG = {"months": 6, "from": "delivery", "citation": LAG_CITATION.to_dict()}


def _requirement(text: str = MR):
    return evidence("PARAM-06", "mr_spec", 14, text).values


def _resolve(bid: str, lag=None, policy="strict", mr: str = MR):
    return resolve(PARAM, _requirement(mr), [evidence("PARAM-06", "commercial", 21, bid)], "vendor-x",
                   lag=lag, warranty_policy=policy)


def _warranty(resolution):
    return next(c for c in resolution.checks if c.field == "warranty_months")


@pytest.mark.parametrize("text, basis", [
    ("standard warranty 18 months from dispatch", "dispatch"),
    ("warranty 18 months from the date of shipment", "dispatch"),
    ("warranty of 24 months after delivery to site", "delivery"),
    ("warranty 24 months from commissioning", "commissioning"),
    ("defect liability period of 24 months from taking-over", "commissioning"),
    ("a 36-month defect liability period", "unspecified"),
])
def test_warranty_basis_is_read_with_the_months(text, basis):
    value = parse_field("months", text, "warranty_months")
    assert value.qualifier == basis and value.display == text.split("month")[0].split()[-1].rstrip("-")


def test_same_basis_compares_as_before():
    r = _resolve("Delivery DDP site; warranty 24 months from commissioning.")
    check = _warranty(r)
    assert (check.passed, check.comparable, check.required_basis, check.offered_basis) == (
        False, True, "commissioning", "commissioning")
    assert r.flags == []
    pricing = price(PARAM, _requirement(), r, load_rate_table("mv_gis_switchgear_v2"), QUANTITIES)
    assert pricing.pricing_status == "PRICED" and pricing.adder == 12 * 175


def test_unspecified_basis_compares_as_before_and_is_recorded():
    r = _resolve("Delivery DDP site with a 36-month defect liability period.")
    assert r.status == ComplianceStatus.COMPLIANT and r.flags == []
    assert _warranty(r).offered_basis == "unspecified"


def test_different_basis_without_an_mr_duration_is_flagged_and_unpriced():
    r = _resolve("Delivery DDP site; standard warranty 18 months from dispatch.")
    check = _warranty(r)
    assert (check.passed, check.comparable) == (False, False)
    assert r.status == ComplianceStatus.DEVIATION_DOWNGRADE
    assert [f["code"] for f in r.flags] == ["WARRANTY_BASIS"]
    assert "from dispatch" in r.flags[0]["message"] and "from commissioning" in r.flags[0]["message"]
    pricing = price(PARAM, _requirement(), r, load_rate_table("mv_gis_switchgear_v2"), QUANTITIES)
    assert pricing.pricing_status == "UNPRICED"
    assert pricing.unpriced_classes == ["PARAM-06.warranty_basis_unresolved"]
    assert pricing.adder == 0  # no 6-month guess, and no months-only shortfall presented as the price


def test_equal_months_on_an_earlier_basis_is_not_compliant():
    r = _resolve("Delivery DDP site; warranty 36 months from dispatch.")
    assert r.status == ComplianceStatus.DEVIATION_DOWNGRADE and not _warranty(r).comparable


def test_a_later_start_with_enough_months_passes_without_conversion():
    r = _resolve("Delivery DDP site; warranty 36 months from commissioning.",
                 mr="Delivery shall be DDP project site. The warranty shall be 36 months from delivery.")
    assert r.status == ComplianceStatus.COMPLIANT and r.flags == []


def test_mr_duration_converts_and_is_shown_as_the_assumption():
    r = _resolve("Delivery DDP site; warranty 36 months from delivery.", lag=LAG)
    check = _warranty(r)
    assert (check.passed, check.comparable, check.offered_equivalent) == (False, True, 30)
    assert [f["code"] for f in r.flags] == ["WARRANTY_BASIS_CONVERTED"]
    assert "MR p.14" in r.flags[0]["message"] and "6 months" in r.flags[0]["message"]
    pricing = price(PARAM, _requirement(), r, load_rate_table("mv_gis_switchgear_v2"), QUANTITIES)
    assert pricing.pricing_status == "PRICED" and pricing.adder == 6 * 175


def test_mr_duration_from_another_start_point_does_not_convert():
    r = _resolve("Delivery DDP site; warranty 36 months from dispatch.", lag=LAG)  # the MR speaks of delivery
    assert not _warranty(r).comparable and [f["code"] for f in r.flags] == ["WARRANTY_BASIS"]


def test_months_only_policy_is_todays_behaviour_with_the_basis_recorded():
    r = _resolve("Delivery DDP site; standard warranty 18 months from dispatch.", policy="months_only")
    check = _warranty(r)
    assert (check.passed, check.comparable, check.offered_basis) == (False, True, "dispatch")
    assert r.flags == []
    pricing = price(PARAM, _requirement(), r, load_rate_table("mv_gis_switchgear_v1"), QUANTITIES)
    assert pricing.pricing_status == "PRICED" and pricing.adder == 18 * 175


@pytest.mark.parametrize("text, expected", [
    ("Commissioning is planned 6 months after delivery.", (6, "delivery")),
    ("Site commissioning will take place 4 months from dispatch of the equipment.", (4, "dispatch")),
    ("A period of 9 months between delivery and commissioning shall be assumed.", (9, "delivery")),
    ("The defect liability period shall be 36 months from commissioning.", None),
    ("Delivery is required 6 months after order.", None),
])
def test_commissioning_lag_is_read_only_when_the_mr_states_it(text, expected):
    assert parse_commissioning_lag(text) == expected


def test_rate_tables_declare_their_warranty_policy():
    assert load_rate_table("mv_gis_switchgear_v1").policies["warranty_basis"] == "months_only"
    assert load_rate_table("mv_gis_switchgear_v2").policies["warranty_basis"] == "strict"


def _cells(tender):
    return {(vid, p.id): cell for p in tender.parameters for vid, cell in p.vendors.items()}


def test_the_sample_is_evaluated_with_the_strict_table():
    assert manifest()["rate_table"] == "mv_gis_switchgear_v2"
    assert load_rate_table("mv_gis_switchgear_v2").policies["warranty_basis"] == "strict"


def test_sample_flags_and_unprices_the_dispatch_warranty():
    """The base pack: VoltSwitch offers 18 months from dispatch against 36 from commissioning, and the MR states
    no duration between the two. The shortfall is flagged and unpriced; the EXW-to-DDP class is still priced."""
    expected = load_expected()
    want = expected["cells"]["vendor-b"]["PARAM-06"]
    assert (want["adder"], want["pricing_status"], want["flags_include"]) == ("6150.00", "UNPRICED", ["from dispatch"])
    assert expected["vendors"]["vendor-b"]["price_status"] == "UNPRICED_ITEMS"
    result = run_ingest(PACK, locator=AnswerKeyLocator(expected))
    cell = _cells(result.tender)[("vendor-b", "PARAM-06")]
    assert cell.status == ComplianceStatus.DEVIATION_DOWNGRADE
    assert (cell.pricing_status, cell.cost_adder) == ("UNPRICED", 6150.0)  # the incoterm class is still priced
    assert [f["code"] for f in cell.flags] == ["WARRANTY_BASIS"]
    other = _cells(result.tender)[("vendor-c", "PARAM-06")]  # 24 months from commissioning: same basis
    assert (other.pricing_status, other.cost_adder, other.flags) == ("PRICED", 2100.0, [])


def test_mr_stated_duration_is_found_and_cited_in_the_pipeline(tmp_path):
    pack = mutate.base_pack()
    pack.doc(pack.mr_file).pages[13].blocks.append(("p", "Commissioning is planned 6 months after dispatch."))
    result = run_ingest(mutate.write(pack, tmp_path), locator=AnswerKeyLocator(pack.expected))
    cell = _cells(result.tender)[("vendor-b", "PARAM-06")]
    assert [f["code"] for f in cell.flags] == ["WARRANTY_BASIS_CONVERTED"]
    assert "MR p.14" in cell.flags[0]["message"]
    # 18 months from dispatch less 6 = 12 from commissioning; shortfall 24 x 175 = 4200, plus EXW to DDP 6150.
    assert (cell.pricing_status, cell.cost_adder) == ("PRICED", 10350.0)
