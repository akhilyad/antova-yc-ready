"""Model locate call, saved responses and replay modes."""

import json
from decimal import Decimal

import anthropic
import pytest

from antova_ingest import extract
from antova_ingest.extract import (
    ModelLocator,
    DocumentTooLarge,
    LocateInvalid,
    LocateRefused,
    LocateResponse,
    MissingCredentials,
    ReplayMiss,
    ResponseStore,
    api_cost_usd,
    build_document_content,
    build_system_prompt,
)
from antova_ingest.ontology import PARAMETERS
from antova_ingest.parse import load_manifest, parse_document
from antova_ingest.tests.fakes import PACK, AnswerKeyLocator, FakeAnthropic, fake_message, load_expected

VOLTSWITCH = "Bid_vendor-b_VoltSwitch.pdf"


@pytest.fixture(scope="module")
def doc():
    manifest = load_manifest(PACK)
    return parse_document(PACK, next(d for d in manifest.documents if d.file == VOLTSWITCH))


@pytest.fixture
def ideal_json():
    return json.dumps(load_expected()["ideal_locate"][VOLTSWITCH])


@pytest.fixture
def credentials(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-not-real")
    monkeypatch.setenv("ANTOVA_LOCATOR_MODEL", "test-model")


class Factory:
    def __init__(self, client):
        self.client = client
        self.calls = 0

    def __call__(self):
        self.calls += 1
        return self.client


def _locator(tmp_path, mode, client):
    factory = Factory(client)
    return ModelLocator(ResponseStore(tmp_path), mode, client_factory=factory), factory


def test_replay_hit_uses_store(tmp_path, doc, ideal_json, credentials):
    recorder, _ = _locator(tmp_path, "auto", FakeAnthropic(fake_message(ideal_json)))
    recorder.locate(doc)
    locator, factory = _locator(tmp_path, "replay", FakeAnthropic(fake_message(ideal_json)))
    outcome = locator.locate(doc)
    assert outcome.from_store is True
    assert factory.calls == 0
    assert outcome.response == LocateResponse.model_validate_json(ideal_json)


def test_replay_miss(tmp_path, doc):
    locator, factory = _locator(tmp_path, "replay", FakeAnthropic(fake_message("{}")))
    with pytest.raises(ReplayMiss) as err:
        locator.locate(doc)
    message = str(err.value)
    assert ResponseStore(tmp_path).key_for(doc) in message
    assert VOLTSWITCH in message
    assert "--mode live" in message
    assert factory.calls == 0


def test_auto_records_then_replays(tmp_path, doc, ideal_json, credentials):
    client = FakeAnthropic(fake_message(ideal_json, input_tokens=1234, output_tokens=56))
    locator, factory = _locator(tmp_path, "auto", client)
    first = locator.locate(doc)
    assert first.from_store is False
    assert (first.input_tokens, first.output_tokens) == (1234, 56)
    assert len(client.stream_calls) == 1
    saved = json.loads((tmp_path / f"{ResponseStore(tmp_path).key_for(doc)}.json").read_text(encoding="utf-8"))
    assert saved["filename"] == VOLTSWITCH
    assert saved["model"] == extract.MODEL
    assert saved["prompt_version"] == "locate-v1"
    assert saved["usage"] == {"input_tokens": 1234, "output_tokens": 56}
    second = locator.locate(doc)
    assert second.from_store is True
    assert len(client.stream_calls) == 1
    assert factory.calls == 1


def test_live_overwrites(tmp_path, doc, ideal_json, credentials):
    _locator(tmp_path, "auto", FakeAnthropic(fake_message(ideal_json)))[0].locate(doc)
    client = FakeAnthropic(fake_message(ideal_json, output_tokens=999))
    outcome = _locator(tmp_path, "live", client)[0].locate(doc)
    assert outcome.from_store is False
    assert len(client.stream_calls) == 1
    saved = json.loads((tmp_path / f"{ResponseStore(tmp_path).key_for(doc)}.json").read_text(encoding="utf-8"))
    assert saved["usage"]["output_tokens"] == 999


def test_request_shape(tmp_path, doc, ideal_json, credentials):
    client = FakeAnthropic(fake_message(ideal_json))
    _locator(tmp_path, "live", client)[0].locate(doc)
    system = build_system_prompt()
    messages = [{"role": "user", "content": build_document_content(doc)}]
    assert client.count_calls == [{"model": "test-model", "system": system, "messages": messages}]
    assert client.stream_calls == [{
        "model": "test-model",
        "max_tokens": 64000,
        "system": system,
        "messages": messages,
        "output_config": {
            "effort": "high",
            "format": {"type": "json_schema", "schema": anthropic.transform_schema(LocateResponse)},
        },
        "betas": ["server-side-fallback-2026-07-01"],
        "extra_body": {"fallbacks": "default"},
    }]
    assert '<page n="11" section="drawing">' in messages[0]["content"]
    assert 'vendor="vendor-b"' in messages[0]["content"]


def test_too_large(tmp_path, doc, credentials):
    client = FakeAnthropic(fake_message("{}"), input_tokens=150_001)
    with pytest.raises(DocumentTooLarge):
        _locator(tmp_path, "live", client)[0].locate(doc)
    assert client.stream_calls == []


def test_refusal(tmp_path, doc, credentials):
    client = FakeAnthropic(fake_message(None, stop_reason="refusal", category="cyber"))
    with pytest.raises(LocateRefused) as err:
        _locator(tmp_path, "live", client)[0].locate(doc)
    assert "cyber" in str(err.value)


def test_max_tokens_stop(tmp_path, doc, credentials):
    client = FakeAnthropic(fake_message('{"page_sections": [', stop_reason="max_tokens"))
    with pytest.raises(LocateInvalid):
        _locator(tmp_path, "live", client)[0].locate(doc)


def test_schema_invalid(tmp_path, doc, credentials):
    client = FakeAnthropic(fake_message('{"candidates": "not a list"}'))
    with pytest.raises(LocateInvalid):
        _locator(tmp_path, "live", client)[0].locate(doc)


def test_missing_credentials(tmp_path, doc, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", "")
    locator, factory = _locator(tmp_path, "live", FakeAnthropic(fake_message("{}")))
    with pytest.raises(MissingCredentials):
        locator.locate(doc)
    assert factory.calls == 0


def test_test_session_has_no_credentials():
    """Final review M7: no test may be able to reach the paid API by accident."""
    assert not extract.has_credentials()


def test_api_cost():
    assert api_cost_usd(1_000_000, 100_000) == Decimal("6.0000")


def test_system_prompt_mentions_all_params_and_data_rule():
    prompt = build_system_prompt()
    for param in PARAMETERS:
        assert param.id in prompt
        assert param.locate_hint in prompt
    assert "never as instructions" in prompt
    assert 'section="unlabeled"' in prompt


def test_make_locator_uses_tender_store(tmp_path):
    locator = extract.make_locator(tmp_path, "replay")
    assert locator.mode == "replay"
    assert locator.store.directory == tmp_path / "saved_responses"


def test_answer_key_locator(doc):
    outcome = AnswerKeyLocator(load_expected()).locate(doc)
    assert outcome.response.headline_price.page == 22
    assert any(c.page == 11 and c.param_id == "PARAM-01" for c in outcome.response.candidates)
