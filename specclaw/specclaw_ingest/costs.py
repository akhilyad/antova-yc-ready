"""Deviation pricing from a versioned rate table (spec §11).

Each failing check maps to a deviation class; each class is a list of cost
lines (quantity x rate) tagged fixed, copper, labour or freight so the
leveling sliders can scale only what they actually affect. A class with no
rate entry, or with a quantity we don't know, is reported as unpriced
instead of silently counting as zero.

A rate table is checked when it is loaded. A table that is incomplete or
inconsistent raises ConfigError there, with a message naming the gap, never
a KeyError in the middle of an ingest.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Literal

from specclaw_engine import ComplianceStatus, CostLine
from specclaw_ingest.ontology import FieldDef, ParameterDef
from specclaw_ingest.parse import RATE_TABLE_PATTERN, RATES_DIR
from specclaw_ingest.types import FieldValue, Resolution

CENTS = Decimal("0.01")
DRIVERS = ("fixed", "copper", "labour", "freight")
# A quantity is a number, or a name the pipeline fills in: the MR's bay count, a manifest
# estimate, or a shortfall computed from the check itself.
_QTY_NAME = re.compile(r"tender\.bay_count|estimate\.[a-z0-9_]+|shortfall\.(?:days|months)")
WARRANTY_POLICIES = ("strict", "months_only")

_CLASS_SUFFIX = {
    ("PARAM-02", "material"): "material_al_for_cu",
    ("PARAM-02", "rated_current"): "current_short",
    ("PARAM-03", "ip"): "ip_below_ip54",
    ("PARAM-03", "iac_class"): "iac_not_aflr",
    ("PARAM-04", "protocol"): "no_prp",
    ("PARAM-04", "marshalling"): "marshalling_not_prewired",
    ("PARAM-05", "witnessed_fat_days_included"): "witnessed_fat_days_short",
    ("PARAM-06", "warranty_months"): "warranty_short",
    ("PARAM-07", "rated_voltage"): "voltage_short",
    ("PARAM-08", "max_ambient"): "ambient_short",
}
# PARAM-01 is priced as one upgrade: a rating upgrade also covers the duration.
_PARAM_01_CLASSES = {"ik": "ik_rating_short", "ik_duration": "ik_duration_short"}
_SHORTFALL_KEYS = {"fat_days": "shortfall.days", "months": "shortfall.months"}


class ConfigError(Exception):
    """The ontology, rule set or a rate table is incomplete or inconsistent. Raised at load, never mid-ingest."""


@dataclass(frozen=True)
class RateLine:
    label: str
    qty: Decimal | str
    unit: str
    rate: Decimal
    driver: Literal["fixed", "copper", "labour", "freight"]
    # The rate's range. A table that states none has low = rate = high.
    low: Decimal | None = None
    high: Decimal | None = None

    def __post_init__(self):
        object.__setattr__(self, "low", self.rate if self.low is None else self.low)
        object.__setattr__(self, "high", self.rate if self.high is None else self.high)


@dataclass
class RateTable:
    version: str
    effective_date: str
    currency: str
    deviation_rates: dict[str, list[RateLine]]
    # Evaluation choices that belong to the rate table's version, e.g. {"warranty_basis": "strict"}.
    policies: dict[str, str] = field(default_factory=dict)
    # EUR per site labour hour. Every labour line carries this rate; the slider overrides it.
    base_labour_rate: Decimal = Decimal("0")
    # Classes the table knowingly has no rate for. A failing check in one is reported UNPRICED.
    unpriced_classes: frozenset[str] = frozenset()
    # Other currencies into the table's own: {"USD": {"rate": Decimal, "date": "2026-11-03"}}.
    fx_rates: dict[str, dict] = field(default_factory=dict)


@dataclass
class Pricing:
    lines: list[CostLine]
    adder: Decimal
    formula: str
    pricing_status: Literal["PRICED", "UNPRICED", "NONE"]
    unpriced_classes: list[str]
    rate_table_version: str


def _decimal(raw, what: str) -> Decimal:
    try:
        value = Decimal(str(raw))
    except (InvalidOperation, ValueError) as exc:
        raise ConfigError(f"{what}: {raw!r} is not a number") from exc
    if not value.is_finite() or value < 0:
        raise ConfigError(f"{what}: {raw!r} must be a non-negative number")
    return value


def _qty(raw, what: str) -> Decimal | str:
    text = str(raw)
    if re.fullmatch(r"\d+(?:\.\d+)?", text):
        return Decimal(text)
    if not _QTY_NAME.fullmatch(text):
        raise ConfigError(f"{what}: unknown quantity {text!r} (use a number, tender.bay_count, "
                          f"estimate.<name>, shortfall.days or shortfall.months)")
    return text


def parse_rate_table(data: dict) -> RateTable:
    """Build and check a rate table from its JSON data. Raises ConfigError naming the first gap."""
    name = data.get("version", "rate table")
    for key in ("version", "effective_date", "currency", "base_labour_rate", "deviation_rates"):
        if key not in data:
            raise ConfigError(f"{name}: missing {key!r}")
    base_labour = _decimal(data["base_labour_rate"], f"{name}: base_labour_rate")
    rates: dict[str, list[RateLine]] = {}
    for cls, lines in data["deviation_rates"].items():
        if not lines:
            raise ConfigError(f"{name}: class {cls} has no rate lines (list it under unpriced_classes instead)")
        parsed = []
        for index, raw in enumerate(lines, start=1):
            what = f"{name}: {cls} line {index}"
            for key in ("label", "qty", "unit", "rate", "driver"):
                if key not in raw:
                    raise ConfigError(f"{what}: missing {key!r}")
            if raw["driver"] not in DRIVERS:
                raise ConfigError(f"{what}: unknown driver {raw['driver']!r}")
            rate = _decimal(raw["rate"], f"{what} rate")
            low = _decimal(raw["low"], f"{what} low") if "low" in raw else rate
            high = _decimal(raw["high"], f"{what} high") if "high" in raw else rate
            if not low <= rate <= high:
                raise ConfigError(f"{what}: need low <= rate <= high, got low {low}, rate {rate}, high {high}")
            if raw["driver"] == "labour" and rate != base_labour:
                raise ConfigError(f"{what}: a labour line's rate must equal the table's base_labour_rate "
                                  f"({base_labour}), got {rate}")
            parsed.append(RateLine(raw["label"], _qty(raw["qty"], what), raw["unit"], rate, raw["driver"], low, high))
        rates[cls] = parsed
    unpriced = frozenset(data.get("unpriced_classes", []))
    both = sorted(unpriced & set(rates))
    if both:
        raise ConfigError(f"{name}: {', '.join(both)} listed as unpriced but has rate lines")
    policies = {"warranty_basis": "strict", **data.get("policies", {})}
    if policies["warranty_basis"] not in WARRANTY_POLICIES:
        raise ConfigError(f"{name}: unknown warranty_basis policy {policies['warranty_basis']!r}")
    fx: dict[str, dict] = {}
    for currency, entry in data.get("fx_rates", {}).items():
        what = f"{name}: fx_rates {currency}"
        if "date" not in entry or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(entry["date"])):
            raise ConfigError(f"{what}: an FX rate needs a date (YYYY-MM-DD)")
        rate = _decimal(entry.get("rate"), f"{what} rate")
        if rate == 0:
            raise ConfigError(f"{what}: rate must be greater than zero")
        fx[currency.upper()] = {"rate": rate, "date": str(entry["date"])}
    return RateTable(str(data["version"]), str(data["effective_date"]), str(data["currency"]).upper(), rates,
                     policies, base_labour, unpriced, fx)


def load_rate_table(name: str) -> RateTable:
    if not re.fullmatch(RATE_TABLE_PATTERN, name):
        raise ValueError(f"invalid rate table name {name!r}")
    path = RATES_DIR / f"{name}.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ConfigError(f"rate table {name!r} not found") from exc
    except ValueError as exc:
        raise ConfigError(f"rate table {name!r} is not valid JSON: {exc}") from exc
    return parse_rate_table(data)


def convert(amount: Decimal, currency: str, table: RateTable) -> dict | None:
    """`amount` in the table's currency: {"amount", "rate", "date"}, or None when the table has
    no dated rate for `currency`. Nothing is ever assumed to be in the table's currency."""
    if currency == table.currency:
        return {"amount": amount, "rate": None, "date": None}
    entry = table.fx_rates.get(currency)
    if entry is None:
        return None
    converted = (amount * entry["rate"]).quantize(CENTS, rounding=ROUND_HALF_UP)
    return {"amount": converted, "rate": entry["rate"], "date": entry["date"]}


