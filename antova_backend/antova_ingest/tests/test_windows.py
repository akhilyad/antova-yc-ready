"""Locating at scale: page windows for documents over the input limit, documents located in
parallel, and response-store writes that a crash cannot truncate."""

import json
import random
import re
import time
from types import SimpleNamespace

import pytest

from antova_ingest import artifacts, extract, pipeline
from antova_ingest.extract import (
    ModelLocator,
    DocumentTooLarge,
    LocateResponse,
    ResponseStore,
    merge_responses,
)
from antova_ingest.parse import load_manifest, parse_document
from antova_ingest.tests.fakes import PACK, AnswerKeyLocator, fake_message, load_expected

VOLTSWITCH = "Bid_vendor-b_VoltSwitch.pdf"
PAGE = re.compile(r'<page n="(\d+)"')


class _Stream:
    def __init__(self, message):
        self._message = message

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_message(self):
        return self._message


class WindowedModel:
    """A fake the model that answers from the answer key's ideal response, restricted to the pages it
    was sent, and counts tokens as characters / 4. Records every window it was sent."""

    def __init__(self, ideal: dict[str, dict]):
        self.ideal = ideal
        self.sent: list[tuple[str, list[int]]] = []
        self.counted: list[int] = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(stream=self._stream))
        self.messages = SimpleNamespace(count_tokens=self._count)

    def _count(self, *, model, system, messages):
        tokens = (len(system) + len(messages[0]["content"])) // 4
        self.counted.append(tokens)
        return SimpleNamespace(input_tokens=tokens)

    def _stream(self, *, messages, **_):
        content = messages[0]["content"]
        file = re.search(r'file="([^"]+)"', content).group(1)
        pages = [int(n) for n in PAGE.findall(content)]
        self.sent.append((file, pages))
        ideal = self.ideal[file]
        inside = set(pages)
        response = {
            "page_sections": [s for s in ideal["page_sections"] if s["page"] in inside],
            "candidates": [c for c in ideal["candidates"] if c["page"] in inside],
            "tender_facts": [f for f in ideal["tender_facts"] if f["page"] in inside],
            "headline_price": ideal["headline_price"] if (ideal["headline_price"] or {}).get("page") in inside else None,
            "cover_claim": ideal["cover_claim"] if (ideal["cover_claim"] or {}).get("page") in inside else None,
        }
        found = {c["param_id"] for c in response["candidates"]}
        response["not_stated"] = [{"param_id": p.id, "pages_searched": pages}
                                  for p in extract.PARAMETERS if p.id not in found]
        return _Stream(fake_message(json.dumps(response), input_tokens=len(content) // 4))


@pytest.fixture(scope="module")
def expected():
    return load_expected()


@pytest.fixture(scope="module")
def voltswitch():
    manifest = load_manifest(PACK)
    return parse_document(PACK, next(d for d in manifest.documents if d.file == VOLTSWITCH))


@pytest.fixture
def credentials(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-not-real")
    monkeypatch.setenv("ANTOVA_LOCATOR_MODEL", "test-model")
    monkeypatch.setenv("ANTOVA_LOCATOR_MODEL", "test-model")


def _whole_tokens(doc):
    return (len(extract.build_system_prompt()) + len(extract.build_document_content(doc))) // 4


def _locator(tmp_path, client, mode="live"):
    return ModelLocator(ResponseStore(tmp_path / "store"), mode, client_factory=lambda: client)


def _key(c):
    return (c.param_id, c.page, c.quote)


# --- page windows ------------------------------------------------------------------------------

def test_a_document_under_the_limit_is_one_call(tmp_path, voltswitch, expected, credentials):
    client = WindowedModel(expected["ideal_locate"])
    outcome = _locator(tmp_path, client).locate(voltswitch)
    assert len(client.sent) == 1 and outcome.windows is None
    assert 'pages="' not in extract.build_document_content(voltswitch)  # the saved replay key's message is unchanged


def test_an_over_limit_document_is_sent_in_overlapping_windows_and_merged(
        tmp_path, voltswitch, expected, credentials, monkeypatch):
    monkeypatch.setattr(extract, "MAX_INPUT_TOKENS", _whole_tokens(voltswitch) // 3)
    client = WindowedModel(expected["ideal_locate"])
    outcome = _locator(tmp_path, client).locate(voltswitch)

    windows = [pages for _, pages in client.sent]
    assert len(windows) >= 3
    assert windows[0][0] == 1 and windows[-1][-1] == len(voltswitch.pages)
    for before, after in zip(windows, windows[1:]):
        assert after[0] == before[-1]  # each window starts on the page the last one ended on
    assert all(n <= extract.MAX_INPUT_TOKENS for n in client.counted[-len(windows):])
    assert outcome.windows == [(w[0], w[-1]) for w in windows]

    ideal = LocateResponse.model_validate(expected["ideal_locate"][VOLTSWITCH])
    assert sorted(map(_key, outcome.response.candidates)) == sorted(map(_key, ideal.candidates))
    assert len(outcome.response.candidates) == len(ideal.candidates)  # the shared pages added no duplicates
    assert outcome.response.headline_price == ideal.headline_price
    assert outcome.response.cover_claim == ideal.cover_claim
    assert sorted(s.page for s in outcome.response.page_sections) == sorted(s.page for s in ideal.page_sections)
    found = {c.param_id for c in ideal.candidates}
    assert {n.param_id for n in outcome.response.not_stated} == {p.id for p in extract.PARAMETERS} - found
    assert outcome.input_tokens > _whole_tokens(voltswitch)  # every window was billed, overlap included


def test_a_windowed_answer_is_saved_and_replays_with_its_windows(
        tmp_path, voltswitch, expected, credentials, monkeypatch):
    monkeypatch.setattr(extract, "MAX_INPUT_TOKENS", _whole_tokens(voltswitch) // 3)
    live = _locator(tmp_path, WindowedModel(expected["ideal_locate"])).locate(voltswitch)
    record = json.loads(next((tmp_path / "store").glob("*.json")).read_text(encoding="utf-8"))
    assert record["windows"] == [list(w) for w in live.windows]
    replayed = _locator(tmp_path, None, mode="replay").locate(voltswitch)
    assert replayed.from_store and replayed.windows == live.windows
    assert replayed.response == live.response


def test_a_single_page_over_the_limit_cannot_be_sent(tmp_path, voltswitch, expected, credentials, monkeypatch):
    monkeypatch.setattr(extract, "MAX_INPUT_TOKENS", 10)
    client = WindowedModel(expected["ideal_locate"])
    with pytest.raises(DocumentTooLarge, match=r"p\.1"):
        _locator(tmp_path, client).locate(voltswitch)
    assert client.sent == []  # nothing was paid for


def test_a_window_that_counts_over_its_estimate_is_split(tmp_path, voltswitch, expected, credentials, monkeypatch):
    monkeypatch.setattr(extract, "MAX_INPUT_TOKENS", _whole_tokens(voltswitch) // 3)
    monkeypatch.setattr(extract, "WINDOW_BUDGET_SHARE", 1.6)  # plan windows too big on purpose
    client = WindowedModel(expected["ideal_locate"])
    outcome = _locator(tmp_path, client).locate(voltswitch)
    windows = [pages for _, pages in client.sent]
    assert windows[0][0] == 1 and windows[-1][-1] == len(voltswitch.pages)
    assert {p for w in windows for p in w} == set(range(1, len(voltswitch.pages) + 1))
    assert len(outcome.response.candidates) == len(expected["ideal_locate"][VOLTSWITCH]["candidates"])


def test_merge_keeps_first_section_label_and_unions_not_stated():
    first = LocateResponse.model_validate({
        "page_sections": [{"page": 3, "section": "datasheet"}], "candidates": [], "tender_facts": [],
        "headline_price": None, "cover_claim": None,
        "not_stated": [{"param_id": "PARAM-01", "pages_searched": [1, 2, 3]},
                       {"param_id": "PARAM-02", "pages_searched": [1, 2, 3]}]})
    second = LocateResponse.model_validate({
        "page_sections": [{"page": 3, "section": "drawing"}, {"page": 4, "section": "bom"}],
        "candidates": [{"param_id": "PARAM-02", "page": 4, "quote": "Busbar copper, 2500 A rated"}],
        "tender_facts": [], "headline_price": {"page": 4, "quote": "Total 1"}, "cover_claim": None,
        "not_stated": [{"param_id": "PARAM-01", "pages_searched": [3, 4]}]})
    merged = merge_responses([first, second])
    assert [(s.page, s.section) for s in merged.page_sections] == [(3, "datasheet"), (4, "bom")]
    assert [(n.param_id, n.pages_searched) for n in merged.not_stated] == [("PARAM-01", [1, 2, 3, 4])]
    assert merged.headline_price.page == 4


def test_the_pipeline_gives_the_same_tender_whether_or_not_bids_are_windowed(tmp_path, expected, credentials, monkeypatch):
    whole = pipeline.run_ingest(PACK, locator=_locator(tmp_path / "a", WindowedModel(expected["ideal_locate"])))
    monkeypatch.setattr(extract, "MAX_INPUT_TOKENS", 1500)  # every sample document is about 3,700
    windowed = pipeline.run_ingest(PACK, locator=_locator(tmp_path / "b", WindowedModel(expected["ideal_locate"])))
    assert any("overlapping page windows" in w for w in windowed.warnings)
    # Every figure, citation and status is the same. Only the run cost differs: windows bill their overlap.
    strip = lambda t: {**t.model_dump(), "latency_sec": 0, "compute_cogs": 0}  # noqa: E731
    assert strip(windowed.tender) == strip(whole.tender)
    assert windowed.tender.compute_cogs > whole.tender.compute_cogs


# --- parallel locate -----------------------------------------------------------------------------

class _SlowAnswerKey(AnswerKeyLocator):
    """Answers in a random order, so a result that depended on finishing order would show it."""

    def locate(self, doc):
        time.sleep(random.uniform(0, 0.05))
        return super().locate(doc)


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_parallel_locate_gives_the_same_artifacts_as_one_at_a_time(expected, monkeypatch, seed):
    random.seed(seed)
    monkeypatch.setenv("ANTOVA_LOCATE_CONCURRENCY", "1")
    serial = pipeline.run_ingest(PACK, locator=AnswerKeyLocator(expected))
    monkeypatch.setenv("ANTOVA_LOCATE_CONCURRENCY", "4")
    parallel = pipeline.run_ingest(PACK, locator=_SlowAnswerKey(expected))
    assert {s: a.sha256 for s, a in parallel.artifacts.items()} == {s: a.sha256 for s, a in serial.artifacts.items()}


def test_documents_are_located_at_once(expected, monkeypatch):
    monkeypatch.setenv("ANTOVA_LOCATE_CONCURRENCY", "4")
    started, running, peak = [], [0], [0]
    base = AnswerKeyLocator(expected)

    class Watching:
        def locate(self, doc):
            running[0] += 1
            peak[0] = max(peak[0], running[0])
            started.append(doc.entry.file)
            time.sleep(0.05)
            running[0] -= 1
            return base.locate(doc)

    pipeline.run_ingest(PACK, locator=Watching())
    assert peak[0] > 1 and len(started) == 4


@pytest.mark.parametrize("raw,want", [(None, 3), ("1", 1), ("8", 8), ("50", 8), ("0", 1), ("x", 3)])
def test_locate_concurrency_is_bounded(monkeypatch, raw, want):
    if raw is None:
        monkeypatch.delenv("ANTOVA_LOCATE_CONCURRENCY", raising=False)
    else:
        monkeypatch.setenv("ANTOVA_LOCATE_CONCURRENCY", raw)
    assert pipeline.locate_concurrency() == want


def test_a_failing_mr_spec_still_fails_the_ingest_when_located_in_parallel(expected, monkeypatch):
    monkeypatch.setenv("ANTOVA_LOCATE_CONCURRENCY", "4")

    class MrRefused(AnswerKeyLocator):
        def locate(self, doc):
            if doc.entry.role == "mr_spec":
                raise extract.LocateRefused(doc.entry.file, "test")
            return super().locate(doc)

    with pytest.raises(pipeline.IngestFailed, match="declined"):
        pipeline.run_ingest(PACK, locator=MrRefused(expected))


# --- atomic store writes -------------------------------------------------------------------------

def test_a_failed_store_write_leaves_the_previous_file_whole(tmp_path, voltswitch, expected, credentials, monkeypatch):
    store = ResponseStore(tmp_path / "store")
    locator = ModelLocator(store, "live", client_factory=lambda: WindowedModel(expected["ideal_locate"]))
    outcome = locator.locate(voltswitch)
    path = next((tmp_path / "store").glob("*.json"))
    before = path.read_bytes()

    def crash(*_):
        raise OSError("disk full")

    monkeypatch.setattr(extract.os, "replace", crash)
    with pytest.raises(OSError):
        store.save(store.key_for(voltswitch), outcome, voltswitch)
    assert path.read_bytes() == before
    assert [p.name for p in (tmp_path / "store").iterdir()] == [path.name]  # no temporary file left behind
    assert store.load(store.key_for(voltswitch)).response == outcome.response


def test_the_run_fingerprint_covers_the_windowing_rules():
    assert "pipeline.py" in artifacts.RULE_MODULES
