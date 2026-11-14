"""Clarification logs per vendor (CSV and XLSX) and the verified TBE workbook."""

import csv
import io

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy import text

from antova_api import app
from antova_auth import REVIEW_HEADER
from antova_db import SessionLocal
from antova_export import XLSX_TYPE, clarifications_xlsx
from antova_ingest import clarify
from antova_ingest.pipeline import run_ingest
from antova_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected
from antova_service import persist

TENDER_ID = "TENDER-2026-402"
REVIEW = f"/api/review/tenders/{TENDER_ID}"
HEADERS = {REVIEW_HEADER: "test-review-token"}  # token set in conftest.py
VENDOR_NAMES = {"vendor-a": "Nordwerk", "vendor-b": "VoltSwitch", "vendor-c": "Deltaport"}


@pytest.fixture(scope="module")
def ingested():
    return run_ingest(PACK, locator=AnswerKeyLocator(load_expected()))


def _reset(ingested):
    db = SessionLocal()
    try:
        persist(ingested, db)
        for table in ("cell_reviews", "adder_overrides"):
            db.execute(text(f"DELETE FROM {table} WHERE tender_id = :id"), {"id": TENDER_ID})
        db.commit()
    finally:
        db.close()


@pytest.fixture
def client(ingested):
    _reset(ingested)
    yield TestClient(app, headers=HEADERS)
    _reset(ingested)


def _verify(client):
    assert client.put(f"{REVIEW}/reviews/PARAM-06/vendor-b", json={"action": "approve", "note": "start date checked"}).status_code == 200
    assert client.put(f"{REVIEW}/overrides/PARAM-06/vendor-b", json={"adder_eur": "9300.00", "note": "founder price"}).status_code == 204
    assert client.post(f"{REVIEW}/verify").status_code == 200


def _sheet_rows(content: bytes, name: str) -> list[list]:
    return [list(row) for row in load_workbook(io.BytesIO(content))[name].iter_rows(values_only=True)]


# --- per-vendor clarification logs ---------------------------------------------------------------

def test_a_vendors_csv_has_only_that_vendors_questions(client):
    everyone = list(csv.DictReader(io.StringIO(client.get(f"{REVIEW}/clarifications.csv").text)))
    response = client.get(f"{REVIEW}/clarifications.csv", params={"vendor": "vendor-b"})
    assert response.status_code == 200
    assert f"Clarifications_{TENDER_ID}_vendor-b.csv" in response.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert rows and {r["vendor_id"] for r in rows} == {"vendor-b"}
    assert rows == [r for r in everyone if r["vendor_id"] == "vendor-b"]


@pytest.mark.parametrize("vendor", ["vendor-a", "vendor-b", "vendor-c"])
def test_a_vendors_file_names_no_other_bidder_and_no_money(client, vendor):
    for url in (f"{REVIEW}/clarifications.csv", f"{REVIEW}/clarifications.xlsx"):
        response = client.get(url, params={"vendor": vendor})
        text_ = response.text if url.endswith("csv") else repr(_sheet_rows(response.content, "Clarifications"))
        for other, name in VENDOR_NAMES.items():
            if other != vendor:
                assert name not in text_ and other not in text_, (url, other)
        assert "€" not in text_ and "EUR" not in text_


def test_the_xlsx_matches_the_csv(client):
    csv_rows = list(csv.DictReader(io.StringIO(client.get(f"{REVIEW}/clarifications.csv", params={"vendor": "vendor-b"}).text)))
    response = client.get(f"{REVIEW}/clarifications.xlsx", params={"vendor": "vendor-b"})
    assert response.headers["content-type"] == XLSX_TYPE
    assert f"Clarifications_{TENDER_ID}_vendor-b.xlsx" in response.headers["content-disposition"]
    assert response.headers["cache-control"] == "private, no-store"
    rows = _sheet_rows(response.content, "Clarifications")
    assert rows[0] == clarify.CSV_COLUMNS
    assert [dict(zip(rows[0], r)) for r in rows[1:]] == csv_rows


