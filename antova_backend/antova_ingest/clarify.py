"""Clarification register: the questions a buyer sends each vendor after a technical bid evaluation.

One question per failing check, conflict, omitted scope item and review flag, each
with the pages it rests on. Every question is built from a fixed template per
ontology field and the values and citations the pipeline already holds. No model
writes or rewrites a word of it.
"""

from __future__ import annotations

import csv
import io
import re

from antova_engine import ComplianceStatus, TenderPackage, headline_status
from antova_ingest.ontology import SECTION_LABELS

CSV_COLUMNS = ["tender_id", "vendor_id", "vendor_name", "param_id", "param_name", "kind", "question", "citations"]

# field -> (what the bid states, with {offered}; what the MR requires, with {required}; what to ask for)
FIELD_TEMPLATES: dict[str, tuple[str, str, str]] = {
    "ik": ("a rated short-time withstand current of {offered}", "{required}",
           "Confirm the rated current and provide the type-test certificate."),
    "ik_duration": ("a short-time withstand duration of {offered}", "{required}",
                    "Confirm the rated duration and provide the type-test certificate."),
    "material": ("a main busbar material of {offered}", "{required}",
                 "Confirm the busbar material and provide the material certificate."),
    "rated_current": ("a busbar continuous current of {offered}", "{required}",
                      "Confirm the rated current and provide the temperature-rise test report."),
    "ip": ("an enclosure degree of protection of {offered}", "{required}",
           "Confirm the degree of protection and provide the IP test report."),
    "iac_class": ("an internal arc classification of {offered}", "{required}",
                  "Confirm the classification and provide the internal arc test report."),
    "protocol": ("protection relay communication as {offered}", "{required}",
                 "Confirm the protocol, its edition and the redundancy offered."),
    "marshalling": ("RTU marshalling as {offered}", "{required} marshalling",
                    "Confirm whether marshalling is pre-wired at the factory and included in the price."),
    "witnessed_fat_days_included": ("{offered} witnessed factory acceptance test days in the price",
                                    "{required} witnessed days in the price",
                                    "Confirm the witnessed test days included, or the price to include them."),
    "incoterm": ("delivery {offered}", "delivery {required}", "Confirm the Incoterm and the named place."),
    "warranty_months": ("a warranty of {offered} months", "{required} months",
                        "Confirm the warranty period and the date it starts from."),
    "rated_voltage": ("a rated voltage of {offered}", "{required}",
                      "Confirm the rated voltage and provide the type-test certificate."),
    "max_ambient": ("a maximum ambient temperature of {offered} without derating", "{required}",
                    "Confirm the rating and any derating that applies."),
}
_GENERIC = ("{label} {offered}", "{required}", "Confirm the offered value and the page where it is documented.")
_PAGE = re.compile(r"\bp\.(\d+(?:-\d+)?)")


def _where(citation: dict | None) -> str:
    if not citation:
        return "bid"
    return f"{SECTION_LABELS.get(citation['section'], citation['section']).lower()} p.{citation['page']}"


def _cite(*citations: dict | None) -> str:
    seen = list(dict.fromkeys(f"{c['filename']} p.{c['page']}" for c in citations if c))
    return "; ".join(seen)


def _flag_question(flag: dict, param_name: str) -> str | None:
    """The vendor-facing question for a review flag, or None when another row already asks it."""
    code, message = flag["code"], flag["message"]
    page = _PAGE.search(message)
    at = f"p.{page.group(1)} of your bid" if page else "your bid"
    if code.startswith("SWEEP_"):
        return (f"A passage on {at} appears to state something about {param_name}. "
                f"Confirm whether it applies to the equipment offered.")
    if code == "WARRANTY_BASIS":
        return ("Your warranty period and the MR's start from different points. "
                "State the warranty period counted from the start point the MR names.")
    if code == "WARRANTY_BASIS_CONVERTED":
        return ("We restated your warranty period on the MR's start point, using the duration the MR gives "
                "between the two. Confirm the result or state the period counted from the MR's start point.")
    if code in ("AMBIGUOUS_NUMBER", "IMPLAUSIBLE_VALUE", "VALUE_NOT_IN_SPAN"):
        return (f"A value on {at} could not be read reliably. "
                f"Restate {param_name} with its unit, writing the decimal mark unambiguously.")
    if code == "NO_TEXT_LAYER":
        return f"Part of your bid ({at}) is a scanned image and could not be read. Resubmit it as a text PDF."
    return None  # NOT_STATED / LOCATOR_SILENT: the manual-inspection row asks for the value


