"""The locate call on an OpenAI-compatible chat-completions endpoint (Experiential Labs).

Same job as extract.ClaudeLocator, same prompt, same answer format, same page windows, same
saved-response replay; only the transport differs. It needs no SDK: one POST to
{base_url}/chat/completions with httpx.

Settings (read from the environment, which specclaw/.env feeds):

    EXPLABS_API_KEY              required for a live call; sent as a bearer token, never logged
    EXPLABS_MODEL                default gpt-6-luna
    EXPLABS_BASE_URL             default https://api.experientiallabs.ai/v1 (https, or http on localhost)
    EXPLABS_MAX_INPUT_TOKENS     the model's context for one call; default 100000. A longer bid is windowed.
    EXPLABS_MAX_OUTPUT_TOKENS    sent as max_tokens when set; unset leaves the endpoint's default
    EXPLABS_JSON_MODE            json_object (default) or off, for an endpoint that rejects response_format
    EXPLABS_PRICE_INPUT_PER_MTOK / EXPLABS_PRICE_OUTPUT_PER_MTOK   USD per million tokens, for the
                                 run-cost figure; unset counts as 0, so the cost shown is then not real

Token counts for window planning are estimated from text length (this API has no count endpoint),
so the estimate errs high.
"""

from __future__ import annotations

import json
import os
import re
import time
from decimal import Decimal
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

import httpx

from specclaw_ingest import extract
from specclaw_ingest.extract import (
    ClaudeLocator,
    ExtractError,
    LocateInvalid,
    LocateOutcome,
    LocateRefused,
    LocateResponse,
    MissingCredentials,
    Mode,
    ResponseStore,
)
from specclaw_ingest.types import ParsedDocument

KEY_VARIABLE = "EXPLABS_API_KEY"
DEFAULT_MODEL = "gpt-6-luna"
DEFAULT_BASE_URL = "https://api.experientiallabs.ai/v1"
DEFAULT_MAX_INPUT_TOKENS = 100_000
CHARS_PER_TOKEN = 3.5  # a low figure, so the estimate is high
RETRY_STATUSES = (429, 500, 502, 503, 504)
RETRIES = 3

_FENCE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.DOTALL)


class LocateApiError(ExtractError):
    """The endpoint answered with an error, or could not be reached."""


def _env_int(name: str, default: int | None) -> int | None:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ValueError(f"{name} must be a whole number, not {raw!r}") from None
    if value < 1:
        raise ValueError(f"{name} must be at least 1")
    return value


def _env_price(name: str) -> Decimal:
    raw = (os.environ.get(name) or "").strip()
    try:
        return Decimal(raw) if raw else Decimal("0")
    except ArithmeticError:
        raise ValueError(f"{name} must be a number, not {raw!r}") from None


def check_base_url(url: str) -> str:
    """The URL without a trailing slash. https only: the API key travels in the request. http is
    accepted for localhost, for a local gateway or test server."""
    parsed = urlparse(url)
    local = parsed.hostname in ("localhost", "127.0.0.1", "::1")
    if parsed.scheme != "https" and not (parsed.scheme == "http" and local):
        raise ValueError(f"EXPLABS_BASE_URL must be an https URL (or http on localhost), not {url!r}")
    if not parsed.hostname:
        raise ValueError(f"EXPLABS_BASE_URL has no host: {url!r}")
    return url.rstrip("/")


def schema_instruction() -> str:
    schema = json.dumps(LocateResponse.model_json_schema(), separators=(",", ":"))
    return (
        "\n\nOutput format: reply with one JSON object and nothing else (no prose, no code fence) that "
        f"matches this JSON Schema. Use null for a missing headline_price or cover_claim.\n{schema}"
    )


