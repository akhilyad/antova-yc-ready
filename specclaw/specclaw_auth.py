"""Founder review token for the gated API routes.

The expected token comes from env ANTOVA_REVIEW_TOKEN, read on every request so
it can be rotated (or set by a test) without re-importing the app.
"""

import hmac
import os

from fastapi import Header, HTTPException

REVIEW_HEADER = "X-Antova-Review-Token"


def require_review_token(x_antova_review_token: str | None = Header(default=None)) -> None:
    expected = os.environ.get("ANTOVA_REVIEW_TOKEN", "")
    if not expected:
        raise HTTPException(status_code=503, detail="Review is not configured on this server")
    given = (x_antova_review_token or "").strip()
    if not given or not hmac.compare_digest(given.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Invalid review token")
