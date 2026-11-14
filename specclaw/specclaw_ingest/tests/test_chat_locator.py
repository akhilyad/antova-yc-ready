"""The Experiential Labs (OpenAI-compatible) locator, provider choice and the .env reader."""

import json
import re
from decimal import Decimal

import httpx
import pytest

from specclaw_ingest import envfile, extract, pipeline, verify
from specclaw_ingest.chat_locator import (
    DEFAULT_BASE_URL,
    ChatCompletionsLocator,
    LocateApiError,
    check_base_url,
)
from specclaw_ingest.extract import (
    ClaudeLocator,
    LocateInvalid,
    LocateRefused,
    MissingCredentials,
    ReplayMiss,
    ResponseStore,
)
from specclaw_ingest.parse import load_manifest, parse_document
from specclaw_ingest.tests.fakes import PACK, load_expected

VOLTSWITCH = "Bid_vendor-b_VoltSwitch.pdf"
KEY = "xpl_test_key_not_real_0123456789"
PAGE = re.compile(r'<page n="(\d+)"')


@pytest.fixture(scope="module")
def expected():
    return load_expected()


@pytest.fixture(scope="module")
def doc():
    manifest = load_manifest(PACK)
    return parse_document(PACK, next(d for d in manifest.documents if d.file == VOLTSWITCH))


@pytest.fixture(autouse=True)
def key(monkeypatch):
    monkeypatch.setenv("EXPLABS_API_KEY", KEY)
    for name in ("SPECCLAW_LOCATE_PROVIDER", "EXPLABS_MODEL", "EXPLABS_BASE_URL", "EXPLABS_MAX_INPUT_TOKENS",
                 "EXPLABS_MAX_OUTPUT_TOKENS", "EXPLABS_JSON_MODE"):
        monkeypatch.delenv(name, raising=False)


class Endpoint:
    """A fake chat-completions endpoint. `reply(request)` returns (status, json body, headers)."""

    def __init__(self, reply):
        self.reply = reply
        self.requests: list[httpx.Request] = []

    def client(self):
        def handle(request: httpx.Request) -> httpx.Response:
            self.requests.append(request)
            status, body, headers = self.reply(request)
            return httpx.Response(status, json=body, headers=headers)

        return httpx.Client(base_url=DEFAULT_BASE_URL, transport=httpx.MockTransport(handle),
                            headers={"Authorization": f"Bearer {KEY}"})

    def payload(self, index=-1):
        return json.loads(self.requests[index].content)


def completion(content, finish="stop", prompt=1200, out=300):
    return 200, {"model": "gpt-6-luna", "choices": [{"message": {"content": content}, "finish_reason": finish}],
                 "usage": {"prompt_tokens": prompt, "completion_tokens": out}}, {}


def ideal_for(expected, content):
    file = re.search(r'file="([^"]+)"', content).group(1)
    ideal = dict(expected["ideal_locate"][file])
    inside = {int(n) for n in PAGE.findall(content)}
    ideal["candidates"] = [c for c in ideal["candidates"] if c["page"] in inside]
    ideal["page_sections"] = [s for s in ideal["page_sections"] if s["page"] in inside]
    ideal["tender_facts"] = [f for f in ideal["tender_facts"] if f["page"] in inside]
    for field in ("headline_price", "cover_claim"):
        if (ideal.get(field) or {}).get("page") not in inside:
            ideal[field] = None
    found = {c["param_id"] for c in ideal["candidates"]}
    ideal["not_stated"] = [{"param_id": p.id, "pages_searched": sorted(inside)}
                           for p in extract.PARAMETERS if p.id not in found]
    return ideal


def answering(expected):
    return Endpoint(lambda request: completion(json.dumps(
        ideal_for(expected, json.loads(request.content)["messages"][1]["content"]))))


def locator(tmp_path, endpoint, mode="live", **kwargs):
    store = ResponseStore(tmp_path / "store", model="gpt-6-luna", salt="t")
    return ChatCompletionsLocator(store, mode, client_factory=endpoint.client, sleep=lambda s: None, **kwargs)


