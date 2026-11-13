"""WP8: the mutation generator and the pipeline's behaviour on every generated pack."""

import hashlib
import json
from pathlib import Path

import pytest

from samples import mutate
from specclaw_ingest import verify
from specclaw_ingest.pipeline import run_ingest
from specclaw_ingest.tests.fakes import PACK, AnswerKeyLocator

SEEDS = (0, 1, 2)
# Operators whose behaviour is built in a later work packet. Their tests are RED today and are
# marked as expected failures (strict: the mark must be removed when the packet lands).
PENDING: dict[str, str] = {}


def _pending(*names: str):
    reasons = [PENDING[n] for n in names if n in PENDING]
    return pytest.mark.xfail(strict=True, reason="; ".join(reasons)) if reasons else ()


def _operator_params():
    return [pytest.param(name, marks=_pending(name)) for name in sorted(mutate.OPERATORS)]


def _sample_hashes() -> dict[str, str]:
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(PACK.iterdir()) if p.is_file()}


def ingest(operators: list[str], tmp_path: Path, seed: int = 0):
    target = mutate.generate(operators, tmp_path, seed)
    expected = json.loads((target / "expected.json").read_text(encoding="utf-8"))
    return run_ingest(target, locator=AnswerKeyLocator(expected)), expected


def cells(result) -> dict:
    return {(vid, p.id): cell for p in result.tender.parameters for vid, cell in p.vendors.items()}


# --- the generator itself -------------------------------------------------------

def test_no_operators_reproduces_the_base_pack(tmp_path):
    result, expected = ingest([], tmp_path)
    assert expected["tender_id"].startswith("MUT-402-") and expected["mutations"] == []
    assert verify.compare_to_answer_key(result.tender, expected, result) == []


def test_generation_is_seeded_and_byte_identical(tmp_path):
    one = mutate.generate(["european_locale", "missing_headline"], tmp_path / "one", seed=3)
    two = mutate.generate(["european_locale", "missing_headline"], tmp_path / "two", seed=3)
    names = sorted(p.name for p in one.iterdir())
    assert names == sorted(p.name for p in two.iterdir())
    for name in names:
        assert (one / name).read_bytes() == (two / name).read_bytes(), name


def test_generated_packs_never_land_in_samples():
    before = _sample_hashes()
    with pytest.raises(mutate.MutationError):
        mutate.generate(["missing_headline"], mutate.SAMPLES_DIR)
    with pytest.raises(mutate.MutationError):
        mutate.generate(["missing_headline"], mutate.SAMPLES_DIR / "TENDER-2026-402")
    assert _sample_hashes() == before


def test_the_base_pack_is_untouched_by_mutation(tmp_path):
    before = _sample_hashes()
    for name in mutate.OPERATORS:
        mutate.generate([name], tmp_path / name)
    assert _sample_hashes() == before
    assert mutate.base_pack().expected == json.loads((PACK / "expected.json").read_text(encoding="utf-8"))


def test_unknown_operator_is_refused():
    with pytest.raises(mutate.MutationError):
        mutate.mutate(["no_such_operator"])


def test_cli_lists_operators(capsys):
    assert mutate.main(["--list"]) == 0
    listed = capsys.readouterr().out
    for name in mutate.OPERATORS:
        assert name in listed


# --- every operator against its derived key ----------------------------------------

@pytest.mark.parametrize("seed", SEEDS)
@pytest.mark.parametrize("name", _operator_params())
def test_operator_matches_its_derived_key(name, seed, tmp_path):
    result, expected = ingest([name], tmp_path, seed)
    assert expected["mutations"] == [name]
    assert verify.compare_to_answer_key(result.tender, expected, result) == []


@pytest.mark.parametrize("seed", [pytest.param(seed, marks=_pending("drop_locator_entry")) for seed in SEEDS])
def test_dropped_passage_never_yields_compliant(seed, tmp_path):
    result, expected = ingest(["drop_locator_entry"], tmp_path, seed)
    for dropped in expected["dropped"]:
        cell = cells(result)[(dropped["vendor_id"], dropped["param_id"])]
        assert cell.status.value != "COMPLIANT"
        assert cell.status.value == "CONFLICT_DOWNGRADE" or cell.flags


def test_missing_headline_is_null_not_zero(tmp_path):
    result, expected = ingest(["missing_headline"], tmp_path)
    vendor_id = next(v for v, want in expected["vendors"].items() if want["headline_price"] is None)
    assert any(f"{vendor_id}: headline price not found" in w for w in result.warnings)


@pytest.mark.parametrize("_", [pytest.param(0, marks=_pending("drop_locator_entry", "european_locale"))])
def test_operators_combine(_, tmp_path):
    result, expected = ingest(["european_locale", "missing_headline", "drop_locator_entry"], tmp_path, seed=1)
    assert expected["mutations"] == ["european_locale", "missing_headline", "drop_locator_entry"]
    assert verify.compare_to_answer_key(result.tender, expected, result) == []


# --- the eval command -----------------------------------------------------------------

def test_eval_covers_every_operator_and_matches_every_key(tmp_path, capsys):
    from specclaw_ingest import eval as evaluation

    rows = evaluation.run(seeds=1, out_dir=tmp_path)
    assert [r["operator"] for r in rows] == ["(base pack)", *sorted(mutate.OPERATORS), "TOTAL"]
    total = rows[-1]
    assert total["packs"] == len(mutate.OPERATORS) + 1
    assert (total["mismatches"], total["rejected"]) == (0, 0)
    assert (total["status"], total["pricing"], total["recall"]) == ("100.0%", "100.0%", "100.0%")
    table = evaluation.format_table(rows)
    assert table.splitlines()[0].startswith("| operator") and "TOTAL" in table.splitlines()[-1]


def test_all_thirteen_operators_from_the_brief_exist():
    assert {"running_header", "european_locale", "hyphen_wrap", "two_column_quote", "scanned_page", "corrupt_pdf",
            "missing_headline", "per_bay_headline", "currency_mismatch", "same_tier_conflict", "unpriced_class",
            "drop_locator_entry", "injection_text"} <= set(mutate.OPERATORS)
