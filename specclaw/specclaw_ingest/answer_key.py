"""The sample tenders' answer key as a locator: the ideal Claude, for offline runs and tests.

Used by the dev tools (dev_seed, export_fixtures, eval) and by tests. It is not a test double of
the production path: it needs no network and no API key, which is why `answer_key` is an ingest
mode of its own.
"""

from __future__ import annotations

import json
from pathlib import Path

from specclaw_ingest.extract import LocateOutcome, LocateResponse
from specclaw_ingest.ontology import PARAMETERS
from specclaw_ingest.types import ParsedDocument

PACK = Path(__file__).resolve().parents[1] / "samples" / "TENDER-2026-402"


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