# --- one call ------------------------------------------------------------------------------------

def test_a_call_posts_the_prompt_the_schema_and_the_key(tmp_path, doc, expected):
    endpoint = answering(expected)
    outcome = locator(tmp_path, endpoint).locate(doc)
    request = endpoint.requests[0]
    assert request.url.path.endswith("/chat/completions")
    assert request.headers["authorization"] == f"Bearer {KEY}"
    body = endpoint.payload()
    assert body["model"] == "gpt-6-luna"
    assert body["response_format"] == {"type": "json_object"}
    assert "max_tokens" not in body
    system, user = (m["content"] for m in body["messages"])
    assert system.startswith(extract.build_system_prompt()) and '"candidates"' in system
    assert 'vendor="vendor-b"' in user and '<page n="11"' in user
    assert outcome.model == "gpt-6-luna" and not outcome.from_store
    assert (outcome.input_tokens, outcome.output_tokens) == (1200, 300)
    assert len(outcome.response.candidates) == len(expected["ideal_locate"][VOLTSWITCH]["candidates"])


def test_a_fenced_reply_is_read(tmp_path, doc, expected):
    reply = "```json\n" + json.dumps(expected["ideal_locate"][VOLTSWITCH]) + "\n```"
    endpoint = Endpoint(lambda request: completion(reply))
    assert locator(tmp_path, endpoint).locate(doc).response.headline_price is not None


def test_json_mode_can_be_switched_off_and_the_output_limit_set(tmp_path, doc, expected):
    endpoint = answering(expected)
    locator(tmp_path, endpoint, json_mode=False, max_output_tokens=20000).locate(doc)
    body = endpoint.payload()
    assert "response_format" not in body and body["max_tokens"] == 20000


@pytest.mark.parametrize("finish,error", [("length", LocateInvalid), ("content_filter", LocateRefused)])
def test_a_cut_off_or_filtered_reply_is_not_used(tmp_path, doc, finish, error):
    endpoint = Endpoint(lambda request: completion("{}", finish=finish))
    with pytest.raises(error):
        locator(tmp_path, endpoint).locate(doc)
    assert not list((tmp_path / "store").glob("*.json"))


def test_a_reply_that_is_not_the_schema_is_invalid(tmp_path, doc):
    endpoint = Endpoint(lambda request: completion("I found some things."))
    with pytest.raises(LocateInvalid, match="did not match the schema"):
        locator(tmp_path, endpoint).locate(doc)


# --- errors, retries, the key --------------------------------------------------------------------

def test_a_rejected_key_says_so_and_never_prints_it(tmp_path, doc):
    endpoint = Endpoint(lambda request: (401, {"error": f"bad key {KEY}"}, {}))
    with pytest.raises(LocateApiError) as err:
        locator(tmp_path, endpoint).locate(doc)
    assert "401" in str(err.value) and "EXPLABS_API_KEY" in str(err.value)
    assert KEY not in str(err.value)
    assert len(endpoint.requests) == 1  # not retried


def test_rate_limits_are_retried_then_succeed(tmp_path, doc, expected):
    good = answering(expected)
    calls = []

    def reply(request):
        calls.append(1)
        return (429, {"error": "slow down"}, {"retry-after": "3"}) if len(calls) < 3 else good.reply(request)

    endpoint = Endpoint(reply)
    waits = []
    loc = locator(tmp_path, endpoint)
    loc._sleep = waits.append
    assert loc.locate(doc).response.candidates
    assert waits == [3.0, 3.0] and len(endpoint.requests) == 3


def test_retries_run_out(tmp_path, doc):
    endpoint = Endpoint(lambda request: (503, {"error": "down"}, {}))
    with pytest.raises(LocateApiError, match="503"):
        locator(tmp_path, endpoint).locate(doc)
    assert len(endpoint.requests) == 4


