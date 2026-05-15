from dotenv import load_dotenv
load_dotenv()

import os
import secrets
import bcrypt
import jwt
import socketio
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorClient
import json
try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except ImportError:
    LlmChat = None
    UserMessage = None
from firebase_service import initialize_firebase_admin, firebase_is_ready, verify_firebase_id_token

# --- Config ---
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALGORITHM = "HS256"
FRONTEND_URL = os.environ.get("FRONTEND_URL")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID")
FIREBASE_WEB_API_KEY = os.environ.get("FIREBASE_WEB_API_KEY")

REQUIRED_ENV = {
    "MONGO_URL": MONGO_URL,
    "DB_NAME": DB_NAME,
    "JWT_SECRET": JWT_SECRET,
    "FRONTEND_URL": FRONTEND_URL,
}
missing_env = [key for key, value in REQUIRED_ENV.items() if not value]
if missing_env:
    raise RuntimeError(f"Missing required environment variables: {', '.join(missing_env)}")

DEFAULT_APP_ORIGINS = {
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "capacitor://localhost",
    "ionic://localhost",
    "http://52.66.196.236",
    "https://52.66.196.236",
    "http://quantchat.online",
    "https://quantchat.online",
    "https://www.quantchat.online",
}

allowed_origins = {origin for origin in DEFAULT_APP_ORIGINS if origin}
allowed_origins.add(FRONTEND_URL.rstrip("/"))
allowed_origins_list = sorted(allowed_origins)

# --- App ---
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
fastapi_app = FastAPI(title="QuantChat API")

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# The main ASGI app: socket.io wraps FastAPI
app = socketio.ASGIApp(sio, fastapi_app, socketio_path="/api/ws/socket.io")

# --- DB ---
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# --- Helpers ---
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(minutes=60), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def serialize_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "email": user.get("email", ""),
        "phone_number": user.get("phone_number", ""),
        "name": user.get("name", ""),
        "avatar": user.get("avatar", ""),
        "bio": user.get("bio", ""),
        "role": user.get("role", "user"),
        "online": user.get("online", False),
        "last_seen": user.get("last_seen", "").isoformat() if isinstance(user.get("last_seen"), datetime) else str(user.get("last_seen", "")),
        "created_at": user.get("created_at", "").isoformat() if isinstance(user.get("created_at"), datetime) else str(user.get("created_at", "")),
    }

def serialize_message(msg: dict) -> dict:
    return {
        "id": str(msg["_id"]),
        "conversation_id": str(msg.get("conversation_id", "")),
        "sender_id": str(msg.get("sender_id", "")),
        "content": msg.get("content", ""),
        "type": msg.get("type", "text"),
        "status": msg.get("status", "sent"),
        "reactions": msg.get("reactions", {}),
        "forwarded": msg.get("forwarded", False),
        "is_edited": msg.get("is_edited", False),
        "reply_to": str(msg.get("reply_to", "")) if msg.get("reply_to") else None,
        "reply_to_content": msg.get("reply_to_content"),
        "created_at": msg.get("created_at", "").isoformat() if isinstance(msg.get("created_at"), datetime) else str(msg.get("created_at", "")),
        "expires_at": msg.get("expires_at", "").isoformat() if isinstance(msg.get("expires_at"), datetime) else (str(msg.get("expires_at", "")) if msg.get("expires_at") else None),
    }

def serialize_assistant_message(item: dict) -> dict:
    return {
        "id": str(item["_id"]),
        "session_id": item.get("session_id", ""),
        "conversation_id": item.get("conversation_id"),
        "role": item.get("role", "assistant"),
        "mode": item.get("mode", "general"),
        "content": item.get("content", ""),
        "created_at": item.get("created_at", "").isoformat() if isinstance(item.get("created_at"), datetime) else str(item.get("created_at", "")),
    }

def mask_secret(value: Optional[str]) -> str:
    if not value:
        return ""
    trimmed = value.strip()
    if len(trimmed) <= 8:
        return "•" * len(trimmed)
    return f"{trimmed[:4]}{'•' * (len(trimmed) - 8)}{trimmed[-4:]}"

def serialize_ai_config(config: Optional[dict]) -> dict:
    config = config or {}
    custom_keys = config.get("custom_keys", {})
    return {
        "active_provider": config.get("active_provider", "openai"),
        "active_model": config.get("active_model", "gpt-5.2"),
        "openai_api_key": mask_secret(custom_keys.get("openai")),
        "gemini_api_key": mask_secret(custom_keys.get("gemini")),
        "claude_api_key": mask_secret(custom_keys.get("anthropic") or custom_keys.get("claude")),
        "deepseek_api_key": mask_secret(custom_keys.get("deepseek")),
        "ollama_base_url": config.get("ollama_base_url", ""),
        "ollama_model": config.get("ollama_model", ""),
        "mcp_servers": config.get("mcp_servers", []),
        "supported_live_providers": ["openai", "gemini", "claude"],
    }

def serialize_post(post: dict) -> dict:
    return {
        "id": str(post["_id"]),
        "user_id": post.get("user_id", ""),
        "user_name": post.get("user_name", "Unknown"),
        "user_avatar": post.get("user_avatar", ""),
        "content": post.get("content", ""),
        "media_url": post.get("media_url", ""),
        "visibility": post.get("visibility", "public"),
        "location_label": post.get("location_label", ""),
        "lat": post.get("lat"),
        "lng": post.get("lng"),
        "likes_count": len(post.get("likes", [])),
        "comments_count": len(post.get("comments", [])),
        "audience": post.get("audience", "public"),
        "tags": post.get("tags", []),
        "created_at": post.get("created_at", "").isoformat() if isinstance(post.get("created_at"), datetime) else str(post.get("created_at", "")),
    }

def serialize_conversation(conv: dict, current_user_id: str = None) -> dict:
    participants = conv.get("participants", [])
    other = None
    pinned_message = conv.get("pinned_message")
    pinned_message_id = conv.get("pinned_message_id")
    if not pinned_message_id and pinned_message and pinned_message.get("id"):
        pinned_message_id = pinned_message.get("id")
    if current_user_id and conv.get("type") == "direct":
        for p in participants:
            if str(p.get("user_id", "")) != current_user_id:
                other = p
                break
    return {
        "id": str(conv["_id"]),
        "type": conv.get("type", "direct"),
        "name": conv.get("name", ""),
        "avatar": conv.get("avatar", ""),
        "participants": [{"user_id": str(p.get("user_id", "")), "name": p.get("name", ""), "avatar": p.get("avatar", "")} for p in participants],
        "last_message": conv.get("last_message"),
        "last_message_time": conv.get("last_message_time", "").isoformat() if isinstance(conv.get("last_message_time"), datetime) else str(conv.get("last_message_time", "")),
        "unread_count": conv.get("unread_counts", {}).get(current_user_id, 0) if current_user_id else 0,
        "pinned_message_id": pinned_message_id,
        "other_user": {"user_id": str(other.get("user_id", "")), "name": other.get("name", ""), "avatar": other.get("avatar", "")} if other else None,
        "is_channel": conv.get("is_channel", False),
        "admins": conv.get("admins", []),
        "pinned_message": pinned_message,
        "disappearing_minutes": conv.get("disappearing_minutes", 0),
        "streak_count": conv.get("streak_count", 0),
        "streak_best": conv.get("streak_best", conv.get("streak_count", 0)),
        "is_starred": current_user_id in conv.get("starred_by", []) if current_user_id else False,
        "posting_permission": conv.get("posting_permission", "admins" if conv.get("is_channel") else "members"),
        "approval_required": conv.get("approval_required", False),
        "is_muted": current_user_id in conv.get("muted_by", []) if current_user_id else False,
        "member_count": len(conv.get("participant_ids", [])),
    }

def parse_object_id(value: str, field_name: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}")

async def get_conversation_for_user(conv_id: str, user_id: str) -> dict:
    conv = await db.conversations.find_one({"_id": parse_object_id(conv_id, "conversation_id"), "participant_ids": user_id})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv

def build_pinned_message_snapshot(msg: Optional[dict]) -> Optional[dict]:
    if not msg:
        return None
    return {
        "id": str(msg["_id"]),
        "content": msg.get("content", ""),
        "sender_id": str(msg.get("sender_id", "")),
        "type": msg.get("type", "text"),
        "created_at": msg.get("created_at", "").isoformat() if isinstance(msg.get("created_at"), datetime) else str(msg.get("created_at", "")),
    }

async def refresh_conversation_state(conv_id: str) -> dict:
    conv_oid = parse_object_id(conv_id, "conversation_id")
    conv = await db.conversations.find_one({"_id": conv_oid})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    latest_messages = await db.messages.find({"conversation_id": conv_id}).sort("created_at", -1).limit(1).to_list(1)
    latest = latest_messages[0] if latest_messages else None

    pinned_message_id = conv.get("pinned_message_id")
    pinned_message = None
    if pinned_message_id:
        try:
            pinned_doc = await db.messages.find_one({"_id": ObjectId(pinned_message_id), "conversation_id": conv_id})
        except InvalidId:
            pinned_doc = None
        pinned_message = build_pinned_message_snapshot(pinned_doc)
        if not pinned_message:
            pinned_message_id = None

    updates = {
        "last_message": latest.get("content") if latest else None,
        "last_message_time": latest.get("created_at") if latest else conv.get("created_at", datetime.now(timezone.utc)),
        "pinned_message_id": pinned_message_id,
        "pinned_message": pinned_message,
    }
    await db.conversations.update_one({"_id": conv_oid}, {"$set": updates})
    conv.update(updates)
    return conv

def build_assistant_session_id(user_id: str, conversation_id: Optional[str] = None) -> str:
    return f"assistant:{user_id}:{conversation_id or 'global'}"

