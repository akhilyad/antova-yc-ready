"""Evidence precedence and compliance status (spec §10).

The governing value of each field comes from the strongest evidence tier.
A failing governing value contradicted by a passing lower-tier (or
same-tier) claim is a conflict; the overridden claim is kept as the
secondary citation.

Evidence found by the recall sweep (source "sweep") is held to a stricter rule:
it may only make a cell worse or flagged. A sweep value that fails the
requirement competes for governing like any other; a sweep value that passes is
never used, so no cell is ever COMPLIANT because of the sweep.
"""

from __future__ import annotations

from antova_engine import ComplianceStatus
from antova_ingest.ontology import CLAIM_SECTIONS, EVIDENCE_TIERS, SECTION_LABELS, FieldDef, ParameterDef
from antova_ingest.types import CheckResult, Citation, Evidence, FieldValue, Resolution
from antova_ingest.values import WARRANTY_BASIS_ORDER, check, display_text

CONFIDENCE = {
    ComplianceStatus.COMPLIANT: 1.0,
    ComplianceStatus.DEVIATION_DOWNGRADE: 1.0,
    ComplianceStatus.OMITTED: 1.0,
    ComplianceStatus.CONFLICT_DOWNGRADE: 0.9,
    ComplianceStatus.MANUAL_INSPECTION_REQUIRED: 0.0,
}


def _tier(e: Evidence) -> int:
    return EVIDENCE_TIERS.get(e.citation.section, 3)


def _page_order(evidence: list[Evidence]) -> list[Evidence]:
    return sorted(evidence, key=lambda e: e.citation.page)


def merge_requirement(param: ParameterDef, evidence: list[Evidence]) -> dict[str, FieldValue]:
    """MR spec: the first value per field, in page order."""
    merged: dict[str, FieldValue] = {}
    for e in _page_order([e for e in evidence if e.param_id == param.id]):
        for name, value in e.values.items():
            merged.setdefault(name, value)
    return merged


def _passes(field: FieldDef, requirement: dict[str, FieldValue], e: Evidence) -> bool:
    return check(field, requirement[field.name], e.values[field.name])[0]


def flag(code: str, message: str) -> dict:
    return {"code": code, "message": message}


def add_flag(flags: list[dict], code: str, message: str) -> None:
    entry = flag(code, message)
    if entry not in flags:
        flags.append(entry)


def _where(citation: Citation) -> str:
    return f"{SECTION_LABELS[citation.section]} p.{citation.page}"


def _warranty_check(result: CheckResult, required: FieldValue, offered: FieldValue, lag: dict | None,
                    policy: str, flags: list[dict]) -> None:
    """Item 2c: compare a warranty only on a common start point.

    Same start, or one side silent: compare the months as stated. Different starts: convert
    only with a duration the MR itself states (and show that MR citation as the assumption).
    Otherwise the months cannot be compared; the engine does not make up the gap.
    """
    required_basis = required.qualifier or "unspecified"
    offered_basis = offered.qualifier or "unspecified"
    result.required_basis, result.offered_basis = required_basis, offered_basis
    if policy != "strict" or "unspecified" in (required_basis, offered_basis) or required_basis == offered_basis:
        return
    if lag and {lag["from"], "commissioning"} == {required_basis, offered_basis}:
        months = lag["months"]
        equivalent = offered.value - months if required_basis == "commissioning" else offered.value + months
        result.offered_equivalent = equivalent
        result.offered_canonical = f"{equivalent} from {required_basis}"
        result.passed = equivalent >= required.value
        add_flag(flags, "WARRANTY_BASIS_CONVERTED",
                 f"warranty {offered.display} months from {offered_basis} is read as {equivalent} months from "
                 f"{required_basis}, assuming {months} months from {lag['from']} to commissioning as stated in "
                 f"MR p.{lag['citation']['page']}: \"{lag['citation']['quote']}\"")
        return
    later_start = WARRANTY_BASIS_ORDER[offered_basis] > WARRANTY_BASIS_ORDER[required_basis]
    if later_start and offered.value >= required.value:
        return  # at least as many months, starting later: at least as good, whatever the gap
    result.comparable = False
    result.passed = False
    add_flag(flags, "WARRANTY_BASIS",
             f"warranty {offered.display} months runs from {offered_basis}; the MR requires {required.display} months "
             f"from {required_basis}. The MR states no duration between the two, so the shortfall cannot be "
             f"computed and is left unpriced")