def classes_for_field(param: ParameterDef, f: FieldDef) -> list[str]:
    """The deviation classes a failing check on this field can produce and the table must account for.

    Raises ConfigError for a field with no class. An incoterm's class is named from the offered
    and required terms at run time, so it has none here; a pair the table does not list is UNPRICED.
    """
    if f.kind == "incoterm":
        return []
    if param.id == "PARAM-01" and f.name in _PARAM_01_CLASSES:
        return [f"{param.id}.{_PARAM_01_CLASSES[f.name]}"]
    suffix = _CLASS_SUFFIX.get((param.id, f.name))
    if suffix is None:
        raise ConfigError(f"ontology field {param.id} {f.name} has no deviation class (add it to costs._CLASS_SUFFIX)")
    return [f"{param.id}.{suffix}"]


def deviation_classes(param: ParameterDef, failing_fields: set[str], governing: dict[str, FieldValue],
                      requirement: dict[str, FieldValue], incomparable: frozenset[str] = frozenset()) -> list[str]:
    """The rate-table class of each failing check. A class the table does not list is unpriced."""
    if param.id == "PARAM-01":
        # A rating upgrade also covers the duration, so it is priced alone.
        if "ik" in failing_fields:
            return ["PARAM-01.ik_rating_short"]
        if "ik_duration" in failing_fields:
            return ["PARAM-01.ik_duration_short"]
        return []
    classes = []
    for f in param.fields:
        if f.name not in failing_fields:
            continue
        if f.name in incomparable:
            # Two warranty start points with no stated gap between them: no shortfall to price.
            classes.append(f"{param.id}.warranty_basis_unresolved")
        elif f.kind == "incoterm":
            # Named for both ends, so EXW against a DAP requirement never takes the EXW-to-DDP rate.
            offered, required = governing[f.name].value, requirement[f.name].value
            classes.append(f"{param.id}.incoterm_{offered.lower()}_to_{required.lower()}")
        else:
            classes.extend(classes_for_field(param, f))
    return classes