async def build_assistant_context(user: dict, conversation_id: Optional[str], mode: str) -> str:
    uid = str(user["_id"])
    if conversation_id:
        conv = await db.conversations.find_one({"_id": parse_object_id(conversation_id, "conversation_id"), "participant_ids": uid})
        if conv:
            participants = ", ".join([p.get("name", "Unknown") for p in conv.get("participants", [])])
            recent_messages = await db.messages.find({"conversation_id": conversation_id}).sort("created_at", -1).limit(14).to_list(14)
            recent_messages.reverse()
            transcript = []
            for message in recent_messages:
                sender_name = next((p.get("name", "Unknown") for p in conv.get("participants", []) if p.get("user_id") == message.get("sender_id")), "Unknown")
                transcript.append(f"{sender_name}: {message.get('content', '')}")
            return (
                f"Mode: {mode}\n"
                f"Conversation: {conv.get('name') or 'Direct chat'}\n"
                f"Participants: {participants or user.get('name', 'Unknown')}\n"
                f"Pinned: {conv.get('pinned_message', {}).get('content', 'None') if isinstance(conv.get('pinned_message'), dict) else 'None'}\n"
                f"Unread for current user: {conv.get('unread_counts', {}).get(uid, 0)}\n"
                "Recent transcript:\n"
                + ("\n".join(transcript) if transcript else "No recent messages yet.")
            )

    convs = await db.conversations.find({"participant_ids": uid}).sort("last_message_time", -1).limit(8).to_list(8)
    inbox_lines = []
    for conv in convs:
        label = conv.get("name") or (next((p.get("name", "Unknown") for p in conv.get("participants", []) if p.get("user_id") != uid), "Unknown"))
        inbox_lines.append(
            f"- {label} | unread={conv.get('unread_counts', {}).get(uid, 0)} | last_message={conv.get('last_message') or 'No messages yet'}"
        )
    return (
        f"Mode: {mode}\n"
        f"User: {user.get('name', 'Unknown')} ({user.get('email', '')})\n"
        "Inbox snapshot:\n"
        + ("\n".join(inbox_lines) if inbox_lines else "No active conversations.")
    )

def build_assistant_suggestions(mode: str, conversation_id: Optional[str]) -> List[str]:
    if conversation_id:
        return [
            "Draft a warm reply for this chat.",
            "Summarize the last messages in 3 bullets.",
            "Suggest a confident but short response.",
        ]
    if mode == "unread_digest":
        return [
            "Which chats need my reply first?",
            "Summarize unread items in one quick digest.",
            "Give me a follow-up plan for today.",
        ]
    return [
        "Help me write a clean intro message.",
        "What should I post in Stories today?",
        "Suggest micro-improvements for my chat flow.",
    ]

def resolve_runtime_provider(config: Optional[dict]) -> tuple[str, str, str]:
    config = config or {}
    active_provider = (config.get("active_provider") or "openai").lower()
    active_model = config.get("active_model")
    custom_keys = config.get("custom_keys", {})

    provider_map = {
        "openai": ("openai", active_model or "gpt-5.2", custom_keys.get("openai") or EMERGENT_LLM_KEY),
        "gemini": ("gemini", active_model or "gemini-3-flash-preview", custom_keys.get("gemini") or EMERGENT_LLM_KEY),
        "claude": ("anthropic", active_model or "claude-sonnet-4-5-20250929", custom_keys.get("anthropic") or custom_keys.get("claude") or EMERGENT_LLM_KEY),
    }
    return provider_map.get(active_provider, provider_map["openai"])

async def run_assistant_response(user: dict, session_id: str, prompt: str, context: str, ai_config: Optional[dict] = None) -> str:
    if LlmChat is None or UserMessage is None:
        raise HTTPException(
            status_code=503,
            detail="AI assistant runtime unavailable on this server",
        )

    provider, model, runtime_key = resolve_runtime_provider(ai_config)
    if not runtime_key:
        raise HTTPException(status_code=503, detail="AI assistant key missing")

    system_message = (
        "You are QuantChat Copilot, a privacy-aware in-app messaging assistant. "
        "Help users summarize chats, draft replies, suggest follow-ups, and plan story/reel posts. "
        "Never claim to auto-send anything. Keep answers concise, structured, and actionable. "
        "Use simple English with a slight Hinglish touch only when natural."
    )
    chat = LlmChat(
        api_key=runtime_key,
        session_id=session_id,
        system_message=system_message,
    ).with_model(provider, model)
    return await chat.send_message(UserMessage(text=f"Context:\n{context}\n\nUser request:\n{prompt}"))

async def purge_expired_messages(conv_id: Optional[str] = None) -> None:
    now = datetime.now(timezone.utc)
    query = {"expires_at": {"$lte": now}}
    if conv_id:
        query["conversation_id"] = conv_id

    expired = await db.messages.find(query).to_list(200)
    if not expired:
        return

    expired_ids = [msg["_id"] for msg in expired]
    affected_conversations = sorted({msg["conversation_id"] for msg in expired})
    await db.messages.delete_many({"_id": {"$in": expired_ids}})
    for affected_conv_id in affected_conversations:
        await refresh_conversation_state(affected_conv_id)

async def deliver_due_scheduled_messages(user_id: Optional[str] = None, conversation_id: Optional[str] = None) -> None:
    now = datetime.now(timezone.utc)
    query = {"status": "scheduled", "deliver_at": {"$lte": now}}
    if user_id:
        query["sender_id"] = user_id
    if conversation_id:
        query["conversation_id"] = conversation_id

    due_items = await db.scheduled_messages.find(query).sort("deliver_at", 1).to_list(50)
    for item in due_items:
        conv = await db.conversations.find_one({"_id": parse_object_id(item["conversation_id"], "conversation_id")})
        if not conv:
            await db.scheduled_messages.update_one({"_id": item["_id"]}, {"$set": {"status": "cancelled"}})
            continue
        msg = {
            "conversation_id": item["conversation_id"],
            "sender_id": item["sender_id"],
            "content": item["content"],
            "type": item.get("type", "text"),
            "status": "sent",
            "reply_to": item.get("reply_to"),
            "reply_to_content": item.get("reply_to_content"),
            "created_at": now,
        }
        if conv.get("disappearing_minutes", 0) > 0:
            msg["expires_at"] = now + timedelta(minutes=conv["disappearing_minutes"])
        result = await db.messages.insert_one(msg)
        msg["_id"] = result.inserted_id
        unread_inc = {f"unread_counts.{pid}": 1 for pid in conv.get("participant_ids", []) if pid != item["sender_id"]}
        await db.conversations.update_one(
            {"_id": conv["_id"]},
            {"$set": {"last_message": item["content"], "last_message_time": now}, "$inc": unread_inc}
        )
        await db.scheduled_messages.update_one({"_id": item["_id"]}, {"$set": {"status": "sent", "delivered_message_id": str(result.inserted_id), "delivered_at": now}})
        serialized = serialize_message(msg)
        for pid in conv.get("participant_ids", []):
            await sio.emit("new_message", {"message": serialized, "conversation_id": item["conversation_id"]}, room=f"user_{pid}")

def compute_streak_day_key(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).date().isoformat()

def next_streak_value(previous_day_key: Optional[str], current_day_key: str, current_streak: int) -> int:
    if not previous_day_key:
        return 1
    previous_day = datetime.fromisoformat(previous_day_key).date()
    current_day = datetime.fromisoformat(current_day_key).date()
    delta_days = (current_day - previous_day).days
    if delta_days <= 0:
        return max(current_streak, 1)
    if delta_days == 1:
        return max(current_streak, 1) + 1
    return 1

async def update_conversation_streak(conv: dict, event_time: datetime) -> None:
    current_day_key = compute_streak_day_key(event_time)
    next_streak = next_streak_value(conv.get("streak_last_day"), current_day_key, conv.get("streak_count", 0))
    best_streak = max(conv.get("streak_best", 0), next_streak)
    await db.conversations.update_one(
        {"_id": conv["_id"]},
        {"$set": {"streak_last_day": current_day_key, "streak_count": next_streak, "streak_best": best_streak}}
    )
    conv["streak_last_day"] = current_day_key
    conv["streak_count"] = next_streak
    conv["streak_best"] = best_streak

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# --- Pydantic Models ---
class RegisterBody(BaseModel):
    name: str
    email: str
    password: str

class LoginBody(BaseModel):
    email: str
    password: str

class MessageBody(BaseModel):
    content: str
    type: str = "text"
    reply_to: Optional[str] = None

class CreateConversationBody(BaseModel):
    participant_id: str
    type: str = "direct"

class CreateGroupBody(BaseModel):
    name: str
    participant_ids: List[str]
    is_channel: bool = False
    posting_permission: str = "admins"
    approval_required: bool = False

class UpdateProfileBody(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    avatar: Optional[str] = None

class PinMessageBody(BaseModel):
    message_id: Optional[str] = None

class StoryBody(BaseModel):
    content: str
    type: str = "text"
    caption: Optional[str] = None
    audience: str = "friends"
    location_label: Optional[str] = None
    tags: List[str] = []
class EditMessageBody(BaseModel):
    content: str


class ReelBody(BaseModel):
    media_url: str
    caption: str = ""
    audience: str = "public"
    location_label: Optional[str] = None
    tags: List[str] = []

class CommentBody(BaseModel):
    text: str

class DisappearingMessagesBody(BaseModel):
    minutes: int = 0

class AssistantBody(BaseModel):
    prompt: str
    mode: str = "general"
    conversation_id: Optional[str] = None

class MCPServerItem(BaseModel):
    name: str
    url: str
    enabled: bool = True

class AIConfigBody(BaseModel):
    active_provider: str = "openai"
    active_model: str = "gpt-5.2"
    openai_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    claude_api_key: Optional[str] = None
    deepseek_api_key: Optional[str] = None
    ollama_base_url: Optional[str] = None
    ollama_model: Optional[str] = None
    mcp_servers: List[MCPServerItem] = []

class FeedPostBody(BaseModel):
    content: str
    media_url: Optional[str] = None
    visibility: str = "public"
    location_label: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    audience: str = "public"
    tags: List[str] = []
    schedule_minutes: int = 0

class PhoneOTPRequestBody(BaseModel):
    phone_number: str
    purpose: str = "login"

class PhoneOTPVerifyBody(BaseModel):
    phone_number: str
    code: str
    purpose: str = "login"
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None

class ScheduleMessageBody(BaseModel):
    content: str
    delay_minutes: int = 5
    type: str = "text"
    reply_to: Optional[str] = None

class FirebaseExchangeBody(BaseModel):
    id_token: str
    purpose: str = "login"
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None

class ChannelSettingsBody(BaseModel):
    posting_permission: str = "admins"
    approval_required: bool = False
    member_approval_required: bool = False

class ChannelPublishBody(BaseModel):
    content: str
    media_url: Optional[str] = None
    audience: str = "subscribers"
    tags: List[str] = []
    location_label: Optional[str] = None
    publish_mode: str = "instant"
    schedule_minutes: int = 0

class ChannelDraftBody(BaseModel):
    content: str
    media_url: Optional[str] = None
    audience: str = "subscribers"
    tags: List[str] = []
    location_label: Optional[str] = None

class BroadcastListBody(BaseModel):
    name: str
    participant_ids: List[str]

class BroadcastSendBody(BaseModel):
    content: str
    type: str = "text"

# --- Startup ---
@fastapi_app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.messages.create_index("conversation_id")
    await db.messages.create_index("expires_at", expireAfterSeconds=0)
    await db.conversations.create_index("participant_ids")
    await db.stories.create_index("created_at", expireAfterSeconds=86400)
    await db.reels.create_index("created_at")
    await db.assistant_messages.create_index([("user_id", 1), ("session_id", 1), ("created_at", -1)])
    await db.ai_configs.create_index("user_id", unique=True)
    await db.posts.create_index([("visibility", 1), ("created_at", -1)])
    await db.phone_otps.create_index("expires_at", expireAfterSeconds=0)
    await db.saved_messages.create_index([("user_id", 1), ("saved_at", -1)])
    await db.scheduled_messages.create_index([("status", 1), ("deliver_at", 1)])
    await db.channel_drafts.create_index([("channel_id", 1), ("created_at", -1)])
    await db.broadcast_lists.create_index([("owner_id", 1), ("created_at", -1)])
    initialize_firebase_admin()
    await seed_admin()
    await seed_demo_users()
    await seed_demo_content()
    await seed_public_posts()

async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@quantchat.com")
    admin_password = os.environ.get("ADMIN_PASSWORD")
    if not admin_password:
        raise RuntimeError("ADMIN_PASSWORD environment variable is required")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "role": "admin",
            "avatar": "",
            "bio": "System Administrator",
            "online": False,
            "last_seen": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
        })
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

