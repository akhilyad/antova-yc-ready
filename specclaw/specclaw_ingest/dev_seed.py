"""Load the synthetic sample tender into the local database, offline. Development and tests only.

    python -m specclaw_ingest.dev_seed [--share-id ID] [--draft]

Ingests samples/TENDER-2026-402 with the answer-key locator (never calls the Claude API,
needs no ANTHROPIC_API_KEY), saves it, verifies it unless --draft, and prints
`share_id=<id>`. The sample is evaluated with rate table v2, which flags and leaves unpriced
VoltSwitch's warranty measured from dispatch, so a verified seed first records the founder's
review of that flag and the founder's price for the gap (see `founder_resolution`).
--share-id applies only when the tender is new: a tender already in the
database keeps its share ID, and the printed value is the one stored.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import Engine
from sqlalchemy.orm import Session

import specclaw_db
from specclaw_cache import leveling_cache
from specclaw_db import TenderRepository, init_db
from specclaw_engine import Override, TenderPackage
from specclaw_ingest.pipeline import persist, run_ingest
from specclaw_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected
from specclaw_review import evidence_hash, open_items

SEED_REVIEWER = "founder"
# The gap the sample leaves unpriced under rate table v2: VoltSwitch offers 18 months from dispatch against
# 36 from commissioning. The founder prices the whole cell: the EXW-to-DDP freight and insurance the table
# already priced (6,150) plus 18 months x EUR 175 on the months-only basis (3,150).
FOUNDER_OVERRIDES = {
    ("PARAM-06", "vendor-b"): Override(
        adder_eur=Decimal("9300.00"),
        note="Priced by the founder: freight 6,150 plus 18 months x EUR 175, pending VoltSwitch's warranty start date"),
}
FOUNDER_REVIEW_NOTE = "Warranty start date checked against the bid; the gap is priced by an override"


def founder_resolution(tender: TenderPackage) -> tuple[dict[tuple[str, str], Override], dict[tuple[str, str], dict[str, Any]]]:
    """The overrides and approvals that clear every open item of the sample, as the founder would record them.

    Every flagged cell is approved and every unpriced cell is priced from FOUNDER_OVERRIDES; a cell that needs
    something else is left open. Returns (overrides, reviews) keyed (param_id, vendor_id), reviews shaped like
    `TenderRepository.latest_reviews`.
    """
    overrides: dict[tuple[str, str], Override] = {}
    reviews: dict[tuple[str, str], dict[str, Any]] = {}
    for p in tender.parameters:
        for vendor_id, cell in p.vendors.items():
            key = (p.id, vendor_id)
            if cell.flags:
                reviews[key] = {"action": "approve", "reviewer": SEED_REVIEWER, "note": FOUNDER_REVIEW_NOTE,
                                "evidence_hash": evidence_hash(cell)}
            if cell.pricing_status == "UNPRICED" and key in FOUNDER_OVERRIDES:
                overrides[key] = FOUNDER_OVERRIDES[key]
    return overrides, reviews


def seed(share_id: str | None = None, draft: bool = False, bind: Engine | None = None) -> str:
    """Ingest and save the sample; verify it unless `draft`. Returns the stored share ID."""
    bind = bind or specclaw_db.engine
    init_db(bind)
    result = run_ingest(PACK, locator=AnswerKeyLocator(load_expected()))
    with Session(bind) as db:
        persist(result, db, share_id=share_id)
        repo = TenderRepository(db)
        tender_id = result.tender.id
        if not draft:
            overrides, reviews = founder_resolution(result.tender)  # persist cleared any overrides
            remaining = open_items(result.tender, overrides, reviews)
            if remaining:
                raise SystemExit(f"{len(remaining)} open items remain; seed with --draft instead")
            for (param_id, vendor_id), review in reviews.items():
                repo.add_review(tender_id, param_id, vendor_id, action=review["action"], reviewer=review["reviewer"],
                                note=review["note"], evidence_hash=review["evidence_hash"])
            for (param_id, vendor_id), override in overrides.items():
                repo.put_override(tender_id, param_id, vendor_id, override.adder_eur, override.note)
            repo.set_status(tender_id, "VERIFIED", datetime.now(timezone.utc))
            leveling_cache.invalidate_tender(tender_id)
        return repo.get_meta(tender_id).share_id


def main(argv: list[str] | None = None, bind: Engine | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m specclaw_ingest.dev_seed", description=__doc__.splitlines()[0])
    parser.add_argument("--share-id", help="share ID for the tender if it is not in the database yet")
    parser.add_argument("--draft", action="store_true", help="leave the brief in DRAFT instead of verifying it")
    args = parser.parse_args(argv)
    stored = seed(args.share_id, args.draft, bind)
    if args.share_id and stored != args.share_id:
        print("note: the tender already exists and keeps its share ID", file=sys.stderr)
    print(f"share_id={stored}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
