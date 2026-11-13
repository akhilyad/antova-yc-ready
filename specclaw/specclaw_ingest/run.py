"""Command line: ingest a tender folder, persist it, and optionally verify it.

Usage:
    python -m specclaw_ingest.run samples/TENDER-2026-402 [--mode replay|auto|live] [--verify]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import specclaw_engine as engine
from specclaw_db import SessionLocal, init_db
from specclaw_ingest import pipeline, verify


@contextmanager
def _tenders_root(folder: Path, tender_id: str):
    """Point the API at this folder's parent so it ingests the same files."""
    previous = os.environ.get("SPECCLAW_TENDERS_DIR")
    if folder.name == tender_id:
        os.environ["SPECCLAW_TENDERS_DIR"] = str(folder.parent)
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop("SPECCLAW_TENDERS_DIR", None)
        else:
            os.environ["SPECCLAW_TENDERS_DIR"] = previous


def _eur(value: float) -> str:
    return f"EUR {value:,.2f}"


def _summary(result) -> list[str]:
    stats, tender = result.stats, result.tender
    lines = [
        f"Ingested {tender.id}: {stats['documents']} documents, {stats['pages_parsed']} pages "
        f"({stats['sld_sheets']} drawing pages)",
        f"Quotes: {stats['candidates_accepted']} accepted, {stats['candidates_rejected']} rejected; "
        f"checks run: {stats['rules_evaluated']}; non-compliant cells: {stats['deviations_found']}",
    ]
    financials = engine.mask_unknown_prices(
        engine.evaluate_vendor_financials(tender, engine.SensitivitySettings(), []))
    for f in financials:
        if f["true_evaluated_price"] is None:
            # No headline price was found: there is no true price to state, only the adders.
            lines.append(f"  {f['vendor_id']} {f['name']}: headline not found, "
                         f"adders {_eur(f['total_adders'])}, true price not available [{f['badge']}]")
            continue
        partial = " (lower bound: unpriced items)" if f["price_status"] == "UNPRICED_ITEMS" else ""
        lines.append(f"  {f['vendor_id']} {f['name']}: headline {_eur(f['headline_price'])}, "
                     f"adders {_eur(f['total_adders'])}, true price {_eur(f['true_evaluated_price'])}{partial} "
                     f"[{f['badge']}]")
    unpriced = stats["unpriced_items"]
    lines.append(f"Unpriced items: {len(unpriced) or 'none'}")
    lines.append(f"Claude API cost: ${stats['api_cost_usd']:.4f}; duration {stats['duration_s']:.2f} s")
    lines.append("Warnings: " + ("none" if not result.warnings else ""))
    lines.extend(f"  - {w}" for w in result.warnings)
    return lines


def main(argv: list[str] | None = None) -> int:
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if reconfigure:
        try:
            reconfigure(errors="replace")
        except Exception:
            pass
    parser = argparse.ArgumentParser(prog="python -m specclaw_ingest.run", description=__doc__.splitlines()[0])
    parser.add_argument("tender_dir", type=Path)
    parser.add_argument("--mode", choices=("replay", "auto", "live"), default="auto")
    parser.add_argument("--verify", action="store_true", help="compare with expected.json and exercise the API")
    args = parser.parse_args(argv)
    tender_dir = args.tender_dir.resolve()

    init_db()
    try:
        result = pipeline.run_ingest(tender_dir, mode=args.mode,
                                     progress=lambda stage, pct: print(f"  [{pct:3d}%] {stage}"))
    except pipeline.IngestFailed as exc:
        print(f"FAILED: {exc}")
        return 1
    db = SessionLocal()
    try:
        pipeline.persist(result, db)
    finally:
        db.close()
    print("\n".join(_summary(result)))

    if not args.verify:
        return 0
    expected_path = tender_dir / "expected.json"
    if not expected_path.is_file():
        print(f"FAILED: no expected.json in {tender_dir}")
        return 1
    expected = json.loads(expected_path.read_text(encoding="utf-8"))
    mismatches = verify.compare_to_answer_key(result.tender, expected)
    with _tenders_root(tender_dir, result.tender.id):
        mismatches += [f"API: {m}" for m in verify.check_api_path(result.tender.id, expected)]
    report = verify.write_report(tender_dir, {
        "tender_id": result.tender.id,
        "mode": args.mode,
        "ran_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "passed": not mismatches,
        "mismatches": mismatches,
        "stats": result.stats,
        "cells": {
            f"{vid} {p.id}": {"status": cell.status.value, "page": cell.citation["page"] if cell.citation else None,
                              "adder": cell.cost_adder}
            for p in result.tender.parameters for vid, cell in p.vendors.items()
        },
    })
    if mismatches:
        print(f"VERIFY FAILED ({len(mismatches)} mismatches):")
        print("\n".join(f"  - {m}" for m in mismatches))
    else:
        print("PASS: matches the answer key and the API path")
    print(f"Report: {report}")
    return 0 if not mismatches else 1


if __name__ == "__main__":
    raise SystemExit(main())
