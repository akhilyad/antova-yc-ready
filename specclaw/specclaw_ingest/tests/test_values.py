"""Value parsers, Pint checks and the parameter ontology."""

from decimal import Decimal

import pytest

from samples import scenario
from specclaw_ingest.ontology import EVIDENCE_TIERS, PARAMETERS, PARAMS_BY_ID
from specclaw_ingest.values import (
    check,
    display_text,
    parse_bay_count,
    parse_field,
    parse_price,
    rule_text,
)

FIELD_KINDS = {
    "current", "duration", "voltage", "temperature", "material", "ip", "iac",
    "protocol", "marshalling", "fat_days", "incoterm", "months",
}


def _evidence_cases():
    """Every answer-key sentence with the display each field must parse to."""
    cases = []
    for param_id, (keys, values) in scenario.REQUIREMENTS.items():
        param = PARAMS_BY_ID[param_id]
        texts = [scenario._EV_BY_KEY[k].text for k in keys]
        for f in param.fields:
            # PARAM-06's two MR sentences each carry one of its two fields.
            text = next(t for t in texts if parse_field(f.kind, t, f.name) is not None) if len(texts) > 1 else texts[0]
            cases.append((f.kind, f.name, text, values[f.name]))
    for by_param in scenario.CELLS.values():
        for param_id, (_status, key, values, _secondary, _adder) in by_param.items():
            for f in PARAMS_BY_ID[param_id].fields:
                cases.append((f.kind, f.name, scenario._EV_BY_KEY[key].text, values[f.name]))
    # Lower-tier claims the precedence step compares against.
    claims = {
        "b.p01sec": {"ik": "50 kA", "ik_duration": "3 s"},
        "b.p04sec": {"protocol": "IEC 61850 Ed. 2 with PRP", "marshalling": None},
        "c.p01sec": {"ik": "50 kA", "ik_duration": "1 s"},
    }
    for key, values in claims.items():
        ev = scenario._EV_BY_KEY[key]
        for f in PARAMS_BY_ID[ev.param_id].fields:
            cases.append((f.kind, f.name, ev.text, values[f.name]))
    return cases


EXTRA_CASES = [
    ("current", "ik", "Rated: 50,000 A for 3 s", "50000 A"),
    ("current", "ik", "Enclosure IP54, internal arc classification IAC AFLR 50 kA 1 s.", None),
    ("current", "ik", "Rated voltage 50 kV.", None),
    ("temperature", "max_ambient", "-25 °C to +40 °C", "40 °C"),
    ("temperature", "max_ambient", "rated 313 K ambient", "313 K"),
    ("material", "material", "aluminium busbars with copper transition plates", None),
    ("incoterm", "incoterm", "Delivered Duty Paid site", "DDP"),
    ("protocol", "protocol", "IEC 61850 Edition 1 with PRP", "IEC 61850, not Ed. 2 with PRP"),
    ("fat_days", "witnessed_fat_days_included", "Routine tests only; no witnessed FAT.", "0"),
    # Final review I2: carved-out or qualified values must not count as offered.
    ("protocol", "protocol", "IEC 61850 Ed.2 relays, PRP not included.", "IEC 61850, not Ed. 2 with PRP"),
    ("protocol", "protocol", "IEC 61850 Ed.2 relays without PRP.", "IEC 61850, not Ed. 2 with PRP"),
    ("protocol", "protocol", "IEC 61850 Ed.2 relays; PRP redundancy optional at extra cost.", "IEC 61850, not Ed. 2 with PRP"),
    ("months", "warranty_months",
     "Extended warranty to 36 months available at extra cost; standard warranty 12 months.", "12"),
    ("incoterm", "incoterm", "DDP delivery available on request; base price FCA Izmir.", "FCA"),
    ("temperature", "max_ambient",
     "Maximum ambient temperature 35 °C without derating (45 °C with 20% derating).", "35 °C"),
    ("current", "ik",
     "Rated peak withstand current Ip 100 kA, rated short-time withstand current Ik 40 kA for 3 s.", "40 kA"),
    ("duration", "ik_duration",
     "Rated peak withstand current Ip 100 kA, rated short-time withstand current Ik 40 kA for 3 s.", "3 s"),
]


@pytest.mark.parametrize("kind,field_name,quote,expected", _evidence_cases() + EXTRA_CASES)
def test_parse_field(kind, field_name, quote, expected):
    value = parse_field(kind, quote, field_name)
    if expected is None:
        assert value is None
    else:
        assert value is not None, quote
        assert value.display == expected