def clarifications(tender: TenderPackage) -> list[dict]:
    """Every question for every vendor, in vendor order then parameter order."""
    rows: list[dict] = []

    def add(vendor, param, kind: str, question: str, citations: str) -> None:
        rows.append({
            "tender_id": tender.id, "vendor_id": vendor.id, "vendor_name": vendor.name,
            "param_id": param.id if param else "", "param_name": param.name if param else "",
            "kind": kind, "question": " ".join(question.split()), "citations": citations,
        })

    for vendor in tender.vendors:
        status = headline_status(vendor)
        if status != "PRICED":
            reason = {
                "NOT_FOUND": "We could not find a total price in your bid.",
                "CURRENCY_UNKNOWN": "Your total price names no currency.",
                "FX_MISSING": f"Your total price is in {vendor.currency}, not the tender currency.",
            }.get(status, "Your total price could not be used.")
            add(vendor, None, "PRICE", f"{reason} State the total lump-sum price for the complete scope, "
                                       f"with its currency.", _cite(vendor.headline_citation))
        for param in tender.parameters:
            cell = param.vendors.get(vendor.id)
            if cell is None:
                continue
            mr = param.requirement_citation
            mr_at = f"MR p.{mr['page']}" if mr else "The MR"
            failing = [c for c in cell.checks if not c["passed"]]

            if cell.status == ComplianceStatus.MANUAL_INSPECTION_REQUIRED:
                add(vendor, param, "MANUAL", f"We could not establish {param.name} from your bid. "
                                             f"State the offered value and the page where it is documented.", _cite(mr))
            for check in failing:
                states, requires, ask = FIELD_TEMPLATES.get(check["field"], _GENERIC)
                label = next((s["label"] for s in cell.segments if s["field"] == check["field"]), check["field"])
                citation = cell.field_citations.get(check["field"]) or cell.citation
                stated = states.format(offered=check["offered"], label=label)
                required = requires.format(required=check["required"])
                if cell.status == ComplianceStatus.OMITTED:
                    add(vendor, param, "OMITTED",
                        f"Your {_where(citation)} leaves this out of the price: it states {stated}. "
                        f"{mr_at} requires {required}. Confirm that it is included, or state the price to include it.",
                        _cite(citation, mr))
                elif cell.status == ComplianceStatus.CONFLICT_DOWNGRADE and cell.secondary_citation:
                    add(vendor, param, "CONFLICT",
                        f"Your {_where(cell.secondary_citation)} claims compliance, but your {_where(citation)} "
                        f"states {stated}. {mr_at} requires {required}. Confirm which governs and provide the "
                        f"document that shows it.", _cite(cell.secondary_citation, citation, mr))
                else:
                    add(vendor, param, "DEVIATION",
                        f"Your {_where(citation)} states {stated}. {mr_at} requires {required}. {ask}",
                        _cite(citation, mr))
            for check in cell.checks:
                if check.get("offered_basis") == "unspecified" and check.get("required_basis") not in (None, "unspecified"):
                    citation = cell.field_citations.get(check["field"]) or cell.citation
                    add(vendor, param, "BASIS",
                        f"Your {_where(citation)} does not say when the warranty period starts. The MR counts it "
                        f"from {check['required_basis']}. Confirm the start point.", _cite(citation, mr))
            if cell.evidence == "claim_only":
                add(vendor, param, "EVIDENCE",
                    f"{param.name} is confirmed only in your {_where(cell.citation)}. Provide the datasheet, "
                    f"drawing or test report that shows it.", _cite(cell.citation))
            for flag in cell.flags:
                question = _flag_question(flag, param.name)
                if question:
                    add(vendor, param, "FLAG", question, _cite(cell.citation, mr))
    return rows


def spreadsheet_safe(value: str) -> str:
    """`value` that a spreadsheet will show as text. One that starts with = + - @ (or a tab or return) would
    run as a formula when the file is opened; a vendor name or a quoted bid value can start that way."""
    return "'" + value if value[:1] in ("=", "+", "-", "@", "\t", "\r") else value


def to_csv(rows: list[dict]) -> str:
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=CSV_COLUMNS, lineterminator="\r\n")
    writer.writeheader()
    writer.writerows({k: spreadsheet_safe(v) if isinstance(v, str) else v for k, v in row.items()} for row in rows)
    return buffer.getvalue()
