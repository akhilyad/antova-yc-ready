"""Evidence precedence and compliance status (spec §10)."""

from samples import scenario
from specclaw_engine import ComplianceStatus as S
from specclaw_ingest.ontology import PARAMS_BY_ID
from specclaw_ingest.precedence import merge_requirement, resolve
from specclaw_ingest.types import Citation, Evidence
from specclaw_ingest.values import parse_field


def ev(param_id: str, section: str, page: int, quote: str) -> Evidence:
    param = PARAMS_BY_ID[param_id]
    values = {}
    for f in param.fields:
        value = parse_field(f.kind, quote, f.name)
        if value is not None:
            values[f.name] = value
    return Evidence(param_id, Citation("test.pdf", page, (10.0, 20.0, 30.0, 40.0), quote, section), values)


def key(name: str, section: str) -> Evidence:
    e = scenario._EV_BY_KEY[name]
    return ev(e.param_id, section, e.page, e.text)


def requirement(param_id: str):
    mr = [ev(param_id, "mr_spec", e.page, e.text) for e in scenario.MR_EVIDENCE if e.param_id == param_id]
    return merge_requirement(PARAMS_BY_ID[param_id], mr)


def run(param_id: str, evidence: list[Evidence]):
    return resolve(PARAMS_BY_ID[param_id], requirement(param_id), evidence, "vendor-x")


def test_compliant_nordwerk_p01():
    r = run("PARAM-01", [key("a.p01", "datasheet")])
    assert r.status == S.COMPLIANT
    assert r.primary.page == 6
    assert r.extracted_text == "50 kA (3 s)"
    assert r.confidence == 1.0
    assert r.secondary is None and r.conflict_note is None


def test_voltswitch_p01_conflict():
    r = run("PARAM-01", [key("b.p01", "drawing"), key("b.p01sec", "cover_letter")])
    assert r.status == S.CONFLICT_DOWNGRADE
    assert r.primary.page == 11
    assert r.secondary.page == 2
    assert r.conflict_note == "Cover letter p.2 claims 50 kA / 3 s; Drawing p.11 states 31.5 kA / 1 s. Drawing governs."
    assert len(r.checks) == 2
    assert all(c.passed is False for c in r.checks)
    assert r.checks[0].citation_ref == "test.pdf#p11"
    assert r.confidence == 0.9


def test_voltswitch_p04_conflict():
    r = run("PARAM-04", [key("b.p04", "bom"), key("b.p04sec", "compliance_table")])
    assert r.status == S.CONFLICT_DOWNGRADE
    assert r.conflict_note == (
        "Compliance table p.3 claims IEC 61850 Ed. 2 with PRP; BOM p.15 states not IEC 61850. BOM governs.")


def test_fat_zero_is_omitted():
    r = run("PARAM-05", [key("b.p05", "test_plan")])
    assert r.status == S.OMITTED
    assert r.confidence == 1.0


def test_fat_partial_is_deviation():
    assert run("PARAM-05", [key("c.p05", "test_plan")]).status == S.DEVIATION_DOWNGRADE


def test_deltaport_p01_agreeing_tiers():
    r = run("PARAM-01", [key("c.p01", "datasheet"), key("c.p01sec", "compliance_table")])
    assert r.status == S.DEVIATION_DOWNGRADE
    assert r.secondary is None
    assert r.primary.page == 6


def test_no_evidence_is_manual():
    r = run("PARAM-01", [])
    assert r.status == S.MANUAL_INSPECTION_REQUIRED
    assert r.primary is None
    assert r.extracted_text == "— (—)"
    assert r.confidence == 0.0
    assert r.checks == []


def test_missing_field_without_failure_is_manual():
    r = run("PARAM-02", [ev("PARAM-02", "datasheet", 6, "Main busbars made of electrolytic copper throughout.")])
    assert r.status == S.MANUAL_INSPECTION_REQUIRED


def test_missing_field_with_failure_is_deviation():
    r = run("PARAM-02", [ev("PARAM-02", "datasheet", 6, "Busbars made from aluminium alloy profiles.")])
    assert r.status == S.DEVIATION_DOWNGRADE


def test_same_tier_disagreement():
    r = run("PARAM-01", [
        ev("PARAM-01", "datasheet", 6, "Rated short-time withstand current: 50 kA / 3 s."),
        ev("PARAM-01", "datasheet", 7, "Short-time withstand current 50 kA for 1 s."),
    ])
    assert r.status == S.CONFLICT_DOWNGRADE
    assert r.governing["ik_duration"][0].display == "1 s"
    assert r.primary.page == 7
    assert r.secondary.page == 6


def test_merge_requirement_param06():
    req = requirement("PARAM-06")
    assert req["incoterm"].display == "DDP"
    assert req["warranty_months"].display == "36"


def test_canonical_units_in_checks():
    r = run("PARAM-08", [key("c.p08", "datasheet")])
    assert r.status == S.COMPLIANT
    assert r.checks[0].offered == "104 °F"
    assert r.checks[0].offered_canonical == "40 °C"
    assert r.checks[0].required == "40 °C"