def test_no_key_is_a_clear_error_before_any_request(tmp_path, doc, monkeypatch):
    monkeypatch.setenv("EXPLABS_API_KEY", "")
    endpoint = answering(load_expected())
    with pytest.raises(MissingCredentials, match="EXPLABS_API_KEY"):
        locator(tmp_path, endpoint).locate(doc)
    assert endpoint.requests == []


@pytest.mark.parametrize("url,ok", [
    ("https://api.experientiallabs.ai/v1", True), ("https://api.experientiallabs.ai/v1/", True),
    ("http://localhost:8080/v1", True), ("http://127.0.0.1:9/v1", True),
    ("http://api.experientiallabs.ai/v1", False), ("ftp://x/v1", False), ("https:///v1", False),
])
def test_the_base_url_must_protect_the_key(url, ok):
    if ok:
        assert check_base_url(url) == url.rstrip("/")
    else:
        with pytest.raises(ValueError):
            check_base_url(url)


# --- saved answers and windows -------------------------------------------------------------------

def test_the_answer_is_saved_under_this_model_and_replays_for_free(tmp_path, doc, expected):
    endpoint = answering(expected)
    first = locator(tmp_path, endpoint).locate(doc)
    saved = json.loads(next((tmp_path / "store").glob("*.json")).read_text(encoding="utf-8"))
    assert saved["model"] == "gpt-6-luna" and "gpt-6-luna" in saved["key"]
    replayed = locator(tmp_path, endpoint, mode="replay").locate(doc)
    assert replayed.from_store and replayed.response == first.response
    assert len(endpoint.requests) == 1


def test_claudes_saved_answers_are_not_replayed_as_this_models(tmp_path, doc, expected):
    claude_store = ResponseStore(tmp_path / "store")
    claude_store.save(claude_store.key_for(doc), extract.LocateOutcome(
        extract.LocateResponse.model_validate(expected["ideal_locate"][VOLTSWITCH]), 1, 1, False), doc)
    with pytest.raises(ReplayMiss):
        locator(tmp_path, answering(expected), mode="replay").locate(doc)


def test_a_bid_over_the_models_context_is_sent_in_windows(tmp_path, doc, expected):
    endpoint = answering(expected)
    outcome = locator(tmp_path, endpoint, max_input_tokens=2500).locate(doc)
    assert outcome.windows and len(outcome.windows) == len(endpoint.requests) > 1
    assert len(outcome.response.candidates) == len(expected["ideal_locate"][VOLTSWITCH]["candidates"])
    for request in endpoint.requests:
        content = json.loads(request.content)["messages"]
        assert (len(content[0]["content"]) + len(content[1]["content"])) / 3.5 <= 2500


# --- the whole pipeline --------------------------------------------------------------------------

def test_the_pipeline_runs_on_this_model_and_matches_the_answer_key(tmp_path, expected):
    store = ResponseStore(tmp_path / "store", model="gpt-6-luna")
    endpoint = answering(expected)
    loc = ChatCompletionsLocator(store, "live", client_factory=endpoint.client, sleep=lambda s: None,
                                 prices=(Decimal("2"), Decimal("8")))
    result = pipeline.run_ingest(PACK, locator=loc)
    assert verify.compare_to_answer_key(result.tender, expected, result) == []
    assert not any("fallback" in w for w in result.warnings)
    outcomes = pipeline.artifacts.StageArtifact.load(result.artifacts["located"])["outcomes"]
    assert all(o["prices"] == ["2", "8"] and o["model"] == "gpt-6-luna" for o in outcomes.values())
    tokens_in = sum(o["input_tokens"] for o in outcomes.values())
    tokens_out = sum(o["output_tokens"] for o in outcomes.values())
    assert Decimal(str(result.stats["api_cost_usd"])) == (Decimal(tokens_in) * 2 + Decimal(tokens_out) * 8) / 1_000_000


# --- choosing the provider and reading .env ------------------------------------------------------

