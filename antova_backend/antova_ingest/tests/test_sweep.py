"""WP2: the recall sweep, the sweep's asymmetry in precedence, evidence strength, the locator contract."""

import json

import pytest

from antova_engine import ComplianceStatus
from antova_ingest import extract, sweep
from antova_ingest.ontology import PARAMETERS, PARAMS_BY_ID
from antova_ingest.parse import normalize
from antova_ingest.pipeline import run_ingest
from antova_ingest.precedence import resolve
from antova_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected
from antova_ingest.tests.helpers import evidence, requirement
from antova_ingest.types import DocumentEntry, PageText, ParsedDocument, Word

VOLTSWITCH = "Bid_vendor-b_VoltSwitch.pdf"


def _squash(text: str) -> str:
    return "".join(normalize(text).split())


@pytest.fixture(scope="module")
def expected():
    return load_expected()


@pytest.fixture(scope="module")
def result(expected):
    return run_ingest(PACK, locator=AnswerKeyLocator(expected))


def _cells(tender):
    return {(vid, p.id): cell for p in tender.parameters for vid, cell in p.vendors.items()}


def _doc(paragraphs: list[str], section: str = "datasheet", page: int = 1) -> ParsedDocument:
    """A one-page bid: each paragraph is one text block, laid out top to bottom."""
    words, lines = [], []
    for block, paragraph in enumerate(paragraphs):
        for index, token in enumerate(paragraph.split()):
            words.append(Word(50.0 + 6 * index, 100.0 + 20 * block, 55.0 + 6 * index, 110.0 + 20 * block,
                              token, block, 0))
        lines.append(paragraph)
    entry = DocumentEntry(file="bid.pdf", role="vendor_bid", vendor_id="vendor-x")
    return ParsedDocument(entry, "0" * 64, [PageText(page, "\n".join(lines), words, section=section)])


def sweep_ev(param_id: str, section: str, page: int, quote: str):
    e = evidence(param_id, section, page, quote)
    e.source = "sweep"
    return e


# --- the sweep finds passages ---------------------------------------------------

def test_every_parameter_has_sweep_terms():
    for param in PARAMETERS:
        assert param.sweep_terms, param.id


def test_sweep_refinds_every_answer_key_passage(result, expected):
    """Recall 100% on TENDER-2026-402: bids and the MR."""
    hits = json.loads(result.artifacts["verified"].body)["sweep_hits"]
    missed = []
    for filename, ideal in expected["ideal_locate"].items():
        for candidate in ideal["candidates"]:
            want = _squash(candidate["quote"])
            found = any(
                h["param_id"] == candidate["param_id"] and h["page"] == candidate["page"]
                and (_squash(h["quote"]) in want or want in _squash(h["quote"]))
                for h in hits[filename])
            if not found:
                missed.append((filename, candidate["param_id"], candidate["page"]))
    assert missed == []
    assert result.stats["sweep_recall"] == 1.0


def test_sweep_changes_nothing_on_the_sample(result, expected):
    """No new candidate, no sweep flag, no status change on TENDER-2026-402.

    The one flag on the sample is not the sweep's: rate table v2 flags VoltSwitch's warranty measured from dispatch.
    """
    assert result.stats["sweep_new_candidates"] == 0
    for (vendor_id, param_id), cell in _cells(result.tender).items():
        codes = [f["code"] for f in cell.flags]
        assert codes == (["WARRANTY_BASIS"] if (vendor_id, param_id) == ("vendor-b", "PARAM-06") else []), (vendor_id, param_id)
        assert cell.status.value == expected["cells"][vendor_id][param_id]["status"]


def test_sweep_finds_a_rating_stated_without_a_keyword():
    doc = _doc(["NOTE 7: Standard switchgear bay rated 31.5kA 1s. 50kA high-duty upgrade excluded from base price."],
               section="drawing")
    hits = [h for h in sweep.sweep_document(doc) if h.param_id == "PARAM-01"]
    assert [h.citation.quote for h in hits] == ["NOTE 7: Standard switchgear bay rated 31.5kA 1s."]


def test_sweep_ignores_the_arc_test_current():
    doc = _doc(["Enclosure protection IP54 with rear gas exhaust ducting, internal arc classification IAC AFLR 50 kA 1 s."])
    assert [h.param_id for h in sweep.sweep_document(doc)] == ["PARAM-03"]


def test_sweep_needs_a_value_not_just_a_topic():
    doc = _doc(["Rated short-time withstand current - Complied, see datasheet",
                "Deviation 2: RTU marshalling, refer to datasheet section 3.",
                "Deviation 3: Factory acceptance testing, refer to inspection and test plan."],
               section="compliance_table")
    assert sweep.sweep_document(doc) == []


# --- asymmetry: a sweep candidate may only make a cell worse ---------------------