DEMO_USERS = [
    {"name": "Arjun Mehta", "email": "arjun@quantchat.com", "avatar": "https://images.unsplash.com/photo-1576558656222-ba66febe3dec?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwzfHxwcm9mZXNzaW9uYWwlMjBoZWFkc2hvdCUyMHBvcnRyYWl0fGVufDB8fHx8MTc3ODI5MDg3MXww&ixlib=rb-4.1.0&q=85&w=200&h=200", "bio": "Full-stack developer | Coffee enthusiast"},
    {"name": "Priya Singh", "email": "priya@quantchat.com", "avatar": "https://images.unsplash.com/photo-1769636929388-99eff95d3bf1?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwyfHxwcm9mZXNzaW9uYWwlMjBoZWFkc2hvdCUyMHBvcnRyYWl0fGVufDB8fHx8MTc3ODI5MDg3MXww&ixlib=rb-4.1.0&q=85&w=200&h=200", "bio": "UX Designer | Creative mind"},
    {"name": "Rahul Kumar", "email": "rahul@quantchat.com", "avatar": "https://images.unsplash.com/photo-1762522926157-bcc04bf0b10a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBoZWFkc2hvdCUyMHBvcnRyYWl0fGVufDB8fHx8MTc3ODI5MDg3MXww&ixlib=rb-4.1.0&q=85&w=200&h=200", "bio": "Backend engineer | Open source lover"},
    {"name": "Neha Sharma", "email": "neha@quantchat.com", "avatar": "https://images.unsplash.com/photo-1655249493799-9cee4fe983bb?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHw0fHxwcm9mZXNzaW9uYWwlMjBoZWFkc2hvdCUyMHBvcnRyYWl0fGVufDB8fHx8MTc3ODI5MDg3MXww&ixlib=rb-4.1.0&q=85&w=200&h=200", "bio": "Product Manager | Startup enthusiast"},
]

async def seed_demo_users():
    for u in DEMO_USERS:
        existing = await db.users.find_one({"email": u["email"]})
        if not existing:
            await db.users.insert_one({
                "email": u["email"],
                "password_hash": hash_password("Demo@1234"),
                "name": u["name"],
                "role": "user",
                "avatar": u["avatar"],
                "bio": u["bio"],
                "online": False,
                "last_seen": datetime.now(timezone.utc),
                "created_at": datetime.now(timezone.utc),
            })

async def seed_demo_content():
    if await db.conversations.count_documents({}) > 0:
        return

    seeded_users = await db.users.find({"email": {"$in": ["arjun@quantchat.com", "priya@quantchat.com", "rahul@quantchat.com", "neha@quantchat.com"]}}).to_list(10)
    user_map = {user["email"]: user for user in seeded_users}
    required_emails = {"arjun@quantchat.com", "priya@quantchat.com", "rahul@quantchat.com", "neha@quantchat.com"}
    if not required_emails.issubset(set(user_map.keys())):
        return

    now = datetime.now(timezone.utc)
    arjun = user_map["arjun@quantchat.com"]
    priya = user_map["priya@quantchat.com"]
    rahul = user_map["rahul@quantchat.com"]
    neha = user_map["neha@quantchat.com"]

    conversation_specs = [
        {
            "type": "direct",
            "participant_ids": [str(arjun["_id"]), str(priya["_id"])],
            "participants": [
                {"user_id": str(arjun["_id"]), "name": arjun.get("name", ""), "avatar": arjun.get("avatar", "")},
                {"user_id": str(priya["_id"]), "name": priya.get("name", ""), "avatar": priya.get("avatar", "")},
            ],
            "last_message": "Deck looks clean. Ready for a final mobile pass.",
            "last_message_time": now - timedelta(minutes=6),
            "unread_counts": {str(arjun["_id"]): 1, str(priya["_id"]): 0},
            "created_at": now - timedelta(hours=4),
            "streak_count": 4,
            "streak_best": 6,
            "streak_last_day": compute_streak_day_key(now),
        },
        {
            "type": "direct",
            "participant_ids": [str(arjun["_id"]), str(rahul["_id"])],
            "participants": [
                {"user_id": str(arjun["_id"]), "name": arjun.get("name", ""), "avatar": arjun.get("avatar", "")},
                {"user_id": str(rahul["_id"]), "name": rahul.get("name", ""), "avatar": rahul.get("avatar", "")},
            ],
            "last_message": "Voice note works. Let's polish the assistant prompt next.",
            "last_message_time": now - timedelta(minutes=17),
            "unread_counts": {str(arjun["_id"]): 0, str(rahul["_id"]): 0},
            "created_at": now - timedelta(hours=6),
            "streak_count": 2,
            "streak_best": 3,
            "streak_last_day": compute_streak_day_key(now),
        },
        {
            "type": "group",
            "name": "Launch Room",
            "avatar": "",
            "participant_ids": [str(arjun["_id"]), str(priya["_id"]), str(neha["_id"])],
            "participants": [
                {"user_id": str(arjun["_id"]), "name": arjun.get("name", ""), "avatar": arjun.get("avatar", "")},
                {"user_id": str(priya["_id"]), "name": priya.get("name", ""), "avatar": priya.get("avatar", "")},
                {"user_id": str(neha["_id"]), "name": neha.get("name", ""), "avatar": neha.get("avatar", "")},
            ],
            "is_channel": False,
            "admins": [str(arjun["_id"])],
            "last_message": "Tomorrow morning we push the refreshed build.",
            "last_message_time": now - timedelta(minutes=28),
            "unread_counts": {str(arjun["_id"]): 2, str(priya["_id"]): 0, str(neha["_id"]): 0},
            "created_at": now - timedelta(hours=7),
            "streak_count": 5,
            "streak_best": 7,
            "streak_last_day": compute_streak_day_key(now),
        },
    ]

    inserted = await db.conversations.insert_many(conversation_specs)
    conversation_ids = [str(conv_id) for conv_id in inserted.inserted_ids]

    demo_messages = [
        {"conversation_id": conversation_ids[0], "sender_id": str(priya["_id"]), "content": "Mobile spacing looks way better now.", "type": "text", "status": "read", "created_at": now - timedelta(minutes=22)},
        {"conversation_id": conversation_ids[0], "sender_id": str(arjun["_id"]), "content": "Good. I also added the AI copilot sheet.", "type": "text", "status": "read", "created_at": now - timedelta(minutes=14)},
        {"conversation_id": conversation_ids[0], "sender_id": str(priya["_id"]), "content": "Deck looks clean. Ready for a final mobile pass.", "type": "text", "status": "sent", "created_at": now - timedelta(minutes=6)},
        {"conversation_id": conversation_ids[1], "sender_id": str(rahul["_id"]), "content": "Audio notes and disappearing timers are stable.", "type": "text", "status": "read", "created_at": now - timedelta(minutes=35)},
        {"conversation_id": conversation_ids[1], "sender_id": str(arjun["_id"]), "content": "Voice note works. Let's polish the assistant prompt next.", "type": "text", "status": "sent", "created_at": now - timedelta(minutes=17)},
        {"conversation_id": conversation_ids[2], "sender_id": str(neha["_id"]), "content": "Need launch copy for spotlight and onboarding.", "type": "text", "status": "read", "created_at": now - timedelta(minutes=48)},
        {"conversation_id": conversation_ids[2], "sender_id": str(arjun["_id"]), "content": "I'll update the shell and write the deployment guide today.", "type": "text", "status": "read", "created_at": now - timedelta(minutes=36)},
        {"conversation_id": conversation_ids[2], "sender_id": str(priya["_id"]), "content": "Tomorrow morning we push the refreshed build.", "type": "text", "status": "sent", "created_at": now - timedelta(minutes=28)},
    ]
    await db.messages.insert_many(demo_messages)

    if await db.stories.count_documents({}) == 0:
        await db.stories.insert_many([
            {"user_id": str(arjun["_id"]), "user_name": arjun.get("name", ""), "user_avatar": arjun.get("avatar", ""), "content": json.dumps({"text": "Ship mode on. Final mobile polish today.", "bg": "#111827"}), "type": "text", "created_at": now - timedelta(hours=1)},
            {"user_id": str(priya["_id"]), "user_name": priya.get("name", ""), "user_avatar": priya.get("avatar", ""), "content": json.dumps({"text": "Palette locked. Micro-interactions feel premium now.", "bg": "#7C3AED"}), "type": "text", "created_at": now - timedelta(hours=2)},
            {"user_id": str(neha["_id"]), "user_name": neha.get("name", ""), "user_avatar": neha.get("avatar", ""), "content": json.dumps({"text": "Launch checklist: auth, feeds, assistant, deployment notes.", "bg": "#EA580C"}), "type": "text", "created_at": now - timedelta(hours=3)},
        ])

    if await db.reels.count_documents({}) == 0:
        await db.reels.insert_many([
            {"user_id": str(priya["_id"]), "user_name": priya.get("name", ""), "user_avatar": priya.get("avatar", ""), "media_url": "https://images.unsplash.com/photo-1653104877761-181b3977808e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzV8MHwxfHNlYXJjaHwyfHxhYnN0cmFjdCUyMGRhcmslMjB0ZXh0dXJlJTIwYmFja2dyb3VuZHxlbnwwfHx8YmxhY2t8MTc3ODQyNTEyMnww&ixlib=rb-4.1.0&q=85", "caption": "Late-night product textures for the refreshed shell.", "likes": [str(arjun["_id"]), str(neha["_id"])], "comments": [], "created_at": now - timedelta(hours=5)},
            {"user_id": str(rahul["_id"]), "user_name": rahul.get("name", ""), "user_avatar": rahul.get("avatar", ""), "media_url": "https://images.unsplash.com/photo-1581084349663-7ab88c58d362?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzV8MHwxfHNlYXJjaHwzfHxhYnN0cmFjdCUyMGRhcmslMjB0ZXh0dXJlJTIwYmFja2dyb3VuZHxlbnwwfHx8YmxhY2t8MTc3ODQyNTEyMnww&ixlib=rb-4.1.0&q=85", "caption": "Infra check complete. Server lane is feeling much cleaner.", "likes": [str(priya["_id"])], "comments": [], "created_at": now - timedelta(hours=7)},
        ])


