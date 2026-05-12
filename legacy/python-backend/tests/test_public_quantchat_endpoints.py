"""Public URL regression tests for QuantChat tunnel auth/chat APIs and domain state."""

import os
import time

import pytest
import requests


# Module: Public tunnel + domain checks requested by review task
TUNNEL_BASE_URL = "https://get-painting-consumers-completing.trycloudflare.com"
CONFIGURED_BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
DOMAIN_URL = "https://quantchat.online"

DEMO_EMAIL = "arjun@quantchat.com"
DEMO_PASSWORD = "Demo@1234"


@pytest.fixture(scope="session")
def tunnel_session():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def tunnel_auth(tunnel_session):
    response = tunnel_session.post(
        f"{TUNNEL_BASE_URL}/api/auth/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
        timeout=25,
    )
    if response.status_code != 200:
        pytest.skip(f"Tunnel login failed; status={response.status_code}, body={response.text[:200]}")
    data = response.json()
    token = data.get("token")
    user = data.get("user", {})
    if not token:
        pytest.skip("Tunnel login succeeded without token")
    return {"token": token, "user": user}


def test_public_tunnel_health_endpoint(tunnel_session):
    response = tunnel_session.get(f"{TUNNEL_BASE_URL}/api/health", timeout=20)
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "ok"
    assert data.get("service") == "quantchat-api"


def test_public_tunnel_login_and_me_endpoint(tunnel_session, tunnel_auth):
    assert tunnel_auth["user"].get("email") == DEMO_EMAIL
    headers = {"Authorization": f"Bearer {tunnel_auth['token']}"}

    me_response = tunnel_session.get(f"{TUNNEL_BASE_URL}/api/auth/me", headers=headers, timeout=20)
    assert me_response.status_code == 200
    me_data = me_response.json()
    assert me_data.get("user", {}).get("email") == DEMO_EMAIL
    assert isinstance(me_data.get("user", {}).get("id"), str)


def test_public_tunnel_search_users_flow(tunnel_session, tunnel_auth):
    headers = {"Authorization": f"Bearer {tunnel_auth['token']}"}
    response = tunnel_session.get(f"{TUNNEL_BASE_URL}/api/users/search?q=priya", headers=headers, timeout=20)
    assert response.status_code == 200
    data = response.json()
    users = data.get("users", [])
    assert isinstance(users, list)
    assert any(u.get("email") == "priya@quantchat.com" for u in users)


def test_public_tunnel_conversation_message_basic_flow(tunnel_session, tunnel_auth):
    headers = {"Authorization": f"Bearer {tunnel_auth['token']}"}

    search_resp = tunnel_session.get(f"{TUNNEL_BASE_URL}/api/users/search?q=priya", headers=headers, timeout=20)
    assert search_resp.status_code == 200
    users = search_resp.json().get("users", [])
    assert users, "Expected at least one searchable user"
    other_user_id = users[0]["id"]

    conv_resp = tunnel_session.post(
        f"{TUNNEL_BASE_URL}/api/conversations",
        json={"participant_id": other_user_id, "type": "direct"},
        headers=headers,
        timeout=20,
    )
    assert conv_resp.status_code == 200
    conversation = conv_resp.json().get("conversation", {})
    conv_id = conversation.get("id")
    assert isinstance(conv_id, str) and conv_id

    message_text = f"TEST_public_tunnel_{int(time.time())}"
    send_resp = tunnel_session.post(
        f"{TUNNEL_BASE_URL}/api/conversations/{conv_id}/messages",
        json={"content": message_text, "type": "text"},
        headers=headers,
        timeout=20,
    )
    assert send_resp.status_code == 200
    sent = send_resp.json().get("message", {})
    assert sent.get("content") == message_text

    get_resp = tunnel_session.get(
        f"{TUNNEL_BASE_URL}/api/conversations/{conv_id}/messages",
        headers=headers,
        timeout=20,
    )
    assert get_resp.status_code == 200
    messages = get_resp.json().get("messages", [])
    assert any(m.get("content") == message_text for m in messages)


def test_quantchat_online_still_hostinger_parked():
    response = requests.get(DOMAIN_URL, timeout=20)
    assert response.status_code == 200
    body = response.text.lower()
    assert "hostinger" in body
    assert "parked domain" in body or "manage domain" in body


def test_configured_backend_url_health_if_present():
    if not CONFIGURED_BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not available in environment for pytest process")
    response = requests.get(f"{CONFIGURED_BASE_URL.rstrip('/')}/api/health", timeout=20)
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "ok"
