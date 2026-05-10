import os
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials

FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID")
FIREBASE_SERVICE_ACCOUNT_PATH = os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH")


def initialize_firebase_admin() -> bool:
    if not FIREBASE_SERVICE_ACCOUNT_PATH or not os.path.exists(FIREBASE_SERVICE_ACCOUNT_PATH):
        return False
    if firebase_admin._apps:
        return True
    cred = credentials.Certificate(FIREBASE_SERVICE_ACCOUNT_PATH)
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