async def seed_public_posts():
    if await db.posts.count_documents({}) > 0:
        return

    seeded_users = await db.users.find({"email": {"$in": ["arjun@quantchat.com", "priya@quantchat.com", "neha@quantchat.com"]}}).to_list(10)
    user_map = {user["email"]: user for user in seeded_users}
    if not {"arjun@quantchat.com", "priya@quantchat.com", "neha@quantchat.com"}.issubset(set(user_map.keys())):
        return

    now = datetime.now(timezone.utc)
    arjun = user_map["arjun@quantchat.com"]
    priya = user_map["priya@quantchat.com"]
    neha = user_map["neha@quantchat.com"]

    await db.posts.insert_many([
        {
            "user_id": str(priya["_id"]),
            "user_name": priya.get("name", ""),
            "user_avatar": priya.get("avatar", ""),
            "content": "Dropped a compact story rail and futuristic shell. Feed finally feels like a real super app lane.",
            "media_url": "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzV8MHwxfHNlYXJjaHwyfHxuZW9uJTIwbW9iaWxlJTIwYXBwfGVufDB8fHxibGFja3wxNzc4NDI2NDU0fDA&ixlib=rb-4.1.0&q=85",
            "visibility": "public",
            "location_label": "Bengaluru Studio",
            "lat": 12.9716,
            "lng": 77.5946,
            "likes": [str(arjun["_id"]), str(neha["_id"])],
            "comments": [],
            "created_at": now - timedelta(minutes=42),
        },
        {
            "user_id": str(arjun["_id"]),
            "user_name": arjun.get("name", ""),
            "user_avatar": arjun.get("avatar", ""),
            "content": "QuantChat Copilot can now summarize inbox, draft replies, and sit inside the main social shell.",
            "media_url": "",
            "visibility": "public",
            "location_label": "Mumbai Build Lane",
            "lat": 19.076,
            "lng": 72.8777,
            "likes": [str(priya["_id"])],
            "comments": [],
            "created_at": now - timedelta(minutes=19),
        },
        {
            "user_id": str(neha["_id"]),
            "user_name": neha.get("name", ""),
            "user_avatar": neha.get("avatar", ""),
            "content": "Snap map style check-in: team is live across launch locations today.",
            "media_url": "https://images.unsplash.com/photo-1558655146-d09347e92766?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzV8MHwxfHNlYXJjaHwxfHxmZXR1cmlzdGljJTIwbmVvbiUyMGNpdHl8ZW58MHx8fGJsYWNrfDE3Nzg0MjY0Nzh8MA&ixlib=rb-4.1.0&q=85",
            "visibility": "public",
            "location_label": "Delhi Launch Pod",
            "lat": 28.6139,
            "lng": 77.209,
            "likes": [str(arjun["_id"]), str(priya["_id"])],
            "comments": [],
            "created_at": now - timedelta(minutes=7),
        },
    ])

# --- Auth Routes ---
@fastapi_app.post("/api/auth/register")
async def register(body: RegisterBody, response: Response):
    email = body.email.strip().lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    result = await db.users.insert_one({
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name.strip(),
        "role": "user",
        "avatar": "",
        "bio": "",
        "online": False,
        "last_seen": datetime.now(timezone.utc),
        "created_at": datetime.now(timezone.utc),
    })
    user_id = str(result.inserted_id)
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    user = await db.users.find_one({"_id": result.inserted_id})
    return {"user": serialize_user(user), "token": access_token}

@fastapi_app.post("/api/auth/login")
async def login(body: LoginBody, request: Request, response: Response):
    email = body.email.strip().lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5:
        lockout_until = attempt.get("locked_until")
        if lockout_until and datetime.now(timezone.utc) < lockout_until:
            raise HTTPException(status_code=429, detail="Too many login attempts. Try again in 15 minutes.")
        else:
            await db.login_attempts.delete_one({"identifier": identifier})
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"locked_until": datetime.now(timezone.utc) + timedelta(minutes=15)}},
            upsert=True
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.login_attempts.delete_one({"identifier": identifier})
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    return {"user": serialize_user(user), "token": access_token}

@fastapi_app.post("/api/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}

@fastapi_app.post("/api/auth/phone/request")
async def request_phone_otp(body: PhoneOTPRequestBody):
    phone_number = body.phone_number.strip()
    if len(phone_number) < 8:
        raise HTTPException(status_code=400, detail="Valid phone number required")
    code = f"{secrets.randbelow(900000) + 100000}"
    await db.phone_otps.insert_one({
        "phone_number": phone_number,
        "purpose": body.purpose,
        "code": code,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
        "created_at": datetime.now(timezone.utc),
        "provider": "firebase-demo-structure",
    })
    return {"status": "otp_requested", "firebase_ready": False, "expires_in": 300}

@fastapi_app.post("/api/auth/phone/verify")
async def verify_phone_otp(body: PhoneOTPVerifyBody, response: Response):
    phone_number = body.phone_number.strip()
    otp = await db.phone_otps.find_one({"phone_number": phone_number, "purpose": body.purpose, "code": body.code})
    if not otp:
        raise HTTPException(status_code=400, detail="Invalid OTP code")

    user = await db.users.find_one({"phone_number": phone_number})
    if body.purpose == "signup":
        if not body.email or not body.password or not body.name:
            raise HTTPException(status_code=400, detail="Name, email, and password required for signup")
        if user:
            raise HTTPException(status_code=400, detail="Phone already linked")
        existing_email = await db.users.find_one({"email": body.email.strip().lower()})
        if existing_email:
            raise HTTPException(status_code=400, detail="Email already registered")
        result = await db.users.insert_one({
            "email": body.email.strip().lower(),
            "password_hash": hash_password(body.password),
            "name": body.name.strip(),
            "phone_number": phone_number,
            "role": "user",
            "avatar": "",
            "bio": "",
            "online": False,
            "last_seen": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
        })
        user = await db.users.find_one({"_id": result.inserted_id})
    elif body.purpose == "link":
        if not body.email or not body.password:
            raise HTTPException(status_code=400, detail="Existing account email and password required")
        user = await db.users.find_one({"email": body.email.strip().lower()})
        if not user or not verify_password(body.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid account credentials")
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"phone_number": phone_number}})
        user = await db.users.find_one({"_id": user["_id"]})
    else:
        if not user:
            raise HTTPException(status_code=404, detail="Phone number not linked to any account yet")

    await db.phone_otps.delete_many({"phone_number": phone_number})
    access_token = create_access_token(str(user["_id"]), user["email"])
    refresh_token = create_refresh_token(str(user["_id"]))
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    return {"user": serialize_user(user), "token": access_token, "firebase_ready": False}

@fastapi_app.get("/api/auth/firebase/status")
async def firebase_status():
    return {
        "firebase_ready": firebase_is_ready(),
        "project_id": FIREBASE_PROJECT_ID,
    }

@fastapi_app.post("/api/auth/firebase/exchange")
async def firebase_exchange(body: FirebaseExchangeBody, response: Response):
    if not firebase_is_ready():
        initialize_firebase_admin()
    if not firebase_is_ready():
        raise HTTPException(status_code=503, detail="Firebase Admin SDK not configured")

    try:
        decoded = verify_firebase_id_token(body.id_token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Invalid Firebase token: {exc}")

    phone_number = decoded.get("phone_number") or decoded.get("phoneNumber")
    firebase_uid = decoded.get("uid")
    if not phone_number or not firebase_uid:
        raise HTTPException(status_code=400, detail="Firebase phone identity missing")

    user = await db.users.find_one({"firebase_uid": firebase_uid}) or await db.users.find_one({"phone_number": phone_number})
    purpose = body.purpose.strip().lower()

    if purpose == "signup":
        if user:
            raise HTTPException(status_code=400, detail="Phone already linked")
        if not body.email or not body.password or not body.name:
            raise HTTPException(status_code=400, detail="Name, email, and password required for signup")
        existing_email = await db.users.find_one({"email": body.email.strip().lower()})
        if existing_email:
            raise HTTPException(status_code=400, detail="Email already registered")
        result = await db.users.insert_one({
            "email": body.email.strip().lower(),
            "password_hash": hash_password(body.password),
            "name": body.name.strip(),
            "phone_number": phone_number,
            "firebase_uid": firebase_uid,
            "auth_provider": "firebase_phone",
            "role": "user",
            "avatar": "",
            "bio": "",
            "online": False,
            "last_seen": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
        })
        user = await db.users.find_one({"_id": result.inserted_id})
    elif purpose == "link":
        if not body.email or not body.password:
            raise HTTPException(status_code=400, detail="Existing account email and password required")
        user = await db.users.find_one({"email": body.email.strip().lower()})
        if not user or not verify_password(body.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid account credentials")
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"phone_number": phone_number, "firebase_uid": firebase_uid, "auth_provider": "firebase_phone"}})
        user = await db.users.find_one({"_id": user["_id"]})
    elif purpose == "recovery":
        if not user:
            raise HTTPException(status_code=404, detail="Phone number not linked to any account yet")
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"firebase_uid": firebase_uid, "auth_provider": "firebase_phone"}})
        user = await db.users.find_one({"_id": user["_id"]})
    else:
        if not user:
            raise HTTPException(status_code=404, detail="Phone number not linked to any account yet")
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"firebase_uid": firebase_uid, "auth_provider": "firebase_phone"}})
        user = await db.users.find_one({"_id": user["_id"]})

    access_token = create_access_token(str(user["_id"]), user["email"])
    refresh_token = create_refresh_token(str(user["_id"]))
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    return {"user": serialize_user(user), "token": access_token, "firebase_ready": True}

