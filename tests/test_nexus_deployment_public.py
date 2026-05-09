"""Regression checks for Nexus public ingress deployment and route behavior."""

import os
import requests


INGRESS_BASE_URL = os.getenv(
    "NEXUS_MAIN_INGRESS_URL",
    "https://get-painting-consumers-completing.trycloudflare.com",
).rstrip("/")
TIMEOUT_SECONDS = 12


def fetch(url: str) -> requests.Response:
    return requests.get(url, timeout=TIMEOUT_SECONDS, allow_redirects=False)


# Frontend ingress: polished home should be publicly reachable.
def test_ingress_home_public_reachable_and_polished():
    response = fetch(INGRESS_BASE_URL)
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    body = response.text
    assert "qc-home" in body or "QuantChat" in body


# Frontend ingress: chat route should load login gate or chat shell.
def test_ingress_chat_route_loads_gate_or_shell():
    response = fetch(f"{INGRESS_BASE_URL}/chat")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    body = response.text
    assert (
        "Sign in" in body
        or "secure chat" in body.lower()
        or "chat-control-room-shell" in body
        or "chat-auth-required" in body
    )


# Backend ingress: health endpoint should return HTTP 200 + expected payload.
def test_ingress_healthz_public_200():
    response = fetch(f"{INGRESS_BASE_URL}/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "ok"


# Backend ingress: readiness endpoint should return HTTP 200 + expected payload.
def test_ingress_readyz_public_200():
    response = fetch(f"{INGRESS_BASE_URL}/readyz")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") in ["ready", "ok"]


# Backend ingress: S3 status endpoint should return JSON without secrets.
def test_ingress_s3_status_json_and_no_secret_leakage():
    response = fetch(f"{INGRESS_BASE_URL}/api/media/s3/status")
    assert response.status_code == 200
    assert "application/json" in response.headers.get("content-type", "")

    data = response.json()
    assert isinstance(data, dict)
    assert "configured" in data
    assert "missing" in data
    assert isinstance(data["missing"], list)

    response_text = response.text
    forbidden = [
        "secretAccessKey",
        "accessKeyId",
        "aws_access_key_id",
        "AKIA",
    ]
    assert not any(token in response_text for token in forbidden)
