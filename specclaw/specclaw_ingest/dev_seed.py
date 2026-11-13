"""Load the synthetic sample tender into the local database, offline. Development and tests only.

    python -m specclaw_ingest.dev_seed [--share-id ID] [--draft]

Ingests samples/TENDER-2026-402 with the answer-key locator (never calls the Claude API,
needs no ANTHROPIC_API_KEY), saves it, verifies it unless --draft, and prints
`share_id=<id>`. --share-id applies only when the tender is new: a tender already in the
database keeps its share ID, and the printed value is the one stored.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone

from sqlalchemy import Engine
from sqlalchemy.orm import Session

import specclaw_db
from specclaw_cache import leveling_cache
from specclaw_db import TenderRepository, init_db
from specclaw_ingest.pipeline import persist, run_ingest
from specclaw_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected
from specclaw_review import open_items


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
            remaining = open_items(result.tender, {})  # persist cleared any overrides
            if remaining:
                raise SystemExit(f"{len(remaining)} open items remain; seed with --draft instead")
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