def test_the_provider_follows_the_settings(tmp_path, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    assert extract.locate_provider() == "explabs"  # an Experiential Labs key is set
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    assert extract.locate_provider() == "explabs"  # an Anthropic key in the environment does not change that
    monkeypatch.setenv("SPECCLAW_LOCATE_PROVIDER", "anthropic")
    assert extract.locate_provider() == "anthropic"  # only an explicit choice selects Claude
    monkeypatch.setenv("SPECCLAW_LOCATE_PROVIDER", "explabs")
    assert extract.locate_provider() == "explabs"
    monkeypatch.delenv("SPECCLAW_LOCATE_PROVIDER")
    monkeypatch.setenv("EXPLABS_API_KEY", "")
    assert extract.locate_provider() == "anthropic"  # no Experiential Labs key: Claude
    monkeypatch.setenv("SPECCLAW_LOCATE_PROVIDER", "gemini")
    with pytest.raises(ValueError, match="SPECCLAW_LOCATE_PROVIDER"):
        extract.locate_provider()


def test_make_locator_builds_the_chosen_locator(tmp_path, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    chosen = extract.make_locator(tmp_path, "replay")
    assert isinstance(chosen, ChatCompletionsLocator)
    assert (chosen.model, chosen.base_url, chosen.max_input_tokens) == ("gpt-6-luna", DEFAULT_BASE_URL, 100_000)
    monkeypatch.setenv("EXPLABS_MODEL", "gpt-6-sol")
    monkeypatch.setenv("EXPLABS_MAX_INPUT_TOKENS", "64000")
    monkeypatch.setenv("EXPLABS_PRICE_INPUT_PER_MTOK", "1.5")
    tuned = extract.make_locator(tmp_path, "replay")
    assert (tuned.model, tuned.max_input_tokens, tuned.prices[0]) == ("gpt-6-sol", 64000, Decimal("1.5"))
    monkeypatch.setenv("SPECCLAW_LOCATE_PROVIDER", "anthropic")
    assert isinstance(extract.make_locator(tmp_path, "replay"), ClaudeLocator)
    assert not isinstance(extract.make_locator(tmp_path, "replay"), ChatCompletionsLocator)


@pytest.mark.parametrize("name,value", [("EXPLABS_MAX_INPUT_TOKENS", "lots"), ("EXPLABS_MAX_INPUT_TOKENS", "0"),
                                        ("EXPLABS_JSON_MODE", "yes"), ("EXPLABS_BASE_URL", "http://example.com/v1"),
                                        ("EXPLABS_PRICE_INPUT_PER_MTOK", "cheap")])
def test_bad_settings_are_refused_at_start(tmp_path, monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    with pytest.raises(ValueError):
        ChatCompletionsLocator.from_env(tmp_path, "replay")


def test_envfile_reads_only_locator_settings_and_never_replaces_a_set_name(tmp_path, monkeypatch):
    path = tmp_path / ".env"
    path.write_text(
        "# comment\nEXPLABS_API_KEY=file-key\nexport EXPLABS_MODEL = 'gpt-6-luna'\n"
        "STRIPE_SECRET_KEY=sk_live_nope\nSPECCLAW_LOCATE_PROVIDER=\"explabs\"\nnot a pair\n\n",
        encoding="utf-8")
    for name in ("EXPLABS_MODEL", "SPECCLAW_LOCATE_PROVIDER", "STRIPE_SECRET_KEY"):
        monkeypatch.setenv(name, "x")  # registers the name, so teardown removes whatever load() sets
        monkeypatch.delenv(name)
    applied = envfile.load(path)
    assert sorted(applied) == ["EXPLABS_MODEL", "SPECCLAW_LOCATE_PROVIDER"]  # EXPLABS_API_KEY was already set
    import os
    assert os.environ["EXPLABS_API_KEY"] == KEY
    assert os.environ["EXPLABS_MODEL"] == "gpt-6-luna"
    assert "STRIPE_SECRET_KEY" not in os.environ


def test_envfile_missing_file_is_fine(tmp_path):
    assert envfile.load(tmp_path / "nope.env") == []
