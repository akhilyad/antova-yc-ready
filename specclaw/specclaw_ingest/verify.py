"""Verification against the sample pack's answer key (spec §15)."""

from __future__ import annotations

import json
import os
import secrets
import time
from datetime import datetime, timezone
from pathlib import Path

import specclaw_engine as engine
from specclaw_ingest import extract
from specclaw_ingest.parse import normalize


def _squash(text: str) -> str:
    return "".join(normalize(text).split())


def _same_passage(found: str, expected: str) -> bool:
    """The quote must overlap the answer-key passage: one contains the other.

    Claude is asked for the shortest sentence stating a value, so a correct
    quote may be one sentence of a two-sentence answer-key passage. Page and
    parsed values are checked separately and must match exactly.
    """
    a, b = _squash(found), _squash(expected)
    return bool(a) and (b in a or a in b)


def compare_to_answer_key(tender: engine.TenderPackage, expected: dict, result=None) -> list[str]:
    """Every difference between the tender and the answer key; [] when they agree.

    The optional keys a generated pack's key may carry (flags_include, evidence, pricing_status,
    price_status, warnings_include) are checked when present. `result` (the IngestResult) is
    needed only for warnings_include.
    """
    messages: list[str] = []
    cells = {(vid, p.id): cell for p in tender.parameters for vid, cell in p.vendors.items()}
    for vendor_id, by_param in expected["cells"].items():
        for param_id, want in by_param.items():
            label = f"{vendor_id} {param_id}"
            cell = cells.get((vendor_id, param_id))
            if cell is None:
                messages.append(f"{label}: missing from the tender")
                continue
            if cell.status.value != want["status"]:
                messages.append(f"{label}: status {cell.status.value} != expected {want['status']}")
            page = cell.citation["page"] if cell.citation else None
            if page != want["page"]:
                messages.append(f"{label}: page {page} != expected {want['page']}")
            elif want["quote"] is not None and not _same_passage(cell.snippet, want["quote"]):
                messages.append(f"{label}: quote {cell.snippet!r} does not match the expected passage")
            values = {c["field"]: c["offered"] for c in cell.checks}
            if values != want["values"]:
                messages.append(f"{label}: values {values} != expected {want['values']}")
            secondary = cell.secondary_citation["page"] if cell.secondary_citation else None
            if secondary != want["secondary_page"]:
                messages.append(f"{label}: secondary page {secondary} != expected {want['secondary_page']}")
            if round(cell.cost_adder, 2) != float(want["adder"]):
                messages.append(f"{label}: adder {cell.cost_adder:.2f} != expected {want['adder']}")
            flags = " | ".join(str(flag.get("message", flag)) if isinstance(flag, dict) else str(flag)
                               for flag in getattr(cell, "flags", None) or [])
            for fragment in want.get("flags_include", []):
                if fragment not in flags:
                    messages.append(f"{label}: no flag containing {fragment!r} (flags: {flags or 'none'})")
            if want.get("flags_none") and flags:
                messages.append(f"{label}: unexpected flags: {flags}")
            for key in ("evidence", "pricing_status"):
                if key in want and getattr(cell, key, None) != want[key]:
                    messages.append(f"{label}: {key} {getattr(cell, key, None)!r} != expected {want[key]!r}")

    for param in tender.parameters:
        want = expected["requirements"].get(param.id)
        page = param.requirement_citation["page"] if param.requirement_citation else None
        if want and page != want["page"]:
            messages.append(f"{param.id} requirement: page {page} != expected {want['page']}")
    if "negotiating_vendor" in expected and engine.negotiating_vendor_id(tender) != expected["negotiating_vendor"]:
        messages.append(f"negotiating vendor {engine.negotiating_vendor_id(tender)} "
                        f"!= expected {expected['negotiating_vendor']}")
    missing_params = set(expected["requirements"]) - {p.id for p in tender.parameters}
    messages.extend(f"{pid} requirement: not found in the MR spec" for pid in sorted(missing_params))

    financials = {f["vendor_id"]: f for f in engine.mask_unknown_prices(
        engine.evaluate_vendor_financials(tender, engine.SensitivitySettings(), []))}
    for vendor_id, want in expected["vendors"].items():
        vendor = next((v for v in tender.vendors if v.id == vendor_id), None)
        if vendor is None:
            messages.append(f"{vendor_id}: missing from the tender")
            continue
        # A null in the answer key means no usable price: the tender must carry null, never 0.
        want_headline = float(want["headline_price"]) if want["headline_price"] is not None else None
        if vendor.headline_price != want_headline:
            messages.append(f"{vendor_id}: headline price {vendor.headline_price} != expected {want['headline_price']}")
        true_price = financials[vendor_id]["true_evaluated_price"]
        want_true = float(want["true_evaluated_price"]) if want["true_evaluated_price"] is not None else None
        if true_price != want_true:
            messages.append(f"{vendor_id}: true evaluated price {true_price} != expected {want['true_evaluated_price']}")
        if "badge" in want and vendor.badge != want["badge"]:
            messages.append(f"{vendor_id}: badge {vendor.badge!r} != expected {want['badge']!r}")
        if "price_status" in want and financials[vendor_id]["price_status"] != want["price_status"]:
            messages.append(f"{vendor_id}: price status {financials[vendor_id]['price_status']!r} "
                            f"!= expected {want['price_status']!r}")
    warnings = list(result.warnings) if result is not None else []
    for fragment in expected.get("warnings_include", []):
        if result is not None and not any(fragment in w for w in warnings):
            messages.append(f"no warning containing {fragment!r}")
    return messages


