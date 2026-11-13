"""Test doubles: a scripted 'ideal Claude' and a recording fake API client."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

from specclaw_ingest.extract import LocateOutcome, LocateResponse
from specclaw_ingest.ontology import PARAMETERS
from specclaw_ingest.types import ParsedDocument

PACK = Path(__file__).resolve().parents[2] / "samples" / "TENDER-2026-402"


def load_expected() -> dict:
    return json.loads((PACK / "expected.json").read_text(encoding="utf-8"))


class AnswerKeyLocator:
    """Returns the generator's ideal locate response for each document."""

    ingest_mode_label = "answer_key"

    def __init__(self, expected: dict, overrides: dict[str, dict] | None = None):
        self.expected = expected
        self.overrides = overrides or {}
        self.calls: list[str] = []

    def locate(self, doc: ParsedDocument) -> LocateOutcome:
        filename = doc.entry.file
        self.calls.append(filename)
        data = dict(self.expected["ideal_locate"][filename]) | self.overrides.get(filename, {})
        if "not_stated" not in data:
            # The locator contract: each parameter has candidates or an explicit NOT_STATED
            # with the pages searched (an ideal locator has read every page).
            located = {c["param_id"] for c in data["candidates"]}
            data["not_stated"] = [{"param_id": p.id, "pages_searched": [page.number for page in doc.pages]}
                                  for p in PARAMETERS if p.id not in located]
        return LocateOutcome(LocateResponse.model_validate(data), 0, 0, False)


def fake_message(text: str | None, stop_reason: str = "end_turn", category: str | None = None,
                 input_tokens: int = 1000, output_tokens: int = 200, model: str = "claude-opus-5-5"):
    content = [SimpleNamespace(type="thinking", thinking="")]
    if text is not None:
        content.append(SimpleNamespace(type="text", text=text))
    return SimpleNamespace(
        content=content,
        model=model,
        stop_reason=stop_reason,
        stop_details=SimpleNamespace(type="refusal", category=category) if stop_reason == "refusal" else None,
        usage=SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens),
    )


class _Stream:
    def __init__(self, message):
        self._message = message

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_message(self):
        return self._message


class FakeAnthropic:
    """Records the kwargs of count_tokens and beta.messages.stream calls."""

    def __init__(self, final_message, input_tokens: int = 1000):
        self.final_message = final_message
        self.input_tokens = input_tokens
        self.stream_calls: list[dict] = []
        self.count_calls: list[dict] = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(stream=self._stream))
        self.messages = SimpleNamespace(count_tokens=self._count_tokens)

    def _stream(self, **kwargs):
        self.stream_calls.append(kwargs)
        return _Stream(self.final_message)

    def _count_tokens(self, **kwargs):
        self.count_calls.append(kwargs)
        return SimpleNamespace(input_tokens=self.input_tokens)
