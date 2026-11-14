"""Evaluate the pipeline on every generated edge-case pack.

    python -m antova_ingest.eval [--seeds 3] [--json]

Generates one pack per mutation operator and seed (samples/mutate.py) in a temporary
folder, ingests each with the answer-key locator, and prints one row per operator:
what each stage did and how the result compares with the pack's derived answer key.
Free and offline: no LLM API call is made, so this says nothing about the model itself.
To score the locator on saved (or freshly recorded) the model answers, use
python -m antova_ingest.locator_eval.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import time
from pathlib import Path

from samples import mutate
from antova_ingest import verify
from antova_ingest.pipeline import IngestFailed, run_ingest
from antova_ingest.answer_key import AnswerKeyLocator

COLUMNS = [
    ("operator", "operator"), ("packs", "packs"), ("accepted", "quotes ok"), ("rejected", "rejected"),
    ("sweep_hits", "sweep hits"), ("sweep_new", "sweep new"), ("recall", "recall"),
    ("status", "status acc"), ("pricing", "pricing acc"), ("flags", "flags"), ("mismatches", "key diffs"),
]


def _cells(tender) -> dict:
    return {(vid, p.id): cell for p in tender.parameters for vid, cell in p.vendors.items()}


def evaluate_pack(target: Path) -> dict:
    """One pack's numbers. Status and pricing accuracy are shares of its cells that match the key."""
    expected = json.loads((target / "expected.json").read_text(encoding="utf-8"))
    result = run_ingest(target, locator=AnswerKeyLocator(expected))
    cells = _cells(result.tender)
    total = status_ok = pricing_ok = 0
    for vendor_id, by_param in expected["cells"].items():
        for param_id, want in by_param.items():
            cell = cells.get((vendor_id, param_id))
            total += 1
            if cell is None:
                continue
            status_ok += cell.status.value == want["status"]
            priced_as_expected = want.get("pricing_status") in (None, cell.pricing_status)
            pricing_ok += round(cell.cost_adder, 2) == float(want["adder"]) and priced_as_expected
    stats = result.stats
    return {
        "packs": 1, "cells": total, "status_ok": status_ok, "pricing_ok": pricing_ok,
        "accepted": stats["candidates_accepted"], "rejected": stats["candidates_rejected"],
        "sweep_hits": stats["sweep_hits"], "sweep_new": stats["sweep_new_candidates"],
        "recall_sum": stats["sweep_recall"], "flags": stats["flags_raised"],
        "mismatches": len(verify.compare_to_answer_key(result.tender, expected, result)),
    }


def _add(total: dict, part: dict) -> dict:
    return {key: total.get(key, 0) + value for key, value in part.items()}


def _row(name: str, numbers: dict) -> dict:
    cells = numbers["cells"] or 1
    return {
        "operator": name, "packs": numbers["packs"], "accepted": numbers["accepted"], "rejected": numbers["rejected"],
        "sweep_hits": numbers["sweep_hits"], "sweep_new": numbers["sweep_new"],
        "recall": f"{numbers['recall_sum'] / numbers['packs']:.1%}",
        "status": f"{numbers['status_ok'] / cells:.1%}", "pricing": f"{numbers['pricing_ok'] / cells:.1%}",
        "flags": numbers["flags"], "mismatches": numbers["mismatches"],
    }


def run(seeds: int = 3, out_dir: Path | None = None) -> list[dict]:
    """One row per operator (plus the unmutated base pack and a total), each over `seeds` packs."""
    out_dir = Path(out_dir) if out_dir else Path(tempfile.mkdtemp(prefix="antova-eval-"))
    rows, grand = [], {}
    for name in ["(base pack)", *sorted(mutate.OPERATORS)]:
        operators = [] if name == "(base pack)" else [name]
        numbers: dict = {}
        for seed in range(1 if not operators else seeds):
            try:
                target = mutate.generate(operators, out_dir / f"{name.strip('()').replace(' ', '-')}-{seed}", seed)
                numbers = _add(numbers, evaluate_pack(target))
            except (mutate.MutationError, IngestFailed) as exc:
                print(f"{name} seed {seed}: {type(exc).__name__}: {exc}", file=sys.stderr)
        if numbers:
            rows.append(_row(name, numbers))
            grand = _add(grand, numbers)
    if grand:
        rows.append(_row("TOTAL", grand))
    return rows


def format_table(rows: list[dict]) -> str:
    widths = [max(len(title), *(len(str(row[key])) for row in rows)) for key, title in COLUMNS]
    def line(values):
        return "| " + " | ".join(str(v).ljust(w) if i == 0 else str(v).rjust(w)
                                 for i, (v, w) in enumerate(zip(values, widths))) + " |"
    rule = "|" + "|".join("-" * (w + 2) for w in widths) + "|"
    return "\n".join([line([title for _, title in COLUMNS]), rule, *(line([row[key] for key, _ in COLUMNS]) for row in rows)])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m antova_ingest.eval", description=__doc__.splitlines()[0])
    parser.add_argument("--seeds", type=int, default=3, help="packs generated per operator (default 3)")
    parser.add_argument("--json", action="store_true", help="print the rows as JSON instead of a table")
    args = parser.parse_args(argv)
    started = time.perf_counter()
    rows = run(args.seeds)
    print(json.dumps(rows, indent=2) if args.json else format_table(rows))
    if not args.json:
        print(f"\n{rows[-1]['packs']} packs, answer-key locator (no API call), {time.perf_counter() - started:.1f} s")
    return 0 if rows and rows[-1]["mismatches"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
