"""Founder-only routes need the review token; CORS is closed by default."""

import pytest
from fastapi.testclient import TestClient

from specclaw_api import app
from specclaw_auth import REVIEW_HEADER

TOKEN = "test-review-token"  # set in conftest.py

GATED_ROUTES = [
    ("POST", "/api/jobs/ingest"),
    ("GET", "/api/jobs/no-such-job"),
    ("GET", "/api/review/tenders"),
    ("GET", "/api/review/tenders/TENDER-NOPE"),
    ("POST", "/api/review/tenders/TENDER-NOPE/verify"),
]

@pytest.fixture
def client():
    return TestClient(app)


@pytest.mark.parametrize("method,path", GATED_ROUTES)
def test_route_requires_token(client, method, path):
    response = client.request(method, path)
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid review token"}


@pytest.mark.parametrize("method,path", GATED_ROUTES)
def test_route_rejects_wrong_token(client, method, path):
    response = client.request(method, path, headers={REVIEW_HEADER: "not-the-token"})
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid review token"}


@pytest.mark.parametrize("method,path", GATED_ROUTES)
def test_route_accepts_token_with_whitespace(client, method, path):
    response = client.request(method, path, headers={REVIEW_HEADER: f" {TOKEN}\n"})
    assert response.status_code != 401


@pytest.mark.parametrize("method,path", GATED_ROUTES)
def test_unset_server_token_is_503(client, monkeypatch, method, path):
    monkeypatch.setenv("ANTOVA_REVIEW_TOKEN", "")
    response = client.request(method, path, headers={REVIEW_HEADER: TOKEN})
    assert response.status_code == 503
    assert response.json() == {"detail": "Review is not configured on this server"}


def test_absent_server_token_is_503(client, monkeypatch):
    monkeypatch.delenv("ANTOVA_REVIEW_TOKEN", raising=False)
    response = client.get("/api/review/tenders", headers={REVIEW_HEADER: TOKEN})
    assert response.status_code == 503


def test_health_hides_active_tender(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert "active_tender" not in response.json()


def _preflight(client, origin):
    return client.options("/api/review/tenders", headers={
        "Origin": origin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": REVIEW_HEADER,
    })


def test_cors_allows_configured_origin_only(client):
    allowed = _preflight(client, "http://localhost:5173")
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert REVIEW_HEADER.lower() in allowed.headers["access-control-allow-headers"].lower()
    assert "access-control-allow-credentials" not in allowed.headers

    denied = _preflight(client, "https://evil.example")
    assert "access-control-allow-origin" not in denied.headers
