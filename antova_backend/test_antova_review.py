"""Open items that block verifying a brief, and the brief payload both pages render."""

import dataclasses
import json
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from antova_db import TenderMeta, TenderRepository, init_db
from antova_engine import ComplianceStatus, Override, SensitivitySettings
from antova_ingest.tests.helpers import sample_tender
from antova_review import OpenItem, brief_payload, open_items


def _clean_sample(headlines=None):
    """The sample priced with the months-only table v1, which prices every cell, so it has no open items.

    Under the sample's own table (v2) the dispatch-basis warranty is unpriced and open; see
    test_the_sample_under_the_strict_table_has_one_open_item. These tests are about open items in general,
    so they start from a tender with none.
    """
    return sample_tender(headlines, rate_table="mv_gis_switchgear_v1")


def _cell(tender, param_id, vendor_id):
    return next(p for p in tender.parameters if p.id == param_id).vendors[vendor_id]


def _tender_with_open_cells():
    """vendor-c PARAM-03 unpriced, vendor-a PARAM-05 needs inspection; the sample has no other open items."""
    tender = _clean_sample()
    _cell(tender, "PARAM-03", "vendor-c").pricing_status = "UNPRICED"
    _cell(tender, "PARAM-05", "vendor-a").status = ComplianceStatus.MANUAL_INSPECTION_REQUIRED
    return tender


def _meta(**changes):
    meta = TenderMeta(
        tender_id="TENDER-2026-402", title="t", share_id="share-abc", status="VERIFIED",
        verified_at=datetime(2026, 11, 5, 9, 30, tzinfo=timezone.utc),
        ingested_at=datetime(2026, 11, 5, 9, 0, tzinfo=timezone.utc), ingest_mode="replay", synthetic=True,
        ingest_stats={"pages": 22}, stage_log=[{"stage": "parse", "ms": 120}],
    )
    return dataclasses.replace(meta, **changes)


def test_sample_tender_has_no_open_items():
    assert open_items(_clean_sample(), {}) == []


def test_the_sample_under_the_strict_table_has_one_open_item():
    """Rate table v2 leaves VoltSwitch's dispatch-basis warranty unpriced, and an override resolves it."""
    tender = sample_tender()
    assert open_items(tender, {}) == [
        OpenItem(kind="unpriced", vendor_id="vendor-b", param_id="PARAM-06", message="Gap found but not priced")]
    priced = {("PARAM-06", "vendor-b"): Override(adder_eur=Decimal("9300.00"), note="founder's price")}
    assert open_items(tender, priced) == []


def test_open_items_unpriced_and_inspection():
    items = open_items(_tender_with_open_cells(), {})
    assert items == [
        OpenItem(kind="needs_inspection", vendor_id="vendor-a", param_id="PARAM-05",
                 message="Evidence needs inspection"),
        OpenItem(kind="unpriced", vendor_id="vendor-c", param_id="PARAM-03",
                 message="Gap found but not priced"),
    ]


def test_cell_both_unpriced_and_needing_inspection_lists_both():
    tender = _clean_sample()
    cell = _cell(tender, "PARAM-02", "vendor-b")
    cell.pricing_status = "UNPRICED"
    cell.status = ComplianceStatus.MANUAL_INSPECTION_REQUIRED
    assert [(i.kind, i.param_id) for i in open_items(tender, {})] == [
        ("unpriced", "PARAM-02"), ("needs_inspection", "PARAM-02"),
    ]


def test_override_resolves_open_item():
    tender = _tender_with_open_cells()
    overrides = {
        ("PARAM-03", "vendor-c"): Override(adder_eur=Decimal("3000"), note="engineer's estimate"),
        ("PARAM-05", "vendor-a"): Override(adder_eur=Decimal("0"), note="checked the drawing: compliant"),
    }
    assert open_items(tender, overrides) == []
    only_one = {("PARAM-03", "vendor-c"): overrides[("PARAM-03", "vendor-c")]}
    assert [(i.kind, i.vendor_id) for i in open_items(tender, only_one)] == [("needs_inspection", "vendor-a")]


def test_missing_headline_is_open_item():
    tender = _clean_sample(headlines={"vendor-a": 452000.0, "vendor-b": 0.0, "vendor-c": 439000.0})
    assert open_items(tender, {}) == [
        OpenItem(kind="missing_price", vendor_id="vendor-b", param_id=None,
                 message="Bid price not found; fix the source and re-ingest"),
    ]