def test_sweep_candidate_alone_never_yields_compliant():
    param = PARAMS_BY_ID["PARAM-01"]
    only_sweep = [sweep_ev("PARAM-01", "datasheet", 6,
                           "Rated short-time withstand current (main busbar and breaker): 50 kA / 3 s.")]
    r = resolve(param, requirement("PARAM-01"), only_sweep, "vendor-x")
    assert r.status == ComplianceStatus.MANUAL_INSPECTION_REQUIRED
    assert r.governing == {}
    assert any(f["code"] == "SWEEP_NOT_USED" and "p.6" in f["message"] for f in r.flags)


def test_failing_sweep_candidate_overrides_a_passing_cover_claim():
    param = PARAMS_BY_ID["PARAM-01"]
    cover = evidence("PARAM-01", "cover_letter", 2,
                     "The switchgear is fully compliant, including the 50 kA / 3 s short-time withstand rating.")
    swept = sweep_ev("PARAM-01", "drawing", 11, "NOTE 7: Standard switchgear bay rated 31.5kA 1s.")
    r = resolve(param, requirement("PARAM-01"), [cover, swept], "vendor-x")
    assert r.status == ComplianceStatus.CONFLICT_DOWNGRADE
    assert r.primary.page == 11 and r.secondary.page == 2
    assert any(f["code"] == "SWEEP_GOVERNS" and "recall sweep" in f["message"] for f in r.flags)


def test_failing_sweep_candidate_alone_is_a_flagged_deviation():
    param = PARAMS_BY_ID["PARAM-01"]
    swept = sweep_ev("PARAM-01", "datasheet", 6, "Short-time withstand capability tested for 50 kA RMS at 1.0 second.")
    r = resolve(param, requirement("PARAM-01"), [swept], "vendor-x")
    assert r.status == ComplianceStatus.DEVIATION_DOWNGRADE
    assert any(f["code"] == "SWEEP_GOVERNS" for f in r.flags)


def test_passing_sweep_candidate_is_never_the_governing_citation():
    param = PARAMS_BY_ID["PARAM-01"]
    cover = evidence("PARAM-01", "cover_letter", 2, "Short-time withstand rating 50 kA / 3 s.")
    swept = sweep_ev("PARAM-01", "datasheet", 6, "Rated short-time withstand current: 50 kA / 3 s.")
    r = resolve(param, requirement("PARAM-01"), [cover, swept], "vendor-x")
    assert r.status == ComplianceStatus.COMPLIANT
    assert {c.page for _, c in r.governing.values()} == {2}
    assert r.evidence == "claim_only"  # the datasheet line was not located, so it proves nothing yet


def test_no_compliant_resolution_rests_on_a_sweep_citation():
    """Every combination of one locator claim and one sweep hit, across tiers and outcomes."""
    param = PARAMS_BY_ID["PARAM-01"]
    quotes = {"pass": "Short-time withstand current 50 kA / 3 s.", "fail": "Short-time withstand current 31.5 kA / 1 s."}
    for locator_outcome in ("pass", "fail", None):
        for sweep_outcome in ("pass", "fail"):
            for locator_section in ("cover_letter", "datasheet"):
                for sweep_section in ("cover_letter", "datasheet"):
                    evs = [sweep_ev("PARAM-01", sweep_section, 9, quotes[sweep_outcome])]
                    if locator_outcome:
                        evs.append(evidence("PARAM-01", locator_section, 2, quotes[locator_outcome]))
                    r = resolve(param, requirement("PARAM-01"), evs, "vendor-x")
                    case = (locator_outcome, sweep_outcome, locator_section, sweep_section)
                    if r.status == ComplianceStatus.COMPLIANT:
                        assert locator_outcome == "pass", case
                        assert all(c.page == 2 for _, c in r.governing.values()), case
                    if sweep_outcome == "fail" and locator_outcome != "fail":
                        assert r.status != ComplianceStatus.COMPLIANT or sweep_section == "cover_letter", case


# --- the pipeline: omission becomes a conflict or a flag --------------------------

def _drop(expected: dict, filename: str, param_id: str, page: int) -> dict:
    data = json.loads(json.dumps(expected))
    ideal = data["ideal_locate"][filename]
    ideal["candidates"] = [c for c in ideal["candidates"] if not (c["param_id"] == param_id and c["page"] == page)]
    return data


def test_locator_missing_the_failing_passage_still_ends_in_conflict(expected):
    result = run_ingest(PACK, locator=AnswerKeyLocator(_drop(expected, VOLTSWITCH, "PARAM-01", 11)))
    cell = _cells(result.tender)[("vendor-b", "PARAM-01")]
    assert cell.status == ComplianceStatus.CONFLICT_DOWNGRADE
    assert cell.citation["page"] == 11 and cell.secondary_citation["page"] == 2
    assert [f["code"] for f in cell.flags] == ["SWEEP_GOVERNS"]
    assert cell.cost_adder == 18500.0
    assert result.stats["sweep_new_candidates"] == 1
    assert result.stats["flags_raised"] == 2  # SWEEP_GOVERNS here, and WARRANTY_BASIS on PARAM-06 (rate table v2)