def resolve(param: ParameterDef, requirement: dict[str, FieldValue], evidence: list[Evidence],
            vendor_id: str, lag: dict | None = None, warranty_policy: str = "strict") -> Resolution:
    own = _page_order([e for e in evidence if e.param_id == param.id])
    governing: dict[str, tuple[FieldValue, Citation]] = {}
    governing_tier: dict[str, int] = {}
    same_tier_claim: dict[str, Evidence] = {}
    sweep_governed: set[str] = set()
    flags: list[dict] = []

    for f in param.fields:
        candidates = [e for e in own if f.name in e.values]
        if not candidates:
            continue
        required = f.name in requirement
        # Asymmetry: a sweep value counts only where it fails the requirement.
        usable = [e for e in candidates
                  if e.source != "sweep" or (required and not _passes(f, requirement, e))]
        unused = [e for e in candidates if all(e is not u for u in usable)]
        if not usable:
            for e in unused:
                add_flag(flags, "SWEEP_NOT_USED",
                         f"possible evidence on p.{e.citation.page} not reviewed: the recall sweep read "
                         f"{f.label} {e.values[f.name].display} in the {SECTION_LABELS[e.citation.section].lower()}, "
                         f"but the locator did not cite it")
            continue
        best = min(_tier(e) for e in usable)
        top = [e for e in usable if _tier(e) == best]
        chosen = top[0]
        if required:
            failing = [e for e in top if not _passes(f, requirement, e)]
            passing = [e for e in top if _passes(f, requirement, e)]
            if failing:
                chosen = failing[0]
                if passing:
                    same_tier_claim[f.name] = passing[0]
        governing[f.name] = (chosen.values[f.name], chosen.citation)
        governing_tier[f.name] = best
        if chosen.source == "sweep":
            sweep_governed.add(f.name)
            add_flag(flags, "SWEEP_GOVERNS",
                     f"{_where(chosen.citation)} was found by the recall sweep, not by the locator; "
                     f"check the passage before relying on it")
        elif required and not _passes(f, requirement, chosen):
            for e in unused:
                if _tier(e) < best:
                    add_flag(flags, "SWEEP_STRONGER_PASSING",
                             f"possible evidence on p.{e.citation.page} not reviewed: the recall sweep read "
                             f"{f.label} {e.values[f.name].display} in stronger evidence "
                             f"({_where(e.citation)}) than the governing passage")

    checks: list[CheckResult] = []
    failing_fields: list[FieldDef] = []
    for f in param.fields:
        if f.name in requirement and f.name in governing:
            value, citation = governing[f.name]
            passed, canonical = check(f, requirement[f.name], value)
            result = CheckResult(
                field=f.name, operator=f.operator, required=requirement[f.name].display,
                offered=value.display, offered_canonical=canonical, passed=passed,
                citation_ref=f"{citation.filename}#p{citation.page}",
            )
            if f.kind == "months":
                _warranty_check(result, requirement[f.name], value, lag, warranty_policy, flags)
            checks.append(result)
            if not result.passed:
                failing_fields.append(f)

    primary: Citation | None = None
    if failing_fields:
        primary = governing[failing_fields[0].name][1]
    elif governing:
        primary = next(governing[f.name][1] for f in param.fields if f.name in governing)

    claim = _conflicting_claim(own, failing_fields, requirement, governing_tier, same_tier_claim)
    secondary = claim.citation if claim else None
    conflict_note = _conflict_note(param, claim, governing, primary) if claim and primary else None

    scope = param.scope_field
    if scope and scope in governing and governing[scope][0].value == 0:
        status = ComplianceStatus.OMITTED
    elif claim is not None:
        status = ComplianceStatus.CONFLICT_DOWNGRADE
    elif failing_fields:
        status = ComplianceStatus.DEVIATION_DOWNGRADE
    elif any(f.name in requirement and f.name not in governing for f in param.fields) or not governing:
        status = ComplianceStatus.MANUAL_INSPECTION_REQUIRED
    else:
        status = ComplianceStatus.COMPLIANT

    # Amendment A3: OMITTED still outranks CONFLICT, but the overridden claim stays as the
    # secondary citation, so the reviewer sees what the vendor said elsewhere.
    if status == ComplianceStatus.COMPLIANT and sweep_governed:
        # Cannot happen: a governing sweep value fails its check. Kept as a guard on the rule itself.
        status = ComplianceStatus.MANUAL_INSPECTION_REQUIRED

    strength = None
    if status == ComplianceStatus.COMPLIANT:
        claimed = all(citation.section in CLAIM_SECTIONS for _, citation in governing.values())
        strength = "claim_only" if claimed else "documentary"

    segments = [
        {"field": f.name, "label": f.label, "text": governing[f.name][0].display,
         "citation": governing[f.name][1].to_dict()}
        for f in param.fields if f.name in governing
    ]
    pages = list(dict.fromkeys((s["citation"]["filename"], s["citation"]["page"]) for s in segments))
    assembled = None
    if len(pages) > 1:
        names = [f"p.{page}" for _, page in pages]
        assembled = "assembled from " + ", ".join(names[:-1]) + " and " + names[-1]

    return Resolution(
        param_id=param.id,
        vendor_id=vendor_id,
        status=status,
        governing=governing,
        checks=checks,
        primary=primary,
        secondary=secondary,
        conflict_note=conflict_note,
        extracted_text=display_text(param, {name: v for name, (v, _) in governing.items()}),
        confidence=CONFIDENCE[status],
        flags=flags,
        evidence=strength,
        segments=segments,
        assembled_from=assembled,
    )


def _conflicting_claim(own: list[Evidence], failing_fields: list[FieldDef], requirement: dict[str, FieldValue],
                       governing_tier: dict[str, int], same_tier_claim: dict[str, Evidence]) -> Evidence | None:
    for f in failing_fields:
        lower = [e for e in own if f.name in e.values and e.source != "sweep"
                 and _tier(e) > governing_tier[f.name] and _passes(f, requirement, e)]
        if lower:
            return lower[0]
        if f.name in same_tier_claim:
            return same_tier_claim[f.name]
    return None


def _conflict_note(param: ParameterDef, claim: Evidence, governing: dict[str, tuple[FieldValue, Citation]],
                   primary: Citation) -> str:
    names = [f.name for f in param.fields if f.name in claim.values and f.name in governing]
    claimed = " / ".join(claim.values[n].display for n in names)
    stated = " / ".join(governing[n][0].display for n in names)
    sec_label = SECTION_LABELS[claim.citation.section]
    pri_label = SECTION_LABELS[primary.section]
    return (f"{sec_label} p.{claim.citation.page} claims {claimed}; "
            f"{pri_label} p.{primary.page} states {stated}. {pri_label} governs.")
