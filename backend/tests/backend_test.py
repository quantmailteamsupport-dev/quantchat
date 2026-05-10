"""Core review regression tests for requested QuantChat auth/feed/assistant APIs."""

import os
import time

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
DEMO_EMAIL = "arjun@quantchat.com"
DEMO_PASSWORD = "Demo@1234"


@pytest.fixture(scope="session")
def api_client():
    if not BASE_URL:
        pytest.fail("REACT_APP_BACKEND_URL is required for backend tests")
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def auth_context(api_client):
    # Module: Auth + token bootstrap for protected endpoint coverage
    login_response = api_client.post(
        f"{BASE_URL.rstrip('/')}/api/auth/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
        timeout=25,
    )
    assert login_response.status_code == 200
    login_data = login_response.json()
    assert login_data.get("user", {}).get("email") == DEMO_EMAIL
    token = login_data.get("token")
    assert isinstance(token, str) and token
    return {
        "token": token,
        "user": login_data["user"],
        "headers": {"Authorization": f"Bearer {token}"},
    }


def test_login_endpoint_returns_user_and_token(api_client):
    # Module: /api/auth/login contract validation
    response = api_client.post(
        f"{BASE_URL.rstrip('/')}/api/auth/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
        timeout=25,
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("user", {}).get("email") == DEMO_EMAIL
    assert isinstance(data.get("token"), str) and len(data["token"]) > 10


def test_conversations_endpoint_returns_seeded_inbox(auth_context, api_client):
    # Module: /api/conversations seeded data visibility
    response = api_client.get(
        f"{BASE_URL.rstrip('/')}/api/conversations",
        headers=auth_context["headers"],
        timeout=25,
    )
    assert response.status_code == 200
    data = response.json()
    conversations = data.get("conversations", [])
    assert isinstance(conversations, list)
    assert len(conversations) > 0
    assert isinstance(conversations[0].get("id"), str)


def test_stories_endpoint_returns_groups(auth_context, api_client):
    # Module: /api/stories grouped feed validation
    response = api_client.get(
        f"{BASE_URL.rstrip('/')}/api/stories",
        headers=auth_context["headers"],
        timeout=25,
    )
    assert response.status_code == 200
    data = response.json()
    stories = data.get("stories", [])
    assert isinstance(stories, list)
    assert len(stories) > 0
    first_group = stories[0]
    assert isinstance(first_group.get("stories", []), list)


def test_reels_endpoint_returns_feed(auth_context, api_client):
    # Module: /api/reels feed validation
    response = api_client.get(
        f"{BASE_URL.rstrip('/')}/api/reels",
        headers=auth_context["headers"],
        timeout=25,
    )
    assert response.status_code == 200
    data = response.json()
    reels = data.get("reels", [])
    assert isinstance(reels, list)
    assert len(reels) > 0
    first_reel = reels[0]
    assert isinstance(first_reel.get("id"), str)
    assert "media_url" in first_reel


def test_assistant_respond_endpoint_returns_ai_message(auth_context, api_client):
    # Module: /api/assistant/respond LLM integration response check
    prompt = f"Give short inbox digest for smoke test {int(time.time())}"
    response = api_client.post(
        f"{BASE_URL.rstrip('/')}/api/assistant/respond",
        json={"prompt": prompt, "mode": "unread_digest", "conversation_id": None},
        headers=auth_context["headers"],
        timeout=50,
    )
    assert response.status_code == 200
    data = response.json()
    message = data.get("message", {})
    assert message.get("role") == "assistant"
    assert isinstance(message.get("content"), str) and len(message["content"].strip()) > 0
    assert isinstance(data.get("messages", []), list)