def test_unparsed_sweep_hit_becomes_a_review_flag(expected, tmp_path):
    from samples import mutate

    pack = mutate.base_pack()
    filename = pack.file_of("vendor-a")
    pack.doc(filename).pages[8].blocks.append(
        ("p", "Short-time withstand rating of 31.5 kA for 1 s applies to the optional outdoor variant on request."))
    pack.manifest["tender_id"] = pack.expected["tender_id"] = "MUT-402-UNPARSED"
    target = mutate.write(pack, tmp_path)
    result = run_ingest(target, locator=AnswerKeyLocator(pack.expected))
    cell = _cells(result.tender)[("vendor-a", "PARAM-01")]
    assert cell.status == ComplianceStatus.COMPLIANT  # the carve-out sentence states no offered value
    assert [f["code"] for f in cell.flags] == ["SWEEP_UNPARSED"]
    assert "possible evidence on p.9 not reviewed" in cell.flags[0]["message"]


# --- evidence strength ------------------------------------------------------------

def test_compliant_from_a_datasheet_is_documentary(result):
    cell = _cells(result.tender)[("vendor-a", "PARAM-01")]
    assert (cell.status, cell.evidence) == (ComplianceStatus.COMPLIANT, "documentary")


def test_compliant_from_the_cover_letter_alone_is_claim_only():
    param = PARAMS_BY_ID["PARAM-07"]
    claim = evidence("PARAM-07", "cover_letter", 2, "Rated voltage Ur: 36 kV.")
    assert resolve(param, requirement("PARAM-07"), [claim], "vendor-x").evidence == "claim_only"
    row = evidence("PARAM-07", "compliance_table", 3, "Rated voltage Ur 36 kV - Complied")
    assert resolve(param, requirement("PARAM-07"), [row], "vendor-x").evidence == "claim_only"
    sheet = evidence("PARAM-07", "datasheet", 6, "Rated voltage Ur: 36 kV.")
    assert resolve(param, requirement("PARAM-07"), [claim, sheet], "vendor-x").evidence == "documentary"


def test_non_compliant_cells_carry_no_evidence_strength(result):
    for cell in _cells(result.tender).values():
        assert (cell.evidence is not None) == (cell.status == ComplianceStatus.COMPLIANT)


def test_evidence_strength_reaches_the_api_payload(result):
    payload = result.tender.model_dump(mode="json")
    cell = payload["parameters"][0]["vendors"]["vendor-a"]
    assert cell["evidence"] == "documentary" and cell["flags"] == []


# --- locator contract (design only: never sent to the API here) --------------------

def test_locate_response_accepts_not_stated_and_defaults_to_empty():
    base = {"page_sections": [], "candidates": [], "tender_facts": [], "headline_price": None, "cover_claim": None}
    assert extract.LocateResponse.model_validate(base).not_stated == []
    with_ns = extract.LocateResponse.model_validate(
        {**base, "not_stated": [{"param_id": "PARAM-02", "pages_searched": [1, 2, 3]}]})
    assert with_ns.not_stated[0].pages_searched == [1, 2, 3]


def test_prompt_asks_for_not_stated():
    assert "not_stated" in extract.build_system_prompt()


def test_answer_key_locator_reports_not_stated_with_the_pages_searched(expected):
    result = run_ingest(PACK, locator=AnswerKeyLocator(_drop(expected, VOLTSWITCH, "PARAM-07", 6)))
    located = json.loads(result.artifacts["located"].body)["outcomes"][VOLTSWITCH]["response"]
    assert located["not_stated"] == [{"param_id": "PARAM-07", "pages_searched": list(range(1, 31))}]


def test_silent_bid_and_locator_miss_stay_separable(expected, tmp_path):
    """The bid says nothing about the parameter anywhere: MANUAL, flagged NOT_STATED with the pages searched."""
    from samples import mutate

    pack = mutate.base_pack()
    filename = pack.file_of("vendor-b")
    quote = next(c["quote"] for c in pack.locate(filename)["candidates"] if c["param_id"] == "PARAM-08")
    pack.remove_block(filename, quote)
    pack.locate(filename)["candidates"] = [c for c in pack.locate(filename)["candidates"] if c["param_id"] != "PARAM-08"]
    pack.manifest["tender_id"] = pack.expected["tender_id"] = "MUT-402-SILENT"
    result = run_ingest(mutate.write(pack, tmp_path), locator=AnswerKeyLocator(pack.expected))
    cell = _cells(result.tender)[("vendor-b", "PARAM-08")]
    assert cell.status == ComplianceStatus.MANUAL_INSPECTION_REQUIRED
    assert [f["code"] for f in cell.flags] == ["NOT_STATED"]
    assert "pages 1-30" in cell.flags[0]["message"]