def test_missing_headline_comes_before_the_vendors_cell_items():
    tender = _clean_sample(headlines={"vendor-a": 0.0, "vendor-b": 418000.0, "vendor-c": 439000.0})
    _cell(tender, "PARAM-05", "vendor-a").status = ComplianceStatus.MANUAL_INSPECTION_REQUIRED
    assert [(i.kind, i.vendor_id, i.param_id) for i in open_items(tender, {})] == [
        ("missing_price", "vendor-a", None), ("needs_inspection", "vendor-a", "PARAM-05"),
    ]


def test_cell_missing_for_a_vendor_is_skipped():
    tender = _tender_with_open_cells()
    del next(p for p in tender.parameters if p.id == "PARAM-05").vendors["vendor-a"]
    assert [(i.kind, i.vendor_id) for i in open_items(tender, {})] == [("unpriced", "vendor-c")]


def test_brief_payload_keys_and_override_shape():
    tender = _tender_with_open_cells()
    overrides = {
        ("PARAM-03", "vendor-c"): Override(adder_eur=Decimal("12000"), note="engineer's estimate"),
        ("PARAM-01", "vendor-b"): Override(adder_eur=Decimal("950.5"), note="vendor clarification"),
    }
    documents = [{"filename": "mr.pdf", "role": "mr", "vendor_id": None, "page_count": 12}]
    payload = brief_payload(tender, _meta(), documents, overrides, SensitivitySettings())

    assert set(payload) == {
        "share_id", "status", "verified_at", "synthetic", "ingest_mode", "ingest_stats", "stage_log",
        "documents", "tender", "financials", "overrides", "open_items",
        "review",  # phase 3, WP7: open review flags and whether the result is final
    }
    assert payload["share_id"] == "share-abc"
    assert payload["status"] == "VERIFIED"
    assert payload["verified_at"] == "2026-11-05T09:30:00+00:00"
    assert payload["synthetic"] is True
    assert payload["ingest_mode"] == "replay"
    assert payload["ingest_stats"] == {"pages": 22}
    assert payload["stage_log"] == [{"stage": "parse", "ms": 120}]
    assert payload["documents"] == documents
    assert payload["tender"] == tender.model_dump(mode="json")

    # Sorted by (param_id, vendor_id); adder_eur always a two-decimal string.
    assert payload["overrides"] == [
        {"param_id": "PARAM-01", "vendor_id": "vendor-b", "adder_eur": "950.50", "note": "vendor clarification"},
        {"param_id": "PARAM-03", "vendor_id": "vendor-c", "adder_eur": "12000.00", "note": "engineer's estimate"},
    ]

    vendor_c = next(f for f in payload["financials"] if f["vendor_id"] == "vendor-c")
    row = next(r for r in vendor_c["itemized_breakdown"] if r["param_id"] == "PARAM-03")
    assert row["adder_eur"] == 12000.0
    assert row["is_overridden"] is True
    assert row["override_note"] == "engineer's estimate"
    assert vendor_c["true_evaluated_price"] == 439000.0 + 6200 + 4100 + 2600 + 2100 + 12000

    # The overridden unpriced cell is resolved; the inspection cell is still open.
    assert payload["open_items"] == [
        {"kind": "needs_inspection", "vendor_id": "vendor-a", "param_id": "PARAM-05",
         "message": "Evidence needs inspection"},
    ]
    json.dumps(payload)  # the payload goes straight into HTTP responses and fixtures


def test_brief_payload_verified_at_from_the_database_keeps_utc_offset(tmp_path):
    db_engine = create_engine(f"sqlite:///{(tmp_path / 'review.db').as_posix()}")
    init_db(db_engine)
    tender = _clean_sample()
    with Session(db_engine) as session:
        repo = TenderRepository(session)
        repo.save_tender(tender, [], datetime(2026, 11, 5, 9, 0, tzinfo=timezone.utc))
        repo.set_status(tender.id, "VERIFIED", datetime(2026, 11, 5, 9, 30, tzinfo=timezone.utc))
        meta = repo.get_meta(tender.id)
    payload = brief_payload(tender, meta, [], {}, SensitivitySettings())
    assert payload["verified_at"] == "2026-11-05T09:30:00+00:00"


def test_brief_payload_draft_has_no_verified_at():
    payload = brief_payload(_clean_sample(), _meta(status="DRAFT", verified_at=None), [], {}, SensitivitySettings())
    assert payload["status"] == "DRAFT"
    assert payload["verified_at"] is None
    assert payload["overrides"] == []
    assert payload["open_items"] == []
