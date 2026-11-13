"""Test setup: every test run uses its own temporary SQLite database.

The environment variable must be set before anything imports specclaw_db,
because that module builds its engine at import time.
"""

import os
import tempfile
from pathlib import Path

_TEST_DB_DIR = Path(tempfile.mkdtemp(prefix="specclaw-tests-"))
os.environ["SPECCLAW_DATABASE_URL"] = f"sqlite:///{(_TEST_DB_DIR / 'test.db').as_posix()}"

# No test may reach the paid Claude API: live calls fail with MissingCredentials
# unless a test sets a fake key itself (and then uses a fake client).
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["ANTHROPIC_AUTH_TOKEN"] = ""

# Founder review token for the gated routes, and the one origin CORS allows.
# CORS origins are read when specclaw_api is imported, so set them first.
os.environ["ANTOVA_REVIEW_TOKEN"] = "test-review-token"
os.environ["ANTOVA_ALLOWED_ORIGINS"] = "http://localhost:5173"

import pytest  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _test_database_schema():
    """Create the schema once; the app's startup hook never runs in tests."""
    import specclaw_db

    specclaw_db.init_db()
    yield