@fastapi_app.get("/api/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return {"user": serialize_user(user)}

@fastapi_app.post("/api/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        access_token = create_access_token(str(user["_id"]), user["email"])
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
        return {"user": serialize_user(user), "token": access_token}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

# --- User Routes ---
@fastapi_app.get("/api/users/search")
async def search_users(request: Request, q: str = ""):
    user = await get_current_user(request)
    query = {"_id": {"$ne": user["_id"]}}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
        ]
    users = await db.users.find(query).limit(20).to_list(20)
    return {"users": [serialize_user(u) for u in users]}

@fastapi_app.get("/api/users/{user_id}")
async def get_user(user_id: str, request: Request):
    await get_current_user(request)
    user = await db.users.find_one({"_id": parse_object_id(user_id, "user_id")})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user": serialize_user(user)}

@fastapi_app.patch("/api/users/profile")
async def update_profile(body: UpdateProfileBody, request: Request):
    user = await get_current_user(request)
    updates = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.bio is not None:
        updates["bio"] = body.bio.strip()
    if body.avatar is not None:
        updates["avatar"] = body.avatar.strip()
    if updates:
        await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
        # Update name in all conversations
        if "name" in updates or "avatar" in updates:
            uid = str(user["_id"])
            convs = await db.conversations.find({"participants.user_id": uid}).to_list(100)
            for conv in convs:
                new_participants = []
                for p in conv.get("participants", []):
                    if p["user_id"] == uid:
                        p["name"] = updates.get("name", p.get("name", ""))
                        p["avatar"] = updates.get("avatar", p.get("avatar", ""))
                    new_participants.append(p)
                await db.conversations.update_one({"_id": conv["_id"]}, {"$set": {"participants": new_participants}})
    updated = await db.users.find_one({"_id": user["_id"]})
    return {"user": serialize_user(updated)}

# --- Conversation Routes ---
@fastapi_app.get("/api/conversations")
async def get_conversations(request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    await deliver_due_scheduled_messages(uid)
    await purge_expired_messages()
    convs = await db.conversations.find({"participant_ids": uid}).sort("last_message_time", -1).to_list(50)
    return {"conversations": [serialize_conversation(c, uid) for c in convs]}

@fastapi_app.post("/api/conversations")
async def create_conversation(body: CreateConversationBody, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    other = await db.users.find_one({"_id": parse_object_id(body.participant_id, "participant_id")})
    if not other:
        raise HTTPException(status_code=404, detail="User not found")
    other_id = str(other["_id"])
    # Check existing direct conversation
    existing = await db.conversations.find_one({
        "type": "direct",
        "participant_ids": {"$all": [uid, other_id]},
    })
    if existing:
        return {"conversation": serialize_conversation(existing, uid)}
    conv = {
        "type": "direct",
        "name": "",
        "avatar": "",
        "participant_ids": [uid, other_id],
        "participants": [
            {"user_id": uid, "name": user.get("name", ""), "avatar": user.get("avatar", "")},
            {"user_id": other_id, "name": other.get("name", ""), "avatar": other.get("avatar", "")},
        ],
        "last_message": None,
        "last_message_time": datetime.now(timezone.utc),
        "unread_counts": {uid: 0, other_id: 0},
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.conversations.insert_one(conv)
    conv["_id"] = result.inserted_id
    return {"conversation": serialize_conversation(conv, uid)}

@fastapi_app.post("/api/conversations/group")
async def create_group(body: CreateGroupBody, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    participant_ids = list(set([uid] + body.participant_ids))
    participants = []
    for pid in participant_ids:
        u = await db.users.find_one({"_id": parse_object_id(pid, "participant_id")})
        if u:
            participants.append({"user_id": str(u["_id"]), "name": u.get("name", ""), "avatar": u.get("avatar", "")})
    conv = {
        "type": "group",
        "name": body.name,
        "avatar": "",
        "participant_ids": participant_ids,
        "participants": participants,
        "is_channel": body.is_channel,
        "admins": [uid],
        "posting_permission": body.posting_permission,
        "approval_required": body.approval_required,
        "member_approval_required": body.approval_required,
        "muted_by": [],
        "last_message": None,
        "last_message_time": datetime.now(timezone.utc),
        "unread_counts": {pid: 0 for pid in participant_ids},
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.conversations.insert_one(conv)
    conv["_id"] = result.inserted_id
    return {"conversation": serialize_conversation(conv, uid)}

@fastapi_app.get("/api/channels")
async def get_channels(request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    channels = await db.conversations.find({"is_channel": True, "participant_ids": uid}).sort("last_message_time", -1).to_list(50)
    return {"channels": [serialize_conversation(channel, uid) for channel in channels]}

@fastapi_app.post("/api/channels")
async def create_channel(body: CreateGroupBody, request: Request):
    return await create_group(CreateGroupBody(name=body.name, participant_ids=body.participant_ids, is_channel=True, posting_permission=body.posting_permission, approval_required=body.approval_required), request)

@fastapi_app.put("/api/channels/{channel_id}/settings")
async def update_channel_settings(channel_id: str, body: ChannelSettingsBody, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    channel = await get_conversation_for_user(channel_id, uid)
    if not channel.get("is_channel"):
        raise HTTPException(status_code=400, detail="Not a channel")
    if uid not in channel.get("admins", []):
        raise HTTPException(status_code=403, detail="Only admins can update channel settings")
    await db.conversations.update_one(
        {"_id": parse_object_id(channel_id, "channel_id")},
        {"$set": {
            "posting_permission": body.posting_permission,
            "approval_required": body.approval_required,
            "member_approval_required": body.member_approval_required,
        }}
    )
    updated = await db.conversations.find_one({"_id": parse_object_id(channel_id, "channel_id")})
    return {"channel": serialize_conversation(updated, uid)}

@fastapi_app.post("/api/channels/{channel_id}/mute")
async def toggle_channel_mute(channel_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    channel = await get_conversation_for_user(channel_id, uid)
    if not channel.get("is_channel"):
        raise HTTPException(status_code=400, detail="Not a channel")
    is_muted = uid not in channel.get("muted_by", [])
    update = {"$addToSet": {"muted_by": uid}} if is_muted else {"$pull": {"muted_by": uid}}
    await db.conversations.update_one({"_id": parse_object_id(channel_id, "channel_id")}, update)
    return {"is_muted": is_muted}

@fastapi_app.get("/api/channels/{channel_id}/drafts")
async def get_channel_drafts(channel_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    channel = await get_conversation_for_user(channel_id, uid)
    if uid not in channel.get("admins", []):
        raise HTTPException(status_code=403, detail="Only admins can view drafts")
    drafts = await db.channel_drafts.find({"channel_id": channel_id}).sort("created_at", -1).to_list(50)
    return {"drafts": [{"id": str(draft["_id"]), "content": draft.get("content", ""), "media_url": draft.get("media_url", ""), "audience": draft.get("audience", "subscribers"), "tags": draft.get("tags", []), "location_label": draft.get("location_label", ""), "created_at": draft.get("created_at", "").isoformat() if isinstance(draft.get("created_at"), datetime) else str(draft.get("created_at", ""))} for draft in drafts]}

@fastapi_app.post("/api/channels/{channel_id}/drafts")
async def create_channel_draft(channel_id: str, body: ChannelDraftBody, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    channel = await get_conversation_for_user(channel_id, uid)
    if uid not in channel.get("admins", []):
        raise HTTPException(status_code=403, detail="Only admins can save drafts")
    draft = {
        "channel_id": channel_id,
        "owner_id": uid,
        "content": body.content.strip(),
        "media_url": (body.media_url or "").strip(),
        "audience": body.audience,
        "tags": body.tags,
        "location_label": (body.location_label or "").strip(),
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.channel_drafts.insert_one(draft)
    return {"draft": {"id": str(result.inserted_id), "content": draft["content"]}}

@fastapi_app.post("/api/channels/{channel_id}/publish")
async def publish_channel_post(channel_id: str, body: ChannelPublishBody, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    channel = await get_conversation_for_user(channel_id, uid)
    if not channel.get("is_channel"):
        raise HTTPException(status_code=400, detail="Not a channel")
    if uid not in channel.get("admins", []):
        raise HTTPException(status_code=403, detail="Only admins can publish in channels")

    content = body.content.strip()
    media_url = (body.media_url or "").strip()
    combined_content = content if not media_url else f"{content}\n{media_url}".strip()
    if body.publish_mode == "draft":
        return await create_channel_draft(channel_id, ChannelDraftBody(content=content, media_url=media_url, audience=body.audience, tags=body.tags, location_label=body.location_label), request)
    if body.publish_mode == "scheduled":
        delay = max(1, min(body.schedule_minutes, 7 * 24 * 60))
        result = await db.scheduled_messages.insert_one({
            "conversation_id": channel_id,
            "sender_id": uid,
            "content": combined_content,
            "type": "channel_post",
            "reply_to": None,
            "reply_to_content": None,
            "deliver_at": datetime.now(timezone.utc) + timedelta(minutes=delay),
            "status": "scheduled",
            "created_at": datetime.now(timezone.utc),
        })
        return {"scheduled_post": {"id": str(result.inserted_id), "deliver_in_minutes": delay}}
    return await send_message(channel_id, MessageBody(content=combined_content, type="channel_post"), request)

@fastapi_app.get("/api/broadcast-lists")
async def get_broadcast_lists(request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    lists = await db.broadcast_lists.find({"owner_id": uid}).sort("created_at", -1).to_list(50)
    return {"broadcast_lists": [{"id": str(item["_id"]), "name": item.get("name", ""), "participant_ids": item.get("participant_ids", []), "created_at": item.get("created_at", "").isoformat() if isinstance(item.get("created_at"), datetime) else str(item.get("created_at", ""))} for item in lists]}

@fastapi_app.post("/api/broadcast-lists")
async def create_broadcast_list(body: BroadcastListBody, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    payload = {
        "owner_id": uid,
        "name": body.name.strip(),
        "participant_ids": list(dict.fromkeys(body.participant_ids)),
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.broadcast_lists.insert_one(payload)
    return {"broadcast_list": {"id": str(result.inserted_id), "name": payload["name"], "participant_ids": payload["participant_ids"]}}

@fastapi_app.post("/api/broadcast-lists/{broadcast_id}/send")
async def send_broadcast_message(broadcast_id: str, body: BroadcastSendBody, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    broadcast = await db.broadcast_lists.find_one({"_id": parse_object_id(broadcast_id, "broadcast_id"), "owner_id": uid})
    if not broadcast:
        raise HTTPException(status_code=404, detail="Broadcast list not found")
    sent = []
    for participant_id in broadcast.get("participant_ids", []):
        existing = await db.conversations.find_one({
            "type": "direct",
            "participant_ids": {"$all": [uid, participant_id], "$size": 2},
        })
        if not existing:
            direct = {
                "type": "direct",
                "participant_ids": [uid, participant_id],
                "participants": [
                    {"user_id": uid, "name": user.get("name", ""), "avatar": user.get("avatar", "")},
                ],
                "last_message": None,
                "last_message_time": datetime.now(timezone.utc),
                "unread_counts": {uid: 0, participant_id: 0},
                "created_at": datetime.now(timezone.utc),
            }
            target_user = await db.users.find_one({"_id": parse_object_id(participant_id, "participant_id")})
            if target_user:
                direct["participants"].append({"user_id": participant_id, "name": target_user.get("name", ""), "avatar": target_user.get("avatar", "")})
            result = await db.conversations.insert_one(direct)
            direct["_id"] = result.inserted_id
            existing = direct
        await send_message(str(existing["_id"]), MessageBody(content=body.content, type=body.type), request)
        sent.append(str(existing["_id"]))
    return {"sent_to": len(sent), "conversation_ids": sent}

# --- Message Routes ---
@fastapi_app.get("/api/conversations/{conv_id}/messages")
async def get_messages(conv_id: str, request: Request, limit: int = 50, before: str = None):
    user = await get_current_user(request)
    uid = str(user["_id"])
    await get_conversation_for_user(conv_id, uid)
    await deliver_due_scheduled_messages(uid, conv_id)
    await purge_expired_messages(conv_id)
    query = {"conversation_id": conv_id}
    if before:
        query["_id"] = {"$lt": parse_object_id(before, "before")}
    messages = await db.messages.find(query).sort("_id", -1).limit(limit).to_list(limit)
    messages.reverse()
    # Mark as read
    await db.conversations.update_one({"_id": parse_object_id(conv_id, "conversation_id")}, {"$set": {f"unread_counts.{uid}": 0}})
    return {"messages": [serialize_message(m) for m in messages]}

@fastapi_app.post("/api/conversations/{conv_id}/messages")
async def send_message(conv_id: str, body: MessageBody, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    conv = await get_conversation_for_user(conv_id, uid)
    await deliver_due_scheduled_messages(uid, conv_id)
        
    if conv.get("is_channel"):
        posting_permission = conv.get("posting_permission", "admins")
        if posting_permission == "admins" and uid not in conv.get("admins", []):
            raise HTTPException(status_code=403, detail="Only admins can post in this channel")

    reply_to_content = None
    if body.reply_to:
        replied_msg = await db.messages.find_one({"_id": parse_object_id(body.reply_to, "reply_to"), "conversation_id": conv_id})
        if replied_msg:
            reply_to_content = replied_msg.get("content")

    now = datetime.now(timezone.utc)
    msg = {
        "conversation_id": conv_id,
        "sender_id": uid,
        "content": body.content,
        "type": body.type,
        "status": "sent",
        "reply_to": body.reply_to,
        "reply_to_content": reply_to_content,
        "created_at": now,
    }
    if conv.get("disappearing_minutes", 0) > 0:
        msg["expires_at"] = now + timedelta(minutes=conv["disappearing_minutes"])
    result = await db.messages.insert_one(msg)
    msg["_id"] = result.inserted_id
    await update_conversation_streak(conv, now)
    # Update conversation
    unread_inc = {f"unread_counts.{pid}": 1 for pid in conv["participant_ids"] if pid != uid}
    await db.conversations.update_one(
        {"_id": ObjectId(conv_id)},
        {"$set": {"last_message": body.content, "last_message_time": msg["created_at"]}, "$inc": unread_inc}
    )
    serialized = serialize_message(msg)
    # Emit to all participants via Socket.IO
    for pid in conv["participant_ids"]:
        await sio.emit("new_message", {"message": serialized, "conversation_id": conv_id}, room=f"user_{pid}")
    return {"message": serialized}

@fastapi_app.post("/api/conversations/{conv_id}/schedule-message")
async def schedule_message(conv_id: str, body: ScheduleMessageBody, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    await get_conversation_for_user(conv_id, uid)
    delay_minutes = max(1, min(body.delay_minutes, 24 * 60))
    reply_to_content = None
    if body.reply_to:
        replied_msg = await db.messages.find_one({"_id": parse_object_id(body.reply_to, "reply_to"), "conversation_id": conv_id})
        if replied_msg:
            reply_to_content = replied_msg.get("content")
    scheduled = {
        "conversation_id": conv_id,
        "sender_id": uid,
        "content": body.content.strip(),
        "type": body.type,
        "reply_to": body.reply_to,
        "reply_to_content": reply_to_content,
        "deliver_at": datetime.now(timezone.utc) + timedelta(minutes=delay_minutes),
        "status": "scheduled",
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.scheduled_messages.insert_one(scheduled)
    scheduled["_id"] = result.inserted_id
    return {"scheduled_message": {"id": str(result.inserted_id), "deliver_at": scheduled["deliver_at"].isoformat(), "content": scheduled["content"]}}

# --- Stories Routes ---
@fastapi_app.get("/api/stories")
async def get_stories(request: Request):
    await get_current_user(request)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    stories = await db.stories.find({"created_at": {"$gte": cutoff}}).sort("created_at", -1).to_list(100)
    result = {}
    for s in stories:
        uid = s["user_id"]
        if uid not in result:
            result[uid] = {"user_id": uid, "user_name": s.get("user_name", ""), "user_avatar": s.get("user_avatar", ""), "stories": []}
        result[uid]["stories"].append({
            "id": str(s["_id"]),
            "content": s.get("content", ""),
            "type": s.get("type", "text"),
            "created_at": s.get("created_at", "").isoformat() if isinstance(s.get("created_at"), datetime) else str(s.get("created_at", "")),
        })
    return {"stories": list(result.values())}

@fastapi_app.post("/api/stories")
async def create_story(body: StoryBody, request: Request):
    user = await get_current_user(request)
    story = {
        "user_id": str(user["_id"]),
        "user_name": user.get("name", ""),
        "user_avatar": user.get("avatar", ""),
        "content": body.content,
        "type": body.type,
        "caption": (body.caption or "").strip(),
        "audience": body.audience,
        "location_label": (body.location_label or "").strip(),
        "tags": body.tags,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.stories.insert_one(story)
    story["_id"] = result.inserted_id
    return {"story": {"id": str(story["_id"]), "content": story["content"], "type": story["type"], "caption": story.get("caption", ""), "audience": story.get("audience", "friends"), "location_label": story.get("location_label", ""), "created_at": story["created_at"].isoformat()}}

# --- Group Chat Routes ---
@fastapi_app.get("/api/conversations/{conv_id}")
async def get_conversation(conv_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    conv = await get_conversation_for_user(conv_id, uid)
    return {"conversation": serialize_conversation(conv, uid)}

@fastapi_app.post("/api/conversations/{conv_id}/add-member")
async def add_group_member(conv_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    body = await request.json()
    member_id = body.get("user_id")
    conv = await db.conversations.find_one({"_id": parse_object_id(conv_id, "conversation_id"), "participant_ids": uid, "type": "group"})
    if not conv:
        raise HTTPException(status_code=404, detail="Group not found")
    if member_id in conv["participant_ids"]:
        return {"message": "Already a member"}
    new_user = await db.users.find_one({"_id": parse_object_id(member_id, "user_id")})
    if not new_user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.conversations.update_one({"_id": parse_object_id(conv_id, "conversation_id")}, {
        "$push": {"participant_ids": member_id, "participants": {"user_id": member_id, "name": new_user.get("name", ""), "avatar": new_user.get("avatar", "")}},
        "$set": {f"unread_counts.{member_id}": 0}
    })
    return {"message": "Member added"}

@fastapi_app.post("/api/conversations/{conv_id}/pin_message")
async def pin_chat_message(conv_id: str, body: PinMessageBody, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    conv = await get_conversation_for_user(conv_id, uid)
    pinned_message_id = None
    pinned_message = None

    if body.message_id:
        msg = await db.messages.find_one({"_id": parse_object_id(body.message_id, "message_id"), "conversation_id": conv_id})
        if not msg:
            raise HTTPException(status_code=404, detail="Message not found")
        pinned_message_id = str(msg["_id"])
        pinned_message = build_pinned_message_snapshot(msg)

    await db.conversations.update_one(
        {"_id": parse_object_id(conv_id, "conversation_id")},
        {"$set": {"pinned_message_id": pinned_message_id, "pinned_message": pinned_message}}
    )
    
    # Broadcast to participants
    for pid in conv["participant_ids"]:
        await sio.emit("message_pinned", {
            "conversation_id": conv_id, 
            "message_id": pinned_message_id,
            "pinned_message": pinned_message,
        }, room=f"user_{pid}")
        
    return {"message": "Pinned message updated", "pinned_message_id": pinned_message_id, "pinned_message": pinned_message}

@fastapi_app.post("/api/conversations/{conv_id}/disappearing")
async def set_disappearing_messages(conv_id: str, body: DisappearingMessagesBody, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    conv = await get_conversation_for_user(conv_id, uid)
    minutes = max(0, min(body.minutes, 7 * 24 * 60))
    await db.conversations.update_one(
        {"_id": parse_object_id(conv_id, "conversation_id")},
        {"$set": {"disappearing_minutes": minutes}}
    )
    conv["disappearing_minutes"] = minutes
    for pid in conv["participant_ids"]:
        await sio.emit(
            "conversation_settings_updated",
            {"conversation_id": conv_id, "disappearing_minutes": minutes},
            room=f"user_{pid}"
        )
    return {"conversation": serialize_conversation(conv, uid)}

@fastapi_app.post("/api/conversations/{conv_id}/leave")
async def leave_group(conv_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    conv = await db.conversations.find_one({"_id": parse_object_id(conv_id, "conversation_id"), "participant_ids": uid, "type": "group"})
    if not conv:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.conversations.update_one({"_id": parse_object_id(conv_id, "conversation_id")}, {
        "$pull": {"participant_ids": uid, "participants": {"user_id": uid}},
        "$unset": {f"unread_counts.{uid}": ""}
    })
    return {"message": "Left group"}

@fastapi_app.patch("/api/messages/{msg_id}")
async def edit_message(msg_id: str, body: EditMessageBody, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    msg = await db.messages.find_one({"_id": parse_object_id(msg_id, "message_id"), "sender_id": uid})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    await db.messages.update_one({"_id": parse_object_id(msg_id, "message_id")}, {"$set": {"content": body.content, "is_edited": True}})
    conv_id = msg["conversation_id"]
    conv = await refresh_conversation_state(conv_id)
    for pid in conv.get("participant_ids", []):
        await sio.emit("message_edited", {"message_id": msg_id, "conversation_id": conv_id, "content": body.content}, room=f"user_{pid}")
    return {"message": "Edited"}

# --- Message Actions ---
@fastapi_app.delete("/api/messages/{msg_id}")
async def delete_message(msg_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    msg = await db.messages.find_one({"_id": parse_object_id(msg_id, "message_id"), "sender_id": uid})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    await db.messages.delete_one({"_id": parse_object_id(msg_id, "message_id")})
    conv_id = msg["conversation_id"]
    conv = await refresh_conversation_state(conv_id)
    for pid in conv.get("participant_ids", []):
        await sio.emit("message_deleted", {"message_id": msg_id, "conversation_id": conv_id}, room=f"user_{pid}")
    return {"message": "Deleted"}

@fastapi_app.post("/api/messages/{msg_id}/react")
async def react_message(msg_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    body = await request.json()
    emoji = body.get("emoji", "")
    msg = await db.messages.find_one({"_id": parse_object_id(msg_id, "message_id")})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    await get_conversation_for_user(msg["conversation_id"], uid)
    reactions = msg.get("reactions", {})
    if uid in reactions and reactions[uid] == emoji:
        del reactions[uid]
    else:
        reactions[uid] = emoji
    await db.messages.update_one({"_id": parse_object_id(msg_id, "message_id")}, {"$set": {"reactions": reactions}})
    conv_id = msg["conversation_id"]
    conv = await db.conversations.find_one({"_id": parse_object_id(conv_id, "conversation_id")})
    if conv:
        for pid in conv.get("participant_ids", []):
            await sio.emit("message_reaction", {"message_id": msg_id, "conversation_id": conv_id, "reactions": reactions, "user_id": uid, "emoji": emoji}, room=f"user_{pid}")
    return {"reactions": reactions}

# --- Pin/Archive Conversations ---
@fastapi_app.post("/api/conversations/{conv_id}/pin")
async def pin_conversation(conv_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    await db.user_prefs.update_one({"user_id": uid}, {"$addToSet": {"pinned": conv_id}}, upsert=True)
    return {"pinned": True}

@fastapi_app.post("/api/conversations/{conv_id}/star")
async def star_conversation(conv_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    conv = await get_conversation_for_user(conv_id, uid)
    starred = uid not in conv.get("starred_by", [])
    update = {"$addToSet": {"starred_by": uid}} if starred else {"$pull": {"starred_by": uid}}
    await db.conversations.update_one({"_id": parse_object_id(conv_id, "conversation_id")}, update)
    return {"is_starred": starred}

@fastapi_app.post("/api/messages/{msg_id}/save")
async def save_message(msg_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    msg = await db.messages.find_one({"_id": parse_object_id(msg_id, "message_id")})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    await get_conversation_for_user(msg["conversation_id"], uid)
    existing = await db.saved_messages.find_one({"user_id": uid, "message_id": msg_id})
    if existing:
        await db.saved_messages.delete_one({"_id": existing["_id"]})
        return {"saved": False}
    await db.saved_messages.insert_one({
        "user_id": uid,
        "message_id": msg_id,
        "conversation_id": msg["conversation_id"],
        "message": serialize_message(msg),
        "saved_at": datetime.now(timezone.utc),
    })
    return {"saved": True}

@fastapi_app.get("/api/saved-messages")
async def get_saved_messages(request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    saved = await db.saved_messages.find({"user_id": uid}).sort("saved_at", -1).to_list(100)
    return {"saved_messages": [{"id": str(item["_id"]), "saved_at": item["saved_at"].isoformat() if isinstance(item.get("saved_at"), datetime) else str(item.get("saved_at", "")), "message": item.get("message", {}), "conversation_id": item.get("conversation_id", "")} for item in saved]}

@fastapi_app.post("/api/conversations/{conv_id}/unpin")
async def unpin_conversation(conv_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    await db.user_prefs.update_one({"user_id": uid}, {"$pull": {"pinned": conv_id}})
    return {"pinned": False}

@fastapi_app.post("/api/conversations/{conv_id}/archive")
async def archive_conversation(conv_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    await db.user_prefs.update_one({"user_id": uid}, {"$addToSet": {"archived": conv_id}}, upsert=True)
    return {"archived": True}

@fastapi_app.post("/api/conversations/{conv_id}/clear")
async def clear_chat(conv_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    await get_conversation_for_user(conv_id, uid)
    await db.messages.delete_many({"conversation_id": conv_id})
    await db.conversations.update_one(
        {"_id": parse_object_id(conv_id, "conversation_id")},
        {"$set": {"last_message": None, "last_message_time": datetime.now(timezone.utc), "pinned_message_id": None, "pinned_message": None}}
    )
    return {"message": "Chat cleared"}

# --- Block Users ---
@fastapi_app.post("/api/users/{target_id}/block")
async def block_user(target_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    await db.user_prefs.update_one({"user_id": uid}, {"$addToSet": {"blocked": target_id}}, upsert=True)
    return {"blocked": True}

@fastapi_app.post("/api/users/{target_id}/unblock")
async def unblock_user(target_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    await db.user_prefs.update_one({"user_id": uid}, {"$pull": {"blocked": target_id}})
    return {"blocked": False}

@fastapi_app.get("/api/users/blocked/list")
async def get_blocked_users(request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    prefs = await db.user_prefs.find_one({"user_id": uid})
    blocked_ids = prefs.get("blocked", []) if prefs else []
    blocked_users = []
    for bid in blocked_ids:
        try:
            user_oid = ObjectId(bid)
        except InvalidId:
            continue
        u = await db.users.find_one({"_id": user_oid})
        if u:
            blocked_users.append(serialize_user(u))
    return {"blocked": blocked_users}

# --- User Prefs ---
@fastapi_app.get("/api/user-prefs")
async def get_user_prefs(request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    prefs = await db.user_prefs.find_one({"user_id": uid})
    if not prefs:
        return {"pinned": [], "archived": [], "blocked": []}
    return {"pinned": prefs.get("pinned", []), "archived": prefs.get("archived", []), "blocked": prefs.get("blocked", [])}

# --- Contacts ---
@fastapi_app.get("/api/contacts")
async def get_contacts(request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    convs = await db.conversations.find({"participant_ids": uid, "type": "direct"}).to_list(100)
    contact_ids = set()
    for c in convs:
        for pid in c["participant_ids"]:
            if pid != uid:
                contact_ids.add(pid)
    contacts = []
    for cid in contact_ids:
        try:
            user_oid = ObjectId(cid)
        except InvalidId:
            continue
        u = await db.users.find_one({"_id": user_oid})
        if u:
            contacts.append(serialize_user(u))
    return {"contacts": contacts}

# --- Forward Message ---
@fastapi_app.post("/api/messages/{msg_id}/forward")
async def forward_message(msg_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    body = await request.json()
    target_conv_id = body.get("conversation_id")
    orig = await db.messages.find_one({"_id": parse_object_id(msg_id, "message_id")})
    if not orig:
        raise HTTPException(status_code=404, detail="Message not found")
    await get_conversation_for_user(orig["conversation_id"], uid)
    conv = await get_conversation_for_user(target_conv_id, uid)
    now = datetime.now(timezone.utc)
    fwd_msg = {
        "conversation_id": target_conv_id,
        "sender_id": uid,
        "content": orig["content"],
        "type": orig.get("type", "text"),
        "status": "sent",
        "forwarded": True,
        "created_at": now,
    }
    if conv.get("disappearing_minutes", 0) > 0:
        fwd_msg["expires_at"] = now + timedelta(minutes=conv["disappearing_minutes"])
    result = await db.messages.insert_one(fwd_msg)
    fwd_msg["_id"] = result.inserted_id
    serialized = serialize_message(fwd_msg)
    serialized["forwarded"] = True
    await update_conversation_streak(conv, now)
    unread_inc = {f"unread_counts.{pid}": 1 for pid in conv["participant_ids"] if pid != uid}
    await db.conversations.update_one({"_id": parse_object_id(target_conv_id, "conversation_id")}, {"$set": {"last_message": orig["content"], "last_message_time": fwd_msg["created_at"]}, "$inc": unread_inc})
    for pid in conv["participant_ids"]:
        await sio.emit("new_message", {"message": serialized, "conversation_id": target_conv_id}, room=f"user_{pid}")
    return {"message": serialized}

# --- Health ---
@fastapi_app.get("/api/health")
async def health():
    return {"status": "ok", "service": "quantchat-api"}


# --- Pinned Messages (Telegram) ---
@fastapi_app.post("/api/conversations/{conv_id}/messages/{msg_id}/pin_chat")
async def pin_message_for_chat(conv_id: str, msg_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    conv = await get_conversation_for_user(conv_id, uid)
        
    if conv.get("is_channel") and uid not in conv.get("admins", []):
        raise HTTPException(status_code=403, detail="Only admins can pin messages")

    msg = await db.messages.find_one({"_id": parse_object_id(msg_id, "message_id"), "conversation_id": conv_id})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    pinned_msg = build_pinned_message_snapshot(msg)
    await db.conversations.update_one(
        {"_id": parse_object_id(conv_id, "conversation_id")},
        {"$set": {"pinned_message_id": str(msg["_id"]), "pinned_message": pinned_msg}}
    )
    for pid in conv["participant_ids"]:
        await sio.emit("message_pinned", {"conversation_id": conv_id, "message_id": str(msg["_id"]), "pinned_message": pinned_msg}, room=f"user_{pid}")
    return {"pinned_message": pinned_msg}

@fastapi_app.post("/api/conversations/{conv_id}/unpin_chat")
async def unpin_chat_message(conv_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    conv = await get_conversation_for_user(conv_id, uid)
    
    if conv.get("is_channel") and uid not in conv.get("admins", []):
        raise HTTPException(status_code=403, detail="Only admins can unpin messages")

    await db.conversations.update_one(
        {"_id": parse_object_id(conv_id, "conversation_id")},
        {"$set": {"pinned_message": None, "pinned_message_id": None}}
    )
    for pid in conv["participant_ids"]:
        await sio.emit("message_unpinned", {"conversation_id": conv_id}, room=f"user_{pid}")
    return {"message": "Unpinned"}

# --- Reels (Snapchat/Insta) ---
def serialize_reel(r: dict, user_id: str) -> dict:
    likes = r.get("likes", [])
    return {
        "id": str(r["_id"]),
        "user_id": str(r["user_id"]),
        "user_name": r.get("user_name", ""),
        "user_avatar": r.get("user_avatar", ""),
        "media_url": r.get("media_url", ""),
        "caption": r.get("caption", ""),
        "likes_count": len(likes),
        "is_liked": user_id in likes,
        "comments": [
            {"id": str(c["id"]), "user_id": c["user_id"], "user_name": c["user_name"], "text": c["text"], "created_at": c["created_at"].isoformat() if isinstance(c["created_at"], datetime) else str(c["created_at"])} 
            for c in r.get("comments", [])
        ],
        "created_at": r.get("created_at", "").isoformat() if isinstance(r.get("created_at"), datetime) else str(r.get("created_at", "")),
    }

@fastapi_app.get("/api/reels")
async def get_reels(request: Request, limit: int = 20):
    user = await get_current_user(request)
    uid = str(user["_id"])
    reels = await db.reels.find().sort("created_at", -1).limit(limit).to_list(limit)
    return {"reels": [serialize_reel(r, uid) for r in reels]}

@fastapi_app.post("/api/reels")
async def create_reel(body: ReelBody, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    reel = {
        "user_id": uid,
        "user_name": user.get("name", ""),
        "user_avatar": user.get("avatar", ""),
        "media_url": body.media_url,
        "caption": body.caption,
        "audience": body.audience,
        "location_label": (body.location_label or "").strip(),
        "tags": body.tags,
        "likes": [],
        "comments": [],
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.reels.insert_one(reel)
    reel["_id"] = result.inserted_id
    return {"reel": serialize_reel(reel, uid)}

@fastapi_app.post("/api/reels/{reel_id}/like")
async def like_reel(reel_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    reel = await db.reels.find_one({"_id": parse_object_id(reel_id, "reel_id")})
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")
    
    likes = reel.get("likes", [])
    if uid in likes:
        likes.remove(uid)
    else:
        likes.append(uid)
    await db.reels.update_one({"_id": parse_object_id(reel_id, "reel_id")}, {"$set": {"likes": likes}})
    return {"is_liked": uid in likes, "likes_count": len(likes)}

@fastapi_app.post("/api/reels/{reel_id}/comment")
async def comment_reel(reel_id: str, body: CommentBody, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    reel = await db.reels.find_one({"_id": parse_object_id(reel_id, "reel_id")})
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")
    
    comment = {
        "id": str(ObjectId()),
        "user_id": uid,
        "user_name": user.get("name", ""),
        "text": body.text,
        "created_at": datetime.now(timezone.utc)
    }
    await db.reels.update_one({"_id": parse_object_id(reel_id, "reel_id")}, {"$push": {"comments": comment}})
    comment["created_at"] = comment["created_at"].isoformat()
    return {"comment": comment}


# --- AI Assistant Routes ---
@fastapi_app.get("/api/assistant/history")
async def get_assistant_history(request: Request, conversation_id: Optional[str] = None, limit: int = 18):
    user = await get_current_user(request)
    session_id = build_assistant_session_id(str(user["_id"]), conversation_id)
    messages = await db.assistant_messages.find(
        {"user_id": str(user["_id"]), "session_id": session_id}
    ).sort("created_at", -1).limit(max(1, min(limit, 40))).to_list(max(1, min(limit, 40)))
    messages.reverse()
    return {
        "session_id": session_id,
        "messages": [serialize_assistant_message(message) for message in messages],
        "suggestions": build_assistant_suggestions("general", conversation_id),
    }

@fastapi_app.post("/api/assistant/respond")
async def assistant_respond(body: AssistantBody, request: Request):
    user = await get_current_user(request)
    prompt = body.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    session_id = build_assistant_session_id(str(user["_id"]), body.conversation_id)
    context = await build_assistant_context(user, body.conversation_id, body.mode)
    ai_config = await db.ai_configs.find_one({"user_id": str(user["_id"])})
    response_text = await run_assistant_response(user, session_id, prompt, context, ai_config)
    now = datetime.now(timezone.utc)
    user_message = {
        "user_id": str(user["_id"]),
        "session_id": session_id,
        "conversation_id": body.conversation_id,
        "mode": body.mode,
        "role": "user",
        "content": prompt,
        "created_at": now,
    }
    assistant_message = {
        "user_id": str(user["_id"]),
        "session_id": session_id,
        "conversation_id": body.conversation_id,
        "mode": body.mode,
        "role": "assistant",
        "content": response_text,
        "created_at": now,
    }
    user_result = await db.assistant_messages.insert_one(user_message)
    assistant_result = await db.assistant_messages.insert_one(assistant_message)
    user_message["_id"] = user_result.inserted_id
    assistant_message["_id"] = assistant_result.inserted_id
    history = await db.assistant_messages.find(
        {"user_id": str(user["_id"]), "session_id": session_id}
    ).sort("created_at", -1).limit(18).to_list(18)
    history.reverse()
    return {
        "session_id": session_id,
        "message": serialize_assistant_message(assistant_message),
        "messages": [serialize_assistant_message(item) for item in history],
        "suggestions": build_assistant_suggestions(body.mode, body.conversation_id),
    }

@fastapi_app.get("/api/ai-config")
async def get_ai_config(request: Request):
    user = await get_current_user(request)
    config = await db.ai_configs.find_one({"user_id": str(user["_id"])})
    if not config:
        config = {
            "user_id": str(user["_id"]),
            "active_provider": "openai",
            "active_model": "gpt-5.2",
            "custom_keys": {},
            "ollama_base_url": "",
            "ollama_model": "",
            "mcp_servers": [],
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        await db.ai_configs.insert_one(config)
    return {"config": serialize_ai_config(config)}

@fastapi_app.put("/api/ai-config")
async def update_ai_config(body: AIConfigBody, request: Request):
    user = await get_current_user(request)
    existing = await db.ai_configs.find_one({"user_id": str(user["_id"])}) or {"custom_keys": {}}
    custom_keys = existing.get("custom_keys", {}).copy()

    def maybe_update_secret(field_value: Optional[str], key_name: str):
        if field_value is None:
            return
        trimmed = field_value.strip()
        if not trimmed or set(trimmed) == {"•"}:
            return
        custom_keys[key_name] = trimmed

    maybe_update_secret(body.openai_api_key, "openai")
    maybe_update_secret(body.gemini_api_key, "gemini")
    maybe_update_secret(body.claude_api_key, "anthropic")
    maybe_update_secret(body.deepseek_api_key, "deepseek")

    update_doc = {
        "user_id": str(user["_id"]),
        "active_provider": body.active_provider,
        "active_model": body.active_model,
        "custom_keys": custom_keys,
        "ollama_base_url": (body.ollama_base_url or "").strip(),
        "ollama_model": (body.ollama_model or "").strip(),
        "mcp_servers": [server.model_dump() for server in body.mcp_servers],
        "updated_at": datetime.now(timezone.utc),
    }
    await db.ai_configs.update_one(
        {"user_id": str(user["_id"])},
        {"$set": update_doc, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    saved = await db.ai_configs.find_one({"user_id": str(user["_id"])})
    return {"config": serialize_ai_config(saved)}

@fastapi_app.get("/api/posts")
async def get_posts(request: Request):
    await get_current_user(request)
    posts = await db.posts.find({"visibility": "public"}).sort("created_at", -1).to_list(50)
    return {"posts": [serialize_post(post) for post in posts]}

@fastapi_app.post("/api/posts")
async def create_post(body: FeedPostBody, request: Request):
    user = await get_current_user(request)
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Post content is required")
    post = {
        "user_id": str(user["_id"]),
        "user_name": user.get("name", "Unknown"),
        "user_avatar": user.get("avatar", ""),
        "content": content,
        "media_url": (body.media_url or "").strip(),
        "visibility": body.visibility,
        "audience": body.audience,
        "tags": body.tags,
        "location_label": (body.location_label or "").strip(),
        "lat": body.lat,
        "lng": body.lng,
        "likes": [],
        "comments": [],
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.posts.insert_one(post)
    post["_id"] = result.inserted_id
    return {"post": serialize_post(post)}

@fastapi_app.get("/api/profile")
async def get_profile(request: Request):
    user = await get_current_user(request)
    posts = await db.posts.find({"user_id": str(user["_id"])}).sort("created_at", -1).to_list(20)
    config = await db.ai_configs.find_one({"user_id": str(user["_id"])})
    return {
        "user": serialize_user(user),
        "posts": [serialize_post(post) for post in posts],
        "ai_config": serialize_ai_config(config),
    }


# --- Socket.IO Events ---
online_users = {}  # sid -> user_id
user_sids = {}  # user_id -> set of sids

@sio.event
async def connect(sid, environ):
    pass

@sio.event
async def authenticate(sid, data):
    token = data.get("token") if isinstance(data, dict) else data
    if not token:
        await sio.emit("auth_error", {"message": "Token required"}, room=sid)
        return
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            await sio.emit("auth_error", {"message": "Invalid token"}, room=sid)
            return
        online_users[sid] = user_id
        if user_id not in user_sids:
            user_sids[user_id] = set()
        user_sids[user_id].add(sid)
        await sio.enter_room(sid, f"user_{user_id}")
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"online": True, "last_seen": datetime.now(timezone.utc)}})
        active_online_users = sorted(set(online_users.values()))
        await sio.emit("authenticated", {"user_id": user_id, "online_users": active_online_users}, room=sid)
        # Broadcast online status
        await sio.emit("user_online", {"user_id": user_id})
    except Exception:
        await sio.emit("auth_error", {"message": "Authentication failed"}, room=sid)

@sio.event
async def typing(sid, data):
    user_id = online_users.get(sid)
    if not user_id:
        return
    conv_id = data.get("conversation_id")
    is_typing = data.get("is_typing", False)
    if conv_id:
        try:
            conv = await get_conversation_for_user(conv_id, user_id)
        except HTTPException:
            return
        for pid in conv["participant_ids"]:
            if pid != user_id:
                await sio.emit("user_typing", {"user_id": user_id, "conversation_id": conv_id, "is_typing": is_typing}, room=f"user_{pid}")

@sio.event
async def mark_read(sid, data):
    user_id = online_users.get(sid)
    if not user_id:
        return
    conv_id = data.get("conversation_id")
    if conv_id:
        try:
            conv = await get_conversation_for_user(conv_id, user_id)
        except HTTPException:
            return
        await db.conversations.update_one({"_id": parse_object_id(conv_id, "conversation_id")}, {"$set": {f"unread_counts.{user_id}": 0}})
        # Notify sender about read receipt
        for pid in conv["participant_ids"]:
            if pid != user_id:
                await sio.emit("messages_read", {"conversation_id": conv_id, "reader_id": user_id}, room=f"user_{pid}")

@sio.event
async def disconnect(sid):
    user_id = online_users.pop(sid, None)
    if user_id:
        if user_id in user_sids:
            user_sids[user_id].discard(sid)
            if not user_sids[user_id]:
                del user_sids[user_id]
                await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"online": False, "last_seen": datetime.now(timezone.utc)}})
                await sio.emit("user_offline", {"user_id": user_id})

# Socket.IO is already wrapped around FastAPI via the main `app` ASGI variable
