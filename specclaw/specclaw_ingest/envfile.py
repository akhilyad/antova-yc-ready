"""Read locator settings from specclaw/.env, and nothing else from it.

The file may also hold keys for unrelated services, so only names that start with one of
ALLOWED_PREFIXES are read, and a name already set in the environment is never replaced
(a real environment variable, or a test's blank value, wins over the file).

SPECCLAW_ENV_FILE names another file; set it to a path that does not exist to read none.
"""

from __future__ import annotations

import os
from pathlib import Path

ALLOWED_PREFIXES = ("ANTHROPIC_", "EXPLABS_", "SPECCLAW_", "ANTOVA_")
DEFAULT_PATH = Path(__file__).resolve().parents[1] / ".env"


def env_path() -> Path:
    return Path(os.environ.get("SPECCLAW_ENV_FILE") or DEFAULT_PATH)


def parse(text: str) -> dict[str, str]:
    """NAME=value lines. Blank lines, # comments and a leading `export ` are ignored; one pair of
    surrounding quotes is removed from the value."""
    values: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip().removeprefix("export ").strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        name, value = name.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if name:
            values[name] = value
    return values


def load(path: Path | None = None) -> list[str]:
    """Set the allowed, not yet set names from the file. Returns the names it set (never their values)."""
    path = path or env_path()
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError:
        return []
    applied = []
    for name, value in parse(text).items():
        if name.startswith(ALLOWED_PREFIXES) and name not in os.environ:
            os.environ[name] = value
            applied.append(name)
    return applied