def test_an_unknown_vendor_is_a_404_and_no_vendor_means_all(client):
    for suffix in ("csv", "xlsx"):
        assert client.get(f"{REVIEW}/clarifications.{suffix}", params={"vendor": "vendor-z"}).status_code == 404
    everyone = _sheet_rows(client.get(f"{REVIEW}/clarifications.xlsx").content, "Clarifications")
    in_csv = list(csv.DictReader(io.StringIO(client.get(f"{REVIEW}/clarifications.csv").text)))
    assert len(everyone) - 1 == len(in_csv) > 0
    assert {r[1] for r in everyone[1:]} == {r["vendor_id"] for r in in_csv}


def test_a_value_that_looks_like_a_formula_is_written_as_text():
    rows = [{c: "x" for c in clarify.CSV_COLUMNS} | {"vendor_name": '=HYPERLINK("http://evil.example","click")',
                                                      "question": "+1+1", "citations": "@SUM(A1)"}]
    sheet = load_workbook(io.BytesIO(clarifications_xlsx(rows)))["Clarifications"]
    for column in (3, 7, 8):
        cell = sheet.cell(row=2, column=column)
        assert cell.data_type == "s" and cell.value.startswith("'"), column
    csv_text = clarify.to_csv(rows)
    assert "'=HYPERLINK" in csv_text and "'+1+1" in csv_text and "'@SUM" in csv_text


# --- the TBE workbook ----------------------------------------------------------------------------

def test_a_draft_cannot_be_exported(client):
    response = client.get(f"{REVIEW}/export-tbe.xlsx")
    assert response.status_code == 409 and "Verify the brief" in response.json()["detail"]


def test_the_verified_workbook_has_the_evaluation_and_its_audit_trail(client):
    _verify(client)
    response = client.get(f"{REVIEW}/export-tbe.xlsx")
    assert response.status_code == 200
    assert response.headers["content-type"] == XLSX_TYPE
    assert response.headers["cache-control"] == "private, no-store"
    assert f"TBE_{TENDER_ID}.xlsx" in response.headers["content-disposition"]
    wb = load_workbook(io.BytesIO(response.content))
    assert wb.sheetnames == ["Summary", "Leveling", "Adders", "Overrides", "Reviews", "Clarifications"]

    summary = dict(_sheet_rows(response.content, "Summary")[1:])
    assert summary["Tender"] == TENDER_ID and summary["Status"] == "VERIFIED" and summary["Verified by"] == "founder"
    assert len(summary["Ingest run"]) == 32

    leveling = {r[2]: r for r in _sheet_rows(response.content, "Leveling")[1:]}
    assert leveling["vendor-a"][0] == 1 and leveling["vendor-a"][8] == 452000.0
    assert leveling["vendor-c"][0] == 2 and leveling["vendor-c"][8] == 454000.0
    assert leveling["vendor-b"][0] == 3  # the founder's price for its warranty gap makes it fully priced, so ranked
    assert leveling["vendor-b"][4] == 418000.0 and leveling["vendor-b"][8] == 418000.0 + leveling["vendor-b"][7]
    assert wb["Leveling"]["I2"].number_format == "#,##0.00"

    adders = _sheet_rows(response.content, "Adders")
    assert len(adders) - 1 == 3 * 8
    warranty = next(r for r in adders if r[0] == "vendor-b" and r[1] == "PARAM-06")
    assert warranty[5] == 9300.0 and warranty[7] == "yes" and warranty[8] == "founder price"
    assert warranty[10].startswith("Bid_vendor-b_VoltSwitch.pdf p.")
    assert sum(r[5] for r in adders[1:] if r[0] == "vendor-b") == leveling["vendor-b"][7]

    overrides = _sheet_rows(response.content, "Overrides")
    assert overrides[1][:3] == ["PARAM-06", "vendor-b", 9300.0] and overrides[1][4] == "founder"
    reviews = _sheet_rows(response.content, "Reviews")
    assert reviews[1][:4] == ["PARAM-06", "vendor-b", "approve", "founder"]
    assert len(_sheet_rows(response.content, "Clarifications")) > 1


def test_the_export_needs_the_review_token(client):
    _verify(client)
    assert TestClient(app).get(f"{REVIEW}/export-tbe.xlsx").status_code == 401
    assert TestClient(app).get(f"{REVIEW}/clarifications.xlsx").status_code == 401
