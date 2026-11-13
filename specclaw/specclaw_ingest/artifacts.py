"""Stage artifacts and the run fingerprint.

Each pipeline stage returns a JSON-serializable body. The body is written as
canonical JSON (sorted keys, Decimals as strings, no timings) and hashed with
SHA-256, so two runs on the same inputs give the same hash at every stage, and
any stage can be rerun from the stored artifacts of the stages before it.

The run fingerprint covers everything that decides a run's outcome besides the
locator's answers: the input files, the ontology, the deterministic rules, the
rate table, the system prompt, the locator mode and the package version.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import Any

import specclaw_ingest
from specclaw_ingest import extract, ontology

STAGE_NAMES = ("parsed", "located", "verified", "resolved", "checked", "priced", "leveled")
# The modules that hold deterministic rules: a change to any of them changes the fingerprint.
RULE_MODULES = ("parse.py", "values.py", "precedence.py", "costs.py", "sweep.py", "pipeline.py", "clarify.py")
_PACKAGE_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class StageArtifact:
    stage: str
    sha256: str
    body: str  # canonical JSON

    def load(self) -> Any:
        return json.loads(self.body)


def _plain(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Path):
        return value.as_posix()
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return _plain(dataclasses.asdict(value))
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        items = [_plain(v) for v in value]
        return sorted(items) if isinstance(value, (set, frozenset)) else items
    if isinstance(value, float) and value != value:  # NaN has no JSON form
        raise ValueError("NaN cannot be written to an artifact")
    return value


def canonical_json(value: Any) -> str:
    return json.dumps(_plain(value), sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_of(value: Any) -> str:
    return sha256_text(canonical_json(value))


def make_artifact(stage: str, body: Any) -> StageArtifact:
    if stage not in STAGE_NAMES:
        raise ValueError(f"unknown stage {stage!r}")
    text = canonical_json(body)
    return StageArtifact(stage, sha256_text(text), text)


def _file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else ""


def _source_sha256(path: Path) -> str:
    """A source file's hash with line endings normalized, so a checkout's CRLF setting does not matter."""
    if not path.is_file():
        return ""
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def ontology_hash() -> str:
    return sha256_of({
        "parameters": [dataclasses.asdict(p) for p in ontology.PARAMETERS],
        "evidence_tiers": ontology.EVIDENCE_TIERS,
        "heading_sections": [[list(phrases), section] for phrases, section in ontology.HEADING_SECTIONS],
        "ordinals": getattr(ontology, "ORDINALS", {}),
    })


def rules_hash() -> str:
    return sha256_of({name: _source_sha256(_PACKAGE_DIR / name) for name in RULE_MODULES})


def run_fingerprint(tender_dir: Path, locator_mode: str) -> dict:
    """The fingerprint of a run on this folder, with the parts it was built from.

    Reads only the manifest and file bytes; an unreadable or missing file hashes
    as "" (the run itself reports it).
    """
    tender_dir = Path(tender_dir)
    manifest_path = tender_dir / "manifest.json"
    inputs = {"manifest.json": _file_sha256(manifest_path)}
    rate_table = ""
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for doc in manifest.get("documents", []):
            inputs[str(doc.get("file"))] = _file_sha256(tender_dir / str(doc.get("file")))
        rate_table = _source_sha256(_PACKAGE_DIR / "rates" / f"{manifest.get('rate_table')}.json")
    except (OSError, ValueError, AttributeError):
        pass  # a broken manifest fails the run at intake; the fingerprint still names what was there
    parts = {
        "inputs": inputs,
        "ontology": ontology_hash(),
        "rules": rules_hash(),
        "rate_table": rate_table,
        "prompt": sha256_text(extract.build_system_prompt()),
        "locator_mode": locator_mode,
        "package_version": specclaw_ingest.__version__,
    }
    return {"fingerprint": sha256_of(parts), "parts": parts}


def run_id(fingerprint: str, stage_hashes: dict[str, str]) -> str:
    """One run's identity: its inputs (the fingerprint) and what every stage produced.

    Two runs with the same fingerprint can still differ when a live locator answers
    differently, so the leveling cache is keyed by this, not by the fingerprint alone.
    """
    return sha256_of({"fingerprint": fingerprint, "stages": stage_hashes})[:32]
