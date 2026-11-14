"""Review tokens for the gated API routes.

A token names a reviewer. Two ways to configure them, read on every request so they can be
rotated (or set by a test) without re-importing the app:

- ANTOVA_REVIEW_TOKEN: one shared token. Whoever holds it is the reviewer "founder".
- ANTOVA_REVIEWERS: JSON, {"<reviewer id>": {"name": "Ada Lovelace", "token": "<secret>"}, ...}.

Both may be set. The server decides who a request is from the token it carries; the reviewer
name a client types into a request body is never used for attribution.
"""

import hmac
import json
import logging
import os
from dataclasses import dataclass

from fastapi import Header, HTTPException

REVIEW_HEADER = "X-Antova-Review-Token"
FOUNDER_ID = "founder"

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class ReviewerPrincipal:
    id: str
    name: str


class ReviewerConfigError(ValueError):
    """ANTOVA_REVIEWERS is malformed, or two reviewers share a token."""


def _configured() -> list[tuple[str, ReviewerPrincipal]]:
    """Every (token, reviewer) pair the server accepts. Raises ReviewerConfigError."""
    pairs: list[tuple[str, ReviewerPrincipal]] = []
    shared = os.environ.get("ANTOVA_REVIEW_TOKEN", "")
    if shared:
        pairs.append((shared, ReviewerPrincipal(FOUNDER_ID, "Founder")))
    raw = os.environ.get("ANTOVA_REVIEWERS", "").strip()
    if raw:
        try:
            data = json.loads(raw)
            if not isinstance(data, dict):
                raise TypeError("expected an object")
            for reviewer_id, entry in data.items():
                token, name = entry["token"], entry.get("name") or reviewer_id
                if not isinstance(token, str) or not token or not isinstance(name, str):
                    raise TypeError(f"reviewer {reviewer_id!r} needs a token and a name that are strings")
                if not str(reviewer_id).strip() or len(str(reviewer_id)) > 64:
                    raise TypeError("reviewer ids are 1 to 64 characters")
                pairs.append((token, ReviewerPrincipal(str(reviewer_id), name)))
        except (ValueError, TypeError, KeyError, AttributeError) as exc:
            raise ReviewerConfigError(f"ANTOVA_REVIEWERS is not valid: {exc}") from exc
    tokens = [token for token, _ in pairs]
    if len(set(tokens)) != len(tokens):
        raise ReviewerConfigError("two reviewers share a token")
    ids = [principal.id for _, principal in pairs]
    if len(set(ids)) != len(ids):
        raise ReviewerConfigError("two reviewers share an id")
    return pairs


def require_review_token(x_antova_review_token: str | None = Header(default=None)) -> ReviewerPrincipal:
    try:
        pairs = _configured()
    except ReviewerConfigError as exc:
        # A broken configuration fails closed, and the log says why; the client learns only that
        # review is unavailable.
        log.error("%s", exc)
        pairs = []
    if not pairs:
        raise HTTPException(status_code=503, detail="Review is not configured on this server")
    given = (x_antova_review_token or "").strip().encode("utf-8")
    match = None
    for token, principal in pairs:  # every token is compared, so timing does not reveal which one is close
        if hmac.compare_digest(given, token.encode("utf-8")) and given:
            match = principal
    if match is None:
        raise HTTPException(status_code=401, detail="Invalid review token")
    return match
