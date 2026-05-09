"""Regression checks for Nexus deployment public reachability and HTTP behavior."""

import os
import pytest
import requests


SERVER_IP = os.getenv("NEXUS_SERVER_IP", "20.249.208.224")
BASE_HTTP = os.getenv("NEXUS_BASE_HTTP", f"http://{SERVER_IP}")
WEB_URL = os.getenv("NEXUS_WEB_URL", f"{BASE_HTTP}:3000")
DOCS_URL = os.getenv("NEXUS_DOCS_URL", f"{BASE_HTTP}:3001")
ADMIN_URL = os.getenv("NEXUS_ADMIN_URL", f"{BASE_HTTP}:3002")
API_URL = os.getenv("NEXUS_API_URL", f"{BASE_HTTP}:4000")
TIMEOUT_SECONDS = 12


def fetch(url: str) -> requests.Response:
    return requests.get(url, timeout=TIMEOUT_SECONDS, allow_redirects=False)


# Web app production home should be publicly reachable.
def test_web_home_public_reachable():
    response = fetch(WEB_URL)
    assert response.status_code == 200


# Docs app production home should be publicly reachable.
def test_docs_home_public_reachable():
    response = fetch(DOCS_URL)
    assert response.status_code == 200


# Admin unauthenticated access should return Basic auth challenge.
def test_admin_public_returns_401_basic_auth():
    response = fetch(ADMIN_URL)
    assert response.status_code == 401
    www_auth = response.headers.get("WWW-Authenticate", "")
    assert "Basic" in www_auth


# API gateway liveness endpoint should return HTTP 200.
def test_api_gateway_healthz_public_200():
    response = fetch(f"{API_URL}/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "ok"


# API gateway readiness endpoint should return HTTP 200.
def test_api_gateway_readyz_public_200():
    response = fetch(f"{API_URL}/readyz")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") in ["ready", "ok"]


# Root HTTP endpoint should be reachable when ingress/public routing is enabled.
def test_server_root_http_reachable():
    if "NEXUS_BASE_HTTP" not in os.environ:
        pytest.skip("Direct root HTTP ingress is not configured; app URLs are tested separately.")
    response = fetch(BASE_HTTP)
    assert response.status_code in [200, 301, 302, 401]