def _formula(lines: list[CostLine]) -> str:
    return " + ".join(f"{line.qty:g} {line.unit} × €{line.rate:,.2f}" for line in lines)


def price(param: ParameterDef, requirement: dict[str, FieldValue], resolution: Resolution,
          table: RateTable, quantities: dict[str, Decimal]) -> Pricing:
    if resolution.status in (ComplianceStatus.COMPLIANT, ComplianceStatus.MANUAL_INSPECTION_REQUIRED):
        return Pricing([], Decimal("0.00"), "", "NONE", [], table.version)

    governing = {name: value for name, (value, _) in resolution.governing.items()}
    known = dict(quantities)
    checks = {c.field: c for c in resolution.checks}
    for f in param.fields:
        key = _SHORTFALL_KEYS.get(f.kind)
        if key and f.name in requirement and f.name in governing:
            equivalent = checks[f.name].offered_equivalent if f.name in checks else None
            offered = equivalent if equivalent is not None else governing[f.name].value
            known[key] = Decimal(max(requirement[f.name].value - offered, 0))

    failing = {c.field for c in resolution.checks if not c.passed}
    incomparable = frozenset(c.field for c in resolution.checks if not c.comparable)
    lines: list[CostLine] = []
    unpriced: list[str] = []
    for cls in deviation_classes(param, failing, governing, requirement, incomparable):
        rate_lines = table.deviation_rates.get(cls)
        if rate_lines is None:
            unpriced.append(cls)
            continue
        resolved = []
        for rl in rate_lines:
            qty = rl.qty if isinstance(rl.qty, Decimal) else known.get(rl.qty)
            if qty is None:
                break
            resolved.append(CostLine(
                label=rl.label, qty=qty, unit=rl.unit, rate=rl.rate, driver=rl.driver,
                # A range is carried only where the table states one, so stored lines stay as they were.
                rate_low=rl.low if rl.low != rl.rate else None,
                rate_high=rl.high if rl.high != rl.rate else None,
            ))
        else:
            lines.extend(resolved)
            continue
        unpriced.append(cls)  # a quantity this class needs is unknown

    adder = sum((line.qty * line.rate for line in lines), Decimal("0")).quantize(CENTS, rounding=ROUND_HALF_UP)
    return Pricing(lines, adder, _formula(lines), "UNPRICED" if unpriced else "PRICED", unpriced, table.version)
