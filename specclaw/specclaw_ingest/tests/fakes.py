"""Test doubles: a recording fake Anthropic client (the answer-key locator is specclaw_ingest.answer_key)."""

from __future__ import annotations

from types import SimpleNamespace

# The answer-key locator lives in specclaw_ingest.answer_key (the dev tools use it); re-exported for tests.
from specclaw_ingest.answer_key import PACK, AnswerKeyLocator, load_expected  # noqa: F401

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
