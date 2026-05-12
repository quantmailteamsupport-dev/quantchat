import json
import os
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials

FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID")
FIREBASE_SERVICE_ACCOUNT_PATH = os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH")
FIREBASE_SERVICE_ACCOUNT_JSON = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")


def _load_credential() -> credentials.Certificate | None:
    if FIREBASE_SERVICE_ACCOUNT_JSON:
        try:
            return credentials.Certificate(json.loads(FIREBASE_SERVICE_ACCOUNT_JSON))
        except (json.JSONDecodeError, ValueError):
            return None
    if FIREBASE_SERVICE_ACCOUNT_PATH and os.path.exists(FIREBASE_SERVICE_ACCOUNT_PATH):
        return credentials.Certificate(FIREBASE_SERVICE_ACCOUNT_PATH)
    return None


def initialize_firebase_admin() -> bool:
    if firebase_admin._apps:
        return True
    cred = _load_credential()
    if cred is None:
        return False
    firebase_admin.initialize_app(cred, {"projectId": FIREBASE_PROJECT_ID})
    return True


def firebase_is_ready() -> bool:
    return bool(firebase_admin._apps)


def verify_firebase_id_token(id_token: str) -> dict:
    if not firebase_is_ready():
        initialize_firebase_admin()
    if not firebase_is_ready():
        raise RuntimeError("Firebase Admin SDK not configured")
    return firebase_auth.verify_id_token(id_token)