@pytest.mark.parametrize("kind,quote,display", [
    ("protocol", "IEC 61850 Ed.2 relays with PRP redundancy.", "IEC 61850 Ed. 2 with PRP"),
    ("protocol", "IEC 61850 Ed.2 relays without PRP.", "IEC 61850, not Ed. 2 with PRP"),
    ("protocol", "IEC 61850 Edition 1 with PRP", "IEC 61850, not Ed. 2 with PRP"),
    ("protocol", "Modbus RTU over RS485.", "not IEC 61850"),
    ("marshalling", "Marshalling terminals loose, wiring by others.", "not pre-wired"),
    ("marshalling", "Marshalling cubicle factory wired.", "pre-wired"),
])
def test_coded_fields_display_in_words(kind, quote, display):
    """Phase 4 finding 2: buyers read 'The bid says', so no internal codes (OTHER, NOT_PREWIRED)."""
    value = parse_field(kind, quote, kind)
    assert value is not None and value.display == display


def test_parse_price():
    assert parse_price("Total lump-sum price for the complete scope: €418,000") == Decimal("418000")
    assert parse_price("EUR 418.000,00") == Decimal("418000")
    assert parse_price("€418,000.00") == Decimal("418000")
    assert parse_price("price on request") is None


def test_parse_price_space_grouped_thousands():
    """Final review I1: ISO/SI digit grouping must not shrink the price 1000x."""
    assert parse_price("Total lump-sum price: €452 000") == Decimal("452000")
    assert parse_price("EUR 452 000,00") == Decimal("452000")
    assert parse_price("EUR 452 000,00") == Decimal("452000")
    assert parse_price("€452 000") == Decimal("452000")


def test_parse_price_rejects_abbreviated_amounts():
    assert parse_price("€452k") is None
    assert parse_price("EUR 0.45 m") is None
    assert parse_price("EUR 1.2 Mio") is None


def test_parse_bay_count():
    assert parse_bay_count(scenario._EV_BY_KEY["mr.bays"].text) == 11


def _fv(param_id, quote, index=0):
    f = PARAMS_BY_ID[param_id].fields[index]
    value = parse_field(f.kind, quote, f.name)
    assert value is not None, quote
    return f, value


@pytest.mark.parametrize("param_id,index,required,offered,passed", [
    ("PARAM-01", 0, "50 kA", "50000 A", True),
    ("PARAM-08", 0, "40 °C", "104 °F", True),
    ("PARAM-08", 0, "40 °C", "39.9 °C", False),
    ("PARAM-03", 0, "IP54", "IP63", False),
    ("PARAM-03", 0, "IP54", "IP65", True),
    ("PARAM-02", 0, "Cu-ETP", "aluminium", False),
    ("PARAM-06", 1, "warranty 36 months", "warranty 18 months", False),
    ("PARAM-05", 0, "5-day witnessed FAT included", "Routine tests only; no witnessed FAT.", False),
])
def test_check(param_id, index, required, offered, passed):
    field, req = _fv(param_id, required, index)
    _, off = _fv(param_id, offered, index)
    assert check(field, req, off)[0] is passed


def test_check_reports_offer_in_required_unit():
    field, req = _fv("PARAM-07", "36 kV")
    _, off = _fv("PARAM-07", "36000 V")
    assert check(field, req, off) == (True, "36 kV")


def test_rule_text_param01():
    param = PARAMS_BY_ID["PARAM-01"]
    quote = scenario._EV_BY_KEY["mr.p01"].text
    requirement = {f.name: parse_field(f.kind, quote, f.name) for f in param.fields}
    assert rule_text(param, requirement) == "Ik ≥ 50 kA AND t ≥ 3 s"


def test_display_text_missing_field():
    param = PARAMS_BY_ID["PARAM-02"]
    material = parse_field("material", "aluminium alloy profiles", "material")
    assert display_text(param, {"material": material}) == "Al, —"


def test_ontology():
    assert len(PARAMETERS) == 8
    assert [p.id for p in PARAMETERS] == [f"PARAM-0{i}" for i in range(1, 9)]
    for param in PARAMETERS:
        for f in param.fields:
            assert f.kind in FIELD_KINDS
            assert f.operator in ("ge", "eq", "ord")  # "ord": amendment A1
    assert PARAMS_BY_ID["PARAM-05"].scope_field == "witnessed_fat_days_included"
    assert EVIDENCE_TIERS["drawing"] == 1
    assert EVIDENCE_TIERS["compliance_table"] == 2
    assert EVIDENCE_TIERS["cover_letter"] == 3
