"""Spreadsheets out: the per-vendor clarification log and the verified TBE workbook.

Pure functions that build .xlsx bytes from data the routes load; no HTTP, no database.

Every text cell goes through spreadsheet_safe(): a value that starts with = + - @ (a vendor name or
a quoted bid value can) would run as a formula when the file is opened, so it is written as text.
"""

from __future__ import annotations

import io
from collections.abc import Mapping
from datetime import datetime
from decimal import Decimal
from typing import Any, Iterable

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from openpyxl.worksheet.worksheet import Worksheet

from antova_ingest.clarify import CSV_COLUMNS, spreadsheet_safe

XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MONEY = "#,##0.00"


def _text(value: Any) -> str:
    return "" if value is None else str(value)


def _sheet(ws: Worksheet, header: list[str], rows: Iterable[list[Any]], widths: list[int],
           money_columns: tuple[int, ...] = (), wrap_columns: tuple[int, ...] = ()) -> None:
    ws.append(header)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for row in rows:
        ws.append([spreadsheet_safe(v) if isinstance(v, str) else v for v in row])
    for index, width in enumerate(widths, start=1):
        ws.column_dimensions[ws.cell(row=1, column=index).column_letter].width = width
    for row in ws.iter_rows(min_row=2):
        for index in money_columns:
            row[index].number_format = MONEY
        for index in wrap_columns:
            row[index].alignment = Alignment(wrap_text=True, vertical="top")
    ws.freeze_panes = "A2"


def _bytes(wb: Workbook) -> bytes:
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def _clarification_rows(rows: list[dict]) -> list[list[Any]]:
    return [[row[c] for c in CSV_COLUMNS] for row in rows]


def clarifications_xlsx(rows: list[dict]) -> bytes:
    """The clarification log as one sheet, in the CSV's columns."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Clarifications"
    _sheet(ws, CSV_COLUMNS, _clarification_rows(rows), [16, 11, 28, 10, 34, 11, 90, 60], wrap_columns=(6, 7))
    return _bytes(wb)


def tbe_workbook(
    *,
    brief: Mapping[str, Any],
    tender_title: str,
    client: str,
    equipment_class: str,
    rate_table_version: str,
    cells: list[dict],
    override_rows: list[dict],
    reviews: list[dict],
    clarification_rows: list[dict],
    verified_by: str | None,
    generated_at: datetime,
) -> bytes:
    """The evaluation as a workbook: summary, leveling, every priced cell, the overrides and reviews
    behind it, and the clarification log.

    `brief` is the brief payload (antova_review.brief_payload); `cells` has one dict per
    (vendor, parameter) with the keys used below; `override_rows` and `reviews` are the stored rows.
    """
    wb = Workbook()
    stats = brief["ingest_stats"] or {}

    summary = wb.active
    summary.title = "Summary"
    summary.append(["Technical bid evaluation"])
    summary["A1"].font = Font(bold=True, size=14)
    facts = [
        ("Tender", brief["tender"]["id"]), ("Title", tender_title), ("Client", client),
        ("Equipment class", equipment_class), ("Rate table", rate_table_version),
        ("Status", brief["status"]), ("Verified at", _text(brief["verified_at"])),
        ("Verified by", _text(verified_by)), ("Ingest run", _text(stats.get("run_id"))),
        ("Ingest mode", _text(brief["ingest_mode"])), ("Synthetic sample", "yes" if brief["synthetic"] else "no"),
        ("Exported at", generated_at.isoformat(timespec="seconds")),
    ]
    for key, value in facts:
        summary.append([key, spreadsheet_safe(_text(value))])
    summary.column_dimensions["A"].width = 20
    summary.column_dimensions["B"].width = 90
    for row in summary.iter_rows(min_row=2, max_col=1):
        row[0].font = Font(bold=True)

    priced = sorted((f for f in brief["financials"] if f["price_status"] == "PRICED"),
                    key=lambda f: f["true_evaluated_price"])
    rank = {f["vendor_id"]: i for i, f in enumerate(priced, start=1)}
    leveling = wb.create_sheet("Leveling")
    _sheet(leveling, ["Rank", "Vendor", "Vendor ID", "Country", "Headline price (EUR)", "Technical penalties (EUR)",
                      "Commercial adders (EUR)", "Total adders (EUR)", "True evaluated price (EUR)", "Price status"],
           [[rank.get(f["vendor_id"], "not ranked"), f["name"], f["vendor_id"], f["country"], f["headline_price"],
             f["total_tech_penalty"], f["total_commercial_adder"], f["total_adders"], f["true_evaluated_price"],
             f["price_status"]] for f in brief["financials"]],
           [11, 30, 12, 14, 20, 24, 22, 18, 24, 18], money_columns=(4, 5, 6, 7, 8))

    adders = wb.create_sheet("Adders")
    _sheet(adders, ["Vendor ID", "Parameter", "Parameter name", "Criticality", "Status", "Adder (EUR)", "Pricing",
                    "Overridden", "Override note", "Calculation", "Source page"],
           [[c["vendor_id"], c["param_id"], c["param_name"], c["criticality"], c["status"], c["adder_eur"],
             c["pricing_status"], "yes" if c["is_overridden"] else "", c["override_note"] or "", c["formula"],
             c["source"]] for c in cells],
           [11, 11, 38, 13, 24, 14, 14, 11, 50, 50, 40], money_columns=(5,), wrap_columns=(8, 9))

    overrides = wb.create_sheet("Overrides")
    _sheet(overrides, ["Parameter", "Vendor ID", "Adder (EUR)", "Note", "Set by", "Set at"],
           [[o["param_id"], o["vendor_id"], float(Decimal(str(o["adder_eur"]))), o["note"], _text(o.get("set_by")),
             _text(o.get("created_at"))] for o in override_rows],
           [11, 11, 14, 70, 14, 28], money_columns=(2,), wrap_columns=(3,))

    review_sheet = wb.create_sheet("Reviews")
    _sheet(review_sheet, ["Parameter", "Vendor ID", "Decision", "Reviewer", "Note", "Decided at"],
           [[r["param_id"], r["vendor_id"], r["action"], r["reviewer"], r["note"], _text(r["created_at"])]
            for r in reviews],
           [11, 11, 11, 14, 70, 28], wrap_columns=(4,))

    log = wb.create_sheet("Clarifications")
    _sheet(log, CSV_COLUMNS, _clarification_rows(clarification_rows), [16, 11, 28, 10, 34, 11, 90, 60],
           wrap_columns=(6, 7))
    return _bytes(wb)