class ChatCompletionsLocator(ClaudeLocator):
    """ClaudeLocator's flow (saved answers, replay, windows, merge) over /chat/completions."""

    def __init__(
        self,
        store: ResponseStore,
        mode: Mode,
        *,
        model: str = DEFAULT_MODEL,
        base_url: str = DEFAULT_BASE_URL,
        max_input_tokens: int = DEFAULT_MAX_INPUT_TOKENS,
        max_output_tokens: int | None = None,
        json_mode: bool = True,
        prices: tuple[Decimal, Decimal] = (Decimal("0"), Decimal("0")),
        client_factory: Callable[[], Any] | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ):
        super().__init__(store, mode, client_factory=client_factory or self._http_client)
        self.model = model
        self.base_url = check_base_url(base_url)
        self._max_input_tokens = max_input_tokens
        self.max_output_tokens = max_output_tokens
        self.json_mode = json_mode
        self.prices = prices
        self._sleep = sleep

    @classmethod
    def from_env(cls, tender_dir: Path, mode: Mode) -> "ChatCompletionsLocator":
        model = (os.environ.get("EXPLABS_MODEL") or DEFAULT_MODEL).strip()
        base_url = (os.environ.get("EXPLABS_BASE_URL") or DEFAULT_BASE_URL).strip()
        json_mode = (os.environ.get("EXPLABS_JSON_MODE") or "json_object").strip().lower()
        if json_mode not in ("json_object", "off"):
            raise ValueError(f"EXPLABS_JSON_MODE must be json_object or off, not {json_mode!r}")
        prompt = extract.build_system_prompt() + schema_instruction()
        store = ResponseStore(Path(tender_dir) / "claude_responses", model=model,
                              salt=extract.sha256_short(prompt))
        return cls(
            store, mode, model=model, base_url=base_url,
            max_input_tokens=_env_int("EXPLABS_MAX_INPUT_TOKENS", DEFAULT_MAX_INPUT_TOKENS),
            max_output_tokens=_env_int("EXPLABS_MAX_OUTPUT_TOKENS", None),
            json_mode=json_mode == "json_object",
            prices=(_env_price("EXPLABS_PRICE_INPUT_PER_MTOK"), _env_price("EXPLABS_PRICE_OUTPUT_PER_MTOK")),
        )

    # --- ClaudeLocator hooks -------------------------------------------------------------------

    @property
    def max_input_tokens(self) -> int:
        return self._max_input_tokens

    def _ready(self, filename: str) -> None:
        if not os.environ.get(KEY_VARIABLE):
            raise MissingCredentials(filename, KEY_VARIABLE)

    def _system(self) -> str:
        return extract.build_system_prompt() + schema_instruction()

    def _count(self, client: Any, system: str, content: str) -> int:
        return int((len(system) + len(content)) / CHARS_PER_TOKEN) + 1

    # --- transport -----------------------------------------------------------------------------

    def _http_client(self) -> httpx.Client:
        return httpx.Client(
            base_url=self.base_url,
            headers={"Authorization": f"Bearer {os.environ[KEY_VARIABLE]}", "Content-Type": "application/json"},
            timeout=httpx.Timeout(900.0, connect=30.0),
        )

    def _redact(self, text: str) -> str:
        key = os.environ.get(KEY_VARIABLE, "")
        return text.replace(key, "***") if key else text

    def _post(self, client: Any, payload: dict, label: str) -> dict:
        for attempt in range(RETRIES + 1):
            try:
                response = client.post("/chat/completions", json=payload)
            except httpx.HTTPError as exc:
                if attempt < RETRIES:
                    self._sleep(2.0 * 2 ** attempt)
                    continue
                raise LocateApiError(label, f"Could not reach {self.base_url} for {label}: "
                                            f"{self._redact(type(exc).__name__)}") from exc
            if response.status_code in RETRY_STATUSES and attempt < RETRIES:
                after = response.headers.get("retry-after", "")
                self._sleep(float(after) if after.replace(".", "", 1).isdigit() else 2.0 * 2 ** attempt)
                continue
            if response.status_code >= 400:
                detail = self._redact(response.text[:300].replace("\n", " "))
                hint = " Check EXPLABS_API_KEY." if response.status_code in (401, 403) else ""
                raise LocateApiError(label, f"{self.base_url} answered {response.status_code} for {label}: "
                                            f"{detail}{hint}")
            try:
                return response.json()
            except ValueError as exc:
                raise LocateApiError(label, f"{self.base_url} sent a response for {label} that is not JSON") from exc
        raise AssertionError("unreachable")

    def _send(self, client: Any, doc: ParsedDocument, system: str, pages: list | None) -> LocateOutcome:
        filename = doc.entry.file
        label = filename if pages is None else f"{filename} p.{pages[0].number}-{pages[-1].number}"
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": extract.build_document_content(doc, pages)},
            ],
        }
        if self.json_mode:
            payload["response_format"] = {"type": "json_object"}
        if self.max_output_tokens:
            payload["max_tokens"] = self.max_output_tokens
        data = self._post(client, payload, label)
        try:
            choice = data["choices"][0]
            text = choice["message"]["content"] or ""
            finish = choice.get("finish_reason")
            usage = data.get("usage") or {}
        except (KeyError, IndexError, TypeError) as exc:
            raise LocateInvalid(label, f"The response for {label} has no message to read") from exc
        if finish == "content_filter":
            raise LocateRefused(label, "content_filter")
        if finish == "length":
            raise LocateInvalid(label, f"The response for {label} was cut off at the output limit; "
                                       f"set EXPLABS_MAX_OUTPUT_TOKENS higher")
        fenced = _FENCE.match(text)
        try:
            response = LocateResponse.model_validate_json(fenced.group(1) if fenced else text)
        except ValueError as exc:
            raise LocateInvalid(label, f"The response for {label} did not match the schema: {exc}") from exc
        return LocateOutcome(response, int(usage.get("prompt_tokens") or 0), int(usage.get("completion_tokens") or 0),
                             from_store=False, model=self.model)
