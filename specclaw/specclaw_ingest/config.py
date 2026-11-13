"""Configuration checks that run at startup.

The ontology, the rule set and the rate tables are written by hand and have to
agree with each other. validate_config() checks that they do and raises
ConfigError with a message naming the gap. It runs when the API starts and
before every ingest, so a gap never shows up as a KeyError halfway through a run.
"""

from __future__ import annotations

from specclaw_ingest import costs, sweep, values
from specclaw_ingest.costs import ConfigError, RateTable
from specclaw_ingest.ontology import ORDINALS, PARAMETERS

# Field kinds values.parse_field can read, and the operators values.check can apply.
PARSED_KINDS = frozenset(values.FIELD_PARSERS) | frozenset(values.QUANTITY_KINDS)
OPERATORS = frozenset({"ge", "eq", "ord"})

_checked = False


def rate_table_names() -> list[str]:
    return sorted(path.stem for path in costs.RATES_DIR.glob("*.json"))


def validate_ontology() -> None:
    seen: set[str] = set()
    for param in PARAMETERS:
        if param.id in seen:
            raise ConfigError(f"ontology: parameter {param.id} is defined twice")
        seen.add(param.id)
        if not param.fields:
            raise ConfigError(f"ontology: parameter {param.id} has no fields")
        if not param.sweep_terms:
            raise ConfigError(f"ontology: parameter {param.id} has no sweep_terms (the recall sweep cannot see it)")
        names = [f.name for f in param.fields]
        if param.scope_field is not None and param.scope_field not in names:
            raise ConfigError(f"ontology: {param.id} scope_field {param.scope_field!r} is not one of its fields")
        for f in param.fields:
            where = f"ontology field {param.id} {f.name}"
            if f.kind not in PARSED_KINDS:
                raise ConfigError(f"{where}: no parser for kind {f.kind!r} (add one to values.FIELD_PARSERS)")
            if f.kind not in sweep.SIGNALS:
                raise ConfigError(f"{where}: no sweep signal for kind {f.kind!r} (add one to sweep.SIGNALS)")
            if f.operator not in OPERATORS:
                raise ConfigError(f"{where}: unknown operator {f.operator!r}")
            if f.operator == "ord" and f.kind not in ORDINALS:
                raise ConfigError(f"{where}: operator 'ord' needs a declared order for kind {f.kind!r} "
                                  f"(add it to ontology.ORDINALS)")
            try:
                values.plausible_bounds(f)
            except ValueError as exc:
                raise ConfigError(f"{where}: {exc}") from exc
            costs.classes_for_field(param, f)  # raises for a field with no deviation class
        try:
            param.display_template.format(**{name: "" for name in names})
        except (KeyError, IndexError) as exc:
            raise ConfigError(f"ontology: {param.id} display_template names an unknown field {exc}") from exc


def validate_table(table: RateTable) -> None:
    """Every class a failing check can produce is either priced or knowingly listed as unpriced."""
    for param in PARAMETERS:
        for f in param.fields:
            for cls in costs.classes_for_field(param, f):
                if cls not in table.deviation_rates and cls not in table.unpriced_classes:
                    raise ConfigError(
                        f"rate table {table.version}: no rate lines for {cls} "
                        f"(add them, or list the class under unpriced_classes)")
    known = {cls for param in PARAMETERS for f in param.fields for cls in costs.classes_for_field(param, f)}
    for cls in table.unpriced_classes:
        if cls not in known:
            raise ConfigError(f"rate table {table.version}: unpriced class {cls} matches no ontology field")


def validate_config() -> None:
    """Check the ontology and every rate table in specclaw_ingest/rates. Raises ConfigError."""
    validate_ontology()
    names = rate_table_names()
    if not names:
        raise ConfigError("no rate table found in specclaw_ingest/rates")
    for name in names:
        table = costs.load_rate_table(name)
        if table.version != name:
            raise ConfigError(f"rate table file {name}.json declares version {table.version!r}")
        validate_table(table)


def ensure_valid() -> None:
    """validate_config(), once per process."""
    global _checked
    if not _checked:
        validate_config()
        _checked = True


def reset() -> None:
    """Forget that the configuration was checked (tests change it on purpose)."""
    global _checked
    _checked = False
