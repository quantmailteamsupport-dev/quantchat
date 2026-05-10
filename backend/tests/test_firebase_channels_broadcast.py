"""Regression tests for Firebase readiness and channel/broadcast admin routes."""

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
def auth_headers(api_client):
    # Module: Authentication bootstrap for protected routes
    response = api_client.post(
        f"{BASE_URL.rstrip('/')}/api/auth/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
        timeout=25,
    )
    assert response.status_code == 200
    data = response.json()
    token = data.get("token")
    assert isinstance(token, str) and token
    assert data.get("user", {}).get("email") == DEMO_EMAIL
    return {"Authorization": f"Bearer {token}"}


def test_firebase_status_ready(api_client):
    # Module: Firebase backend readiness endpoint
    response = api_client.get(f"{BASE_URL.rstrip('/')}/api/auth/firebase/status", timeout=25)
    assert response.status_code == 200
    data = response.json()
    assert data.get("firebase_ready") is True
    assert isinstance(data.get("project_id"), str) and data["project_id"]


def test_channels_hub_list_loads(api_client, auth_headers):
    # Module: Channels hub data endpoint
    response = api_client.get(
        f"{BASE_URL.rstrip('/')}/api/channels",
        headers=auth_headers,
        timeout=25,
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data.get("channels"), list)


def test_channel_creation_and_persistence(api_client, auth_headers):
    # Module: Channel creation route and persistence check
    channel_name = f"TEST_Firebase_Channel_{int(time.time())}"
    create_response = api_client.post(
        f"{BASE_URL.rstrip('/')}/api/channels",
        json={
            "name": channel_name,
            "participant_ids": [],
            "is_channel": True,
            "posting_permission": "admins",
            "approval_required": False,
        },
        headers=auth_headers,
        timeout=25,
    )
    assert create_response.status_code == 200
    created = create_response.json().get("conversation", {})
    channel_id = created.get("id")
    assert isinstance(channel_id, str) and channel_id
    assert created.get("name") == channel_name
    assert created.get("is_channel") is True

    list_response = api_client.get(
        f"{BASE_URL.rstrip('/')}/api/channels",
        headers=auth_headers,
        timeout=25,
    )
    assert list_response.status_code == 200
    channels = list_response.json().get("channels", [])
    persisted = next((item for item in channels if item.get("id") == channel_id), None)
    assert persisted is not None
    assert persisted.get("name") == channel_name


def test_channel_draft_creation_and_persistence(api_client, auth_headers):
    # Module: Channel draft create and fetch validation
    channel_name = f"TEST_Draft_Channel_{int(time.time())}"
    channel_response = api_client.post(
        f"{BASE_URL.rstrip('/')}/api/channels",
        json={
            "name": channel_name,
            "participant_ids": [],
            "is_channel": True,
            "posting_permission": "admins",
            "approval_required": False,
        },
        headers=auth_headers,
        timeout=25,
    )
    assert channel_response.status_code == 200
    channel_id = channel_response.json().get("conversation", {}).get("id")
    assert isinstance(channel_id, str) and channel_id

    draft_content = f"TEST_Draft_Content_{int(time.time())}"
    create_draft_response = api_client.post(
        f"{BASE_URL.rstrip('/')}/api/channels/{channel_id}/drafts",
        json={
            "content": draft_content,
            "media_url": "",
            "audience": "subscribers",
            "tags": ["test", "firebase"],
            "location_label": "",
        },
        headers=auth_headers,
        timeout=25,
    )
    assert create_draft_response.status_code == 200
    created_draft = create_draft_response.json().get("draft", {})
    draft_id = created_draft.get("id")
    assert isinstance(draft_id, str) and draft_id
    assert created_draft.get("content") == draft_content

    list_draft_response = api_client.get(
        f"{BASE_URL.rstrip('/')}/api/channels/{channel_id}/drafts",
        headers=auth_headers,
        timeout=25,
    )
    assert list_draft_response.status_code == 200
    drafts = list_draft_response.json().get("drafts", [])
    persisted = next((item for item in drafts if item.get("id") == draft_id), None)
    assert persisted is not None
    assert persisted.get("content") == draft_content


def test_broadcast_list_creation_and_persistence(api_client, auth_headers):
    # Module: Broadcast list create and fetch validation
    list_name = f"TEST_Broadcast_List_{int(time.time())}"
    create_response = api_client.post(
        f"{BASE_URL.rstrip('/')}/api/broadcast-lists",
        json={
            "name": list_name,
            "participant_ids": [],
        },
        headers=auth_headers,
        timeout=25,
    )
    assert create_response.status_code == 200
    broadcast = create_response.json().get("broadcast_list", {})
    broadcast_id = broadcast.get("id")
    assert isinstance(broadcast_id, str) and broadcast_id
    assert broadcast.get("name") == list_name
    assert isinstance(broadcast.get("participant_ids"), list)

    list_response = api_client.get(
        f"{BASE_URL.rstrip('/')}/api/broadcast-lists",
        headers=auth_headers,
        timeout=25,
    )
    assert list_response.status_code == 200
    broadcast_lists = list_response.json().get("broadcast_lists", [])
    persisted = next((item for item in broadcast_lists if item.get("id") == broadcast_id), None)
    assert persisted is not None
    assert persisted.get("name") == list_name
