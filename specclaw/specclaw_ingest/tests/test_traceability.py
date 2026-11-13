"""WP4: every number shown carries its own citation. Amendment A3: OMITTED keeps the conflicting claim."""

from specclaw_engine import ComplianceStatus
from specclaw_ingest.ontology import PARAMS_BY_ID
from specclaw_ingest.pipeline import run_ingest
from specclaw_ingest.precedence import resolve
from specclaw_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected
from specclaw_ingest.tests.helpers import evidence, requirement


def test_each_field_is_attributed_to_its_own_page():
    """Tier 1 p.11 gives Ik 31.5 kA; Tier 2 p.3 gives the duration. Neither page states both."""
    drawing = evidence("PARAM-01", "drawing", 11, "NOTE 7: Short-time withstand current of the standard bay 31.5 kA.")
    table = evidence("PARAM-01", "compliance_table", 3, "Short-time withstand duration 3 s - Complied")
    r = resolve(PARAMS_BY_ID["PARAM-01"], requirement("PARAM-01"), [drawing, table], "vendor-x")
    by_field = {s["field"]: s for s in r.segments}
    assert (by_field["ik"]["text"], by_field["ik"]["citation"]["page"]) == ("31.5 kA", 11)
    assert (by_field["ik_duration"]["text"], by_field["ik_duration"]["citation"]["page"]) == ("3 s", 3)
    assert r.extracted_text == "31.5 kA (3 s)"
    assert r.assembled_from == "assembled from p.11 and p.3"


def test_single_source_cell_is_not_called_assembled():
    sheet = evidence("PARAM-01", "datasheet", 6, "Rated short-time withstand current: 50 kA / 3 s.")
    r = resolve(PARAMS_BY_ID["PARAM-01"], requirement("PARAM-01"), [sheet], "vendor-x")
    assert r.assembled_from is None
    assert [s["citation"]["page"] for s in r.segments] == [6, 6]


def test_segments_cover_exactly_the_values_shown():
    sheet = evidence("PARAM-02", "datasheet", 6, "Main busbars of electrolytic copper Cu-ETP.")
    r = resolve(PARAMS_BY_ID["PARAM-02"], requirement("PARAM-02"), [sheet], "vendor-x")
    assert [s["field"] for s in r.segments] == ["material"]  # the current is not stated, so it has no segment
    assert "—" in r.extracted_text


def test_same_tier_conflict_keeps_the_overridden_citation():
    passing = evidence("PARAM-07", "datasheet", 6, "Rated voltage Ur: 36 kV.")
    failing = evidence("PARAM-07", "datasheet", 8, "Rated voltage Ur: 24 kV.")
    r = resolve(PARAMS_BY_ID["PARAM-07"], requirement("PARAM-07"), [passing, failing], "vendor-x")
    assert r.status == ComplianceStatus.CONFLICT_DOWNGRADE
    assert (r.primary.page, r.secondary.page) == (8, 6)


def test_omitted_keeps_the_conflicting_claim_as_secondary():
    """A3: the status order is unchanged (OMITTED outranks CONFLICT); the overridden claim is no longer dropped."""
    claim = evidence("PARAM-05", "cover_letter", 2, "The price includes a 5-day client-witnessed I-FAT.")
    plan = evidence("PARAM-05", "test_plan", 18, "Witnessed FAT charged extra at €1,300/day plus test bay setup.")
    r = resolve(PARAMS_BY_ID["PARAM-05"], requirement("PARAM-05"), [claim, plan], "vendor-x")
    assert r.status == ComplianceStatus.OMITTED
    assert (r.primary.page, r.secondary.page) == (18, 2)
    assert "Cover letter p.2 claims 5" in r.conflict_note


def test_omitted_without_a_claim_has_no_secondary():
    plan = evidence("PARAM-05", "test_plan", 18, "Witnessed FAT charged extra at €1,300/day plus test bay setup.")
    r = resolve(PARAMS_BY_ID["PARAM-05"], requirement("PARAM-05"), [plan], "vendor-x")
    assert (r.status, r.secondary, r.conflict_note) == (ComplianceStatus.OMITTED, None, None)


def test_api_cells_carry_segments_and_field_citations():
    result = run_ingest(PACK, locator=AnswerKeyLocator(load_expected()))
    cell = next(p for p in result.tender.parameters if p.id == "PARAM-01").vendors["vendor-b"]
    assert {s["field"] for s in cell.segments} == {"ik", "ik_duration"} == set(cell.field_citations)
    assert all(c["page"] == 11 for c in cell.field_citations.values())
    for p in result.tender.parameters:
        for c in p.vendors.values():
            shown = [s["text"] for s in c.segments]
            assert all(text in c.extracted_text for text in shown)
            assert len(shown) == len(c.field_citations)