# The concessions the answer key's round-3 clawback figures were computed with.
ROUND_3_CONCESSIONS = ["PARAM-01", "PARAM-02", "PARAM-03", "PARAM-05", "PARAM-06"]


def check_api_path(tender_id: str, expected: dict) -> list[str]:
    """Run ingest -> brief -> evaluate through the HTTP API (replaying saved responses).

    The routes need the founder review token. When ANTOVA_REVIEW_TOKEN is not
    configured, a random one is set for this in-process run only and removed after.
    """
    from fastapi.testclient import TestClient

    from specclaw_api import app
    from specclaw_auth import REVIEW_HEADER
    from specclaw_workers import job_manager

    messages: list[str] = []
    previous = job_manager.locator_factory
    previous_token = os.environ.get("ANTOVA_REVIEW_TOKEN")
    token = previous_token or secrets.token_urlsafe(32)
    os.environ["ANTOVA_REVIEW_TOKEN"] = token
    job_manager.locator_factory = lambda tender_dir, mode: extract.make_locator(tender_dir, "replay")
    try:
        with TestClient(app, headers={REVIEW_HEADER: token}) as client:
            response = client.post("/api/jobs/ingest", json={"tender_id": tender_id, "mode": "replay"})
            if response.status_code != 200:
                return [f"ingest request failed: {response.status_code} {response.text}"]
            job_id = response.json()["job_id"]
            status: dict = {}
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                status = client.get(f"/api/jobs/{job_id}").json()
                if status["status"] in ("COMPLETED", "FAILED"):
                    break
                time.sleep(0.1)
            if status.get("status") != "COMPLETED":
                return [f"ingest job did not complete: {status}"]

            brief = client.get(f"/api/review/tenders/{tender_id}")
            if brief.status_code != 200:
                return [f"GET /api/review/tenders/{tender_id} returned {brief.status_code}"]
            payload = brief.json()

            evaluation = client.post(f"/api/review/tenders/{tender_id}/evaluate", json={})
            if evaluation.status_code != 200:
                messages.append(f"POST /api/review/tenders/{tender_id}/evaluate returned {evaluation.status_code}")

            # The answer key prices the run itself. A founder override that survived the re-ingest
            # (its cell was unchanged) is a later judgement, so the comparison leaves it out.
            tender = engine.TenderPackage.model_validate(payload["tender"])
            for f in engine.evaluate_vendor_financials(tender, engine.SensitivitySettings(), []):
                want = expected["vendors"].get(f["vendor_id"])
                if want is None:
                    continue
                want_true = float(want["true_evaluated_price"]) if want["true_evaluated_price"] is not None else None
                if f["true_evaluated_price"] != want_true:
                    messages.append(f"evaluate {f['vendor_id']}: true price {f['true_evaluated_price']} "
                                    f"!= expected {want['true_evaluated_price']}")

            # Round-3 concessions, computed by the engine on the stored tender. The answer key names the
            # vendor whose deviations are closed; without one it is the lowest fully priced vendor (A2).
            closing = expected["clawback"].get("vendor_id")
            financials = engine.evaluate_vendor_financials(
                tender, engine.SensitivitySettings(), ROUND_3_CONCESSIONS, closing)
            clawed = round(sum(f["clawed_back_amount"] for f in financials), 2)
            if clawed != float(expected["clawback"]["round_3"]):
                messages.append(f"round 3 clawback {clawed:.2f} != expected {expected['clawback']['round_3']}")
    finally:
        job_manager.locator_factory = previous
        if previous_token is None:
            os.environ.pop("ANTOVA_REVIEW_TOKEN", None)
        else:
            os.environ["ANTOVA_REVIEW_TOKEN"] = previous_token
    return messages


def write_report(tender_dir: Path, payload: dict) -> Path:
    runs = Path(tender_dir) / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    path = runs / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")
    return path
