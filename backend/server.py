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
from motor.motor_asyncio import AsyncIOMotorClient
import json

# --- Config ---
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALGORITHM = "HS256"
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

# --- App ---
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
fastapi_app = FastAPI(title="QuantChat API")

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
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
        "created_at": msg.get("created_at", "").isoformat() if isinstance(msg.get("created_at"), datetime) else str(msg.get("created_at", "")),
    }

def serialize_conversation(conv: dict, current_user_id: str = None) -> dict:
    participants = conv.get("participants", [])
    other = None
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
        "other_user": {"user_id": str(other.get("user_id", "")), "name": other.get("name", ""), "avatar": other.get("avatar", "")} if other else None,
    }

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

class CreateConversationBody(BaseModel):
    participant_id: str
    type: str = "direct"

class CreateGroupBody(BaseModel):
    name: str
    participant_ids: List[str]

class UpdateProfileBody(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    avatar: Optional[str] = None

class StoryBody(BaseModel):
    content: str
    type: str = "text"
class EditMessageBody(BaseModel):
    content: str


# --- Startup ---
@fastapi_app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.messages.create_index("conversation_id")
    await db.conversations.create_index("participant_ids")
    await db.stories.create_index("created_at", expireAfterSeconds=86400)
    await seed_admin()
    await seed_demo_users()

async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@quantchat.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "QuantChat@2026")
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
    user = await db.users.find_one({"_id": ObjectId(user_id)})
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
    convs = await db.conversations.find({"participant_ids": uid}).sort("last_message_time", -1).to_list(50)
    return {"conversations": [serialize_conversation(c, uid) for c in convs]}

@fastapi_app.post("/api/conversations")
async def create_conversation(body: CreateConversationBody, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    other = await db.users.find_one({"_id": ObjectId(body.participant_id)})
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
        u = await db.users.find_one({"_id": ObjectId(pid)})
        if u:
            participants.append({"user_id": str(u["_id"]), "name": u.get("name", ""), "avatar": u.get("avatar", "")})
    conv = {
        "type": "group",
        "name": body.name,
        "avatar": "",
        "participant_ids": participant_ids,
        "participants": participants,
        "last_message": None,
        "last_message_time": datetime.now(timezone.utc),
        "unread_counts": {pid: 0 for pid in participant_ids},
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.conversations.insert_one(conv)
    conv["_id"] = result.inserted_id
    return {"conversation": serialize_conversation(conv, uid)}

# --- Message Routes ---
@fastapi_app.get("/api/conversations/{conv_id}/messages")
async def get_messages(conv_id: str, request: Request, limit: int = 50, before: str = None):
    user = await get_current_user(request)
    uid = str(user["_id"])
    conv = await db.conversations.find_one({"_id": ObjectId(conv_id), "participant_ids": uid})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    query = {"conversation_id": conv_id}
    if before:
        query["_id"] = {"$lt": ObjectId(before)}
    messages = await db.messages.find(query).sort("_id", -1).limit(limit).to_list(limit)
    messages.reverse()
    # Mark as read
    await db.conversations.update_one({"_id": ObjectId(conv_id)}, {"$set": {f"unread_counts.{uid}": 0}})
    return {"messages": [serialize_message(m) for m in messages]}

@fastapi_app.post("/api/conversations/{conv_id}/messages")
async def send_message(conv_id: str, body: MessageBody, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    conv = await db.conversations.find_one({"_id": ObjectId(conv_id), "participant_ids": uid})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    msg = {
        "conversation_id": conv_id,
        "sender_id": uid,
        "content": body.content,
        "type": body.type,
        "status": "sent",
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.messages.insert_one(msg)
    msg["_id"] = result.inserted_id
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

# --- Stories Routes ---
@fastapi_app.get("/api/stories")
async def get_stories(request: Request):
    user = await get_current_user(request)
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
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.stories.insert_one(story)
    story["_id"] = result.inserted_id
    return {"story": {"id": str(story["_id"]), "content": story["content"], "type": story["type"], "created_at": story["created_at"].isoformat()}}

# --- Group Chat Routes ---
@fastapi_app.get("/api/conversations/{conv_id}")
async def get_conversation(conv_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    conv = await db.conversations.find_one({"_id": ObjectId(conv_id), "participant_ids": uid})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"conversation": serialize_conversation(conv, uid)}

@fastapi_app.post("/api/conversations/{conv_id}/add-member")
async def add_group_member(conv_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    body = await request.json()
    member_id = body.get("user_id")
    conv = await db.conversations.find_one({"_id": ObjectId(conv_id), "participant_ids": uid, "type": "group"})
    if not conv:
        raise HTTPException(status_code=404, detail="Group not found")
    if member_id in conv["participant_ids"]:
        return {"message": "Already a member"}
    new_user = await db.users.find_one({"_id": ObjectId(member_id)})
    if not new_user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.conversations.update_one({"_id": ObjectId(conv_id)}, {
        "$push": {"participant_ids": member_id, "participants": {"user_id": member_id, "name": new_user.get("name", ""), "avatar": new_user.get("avatar", "")}},
        "$set": {f"unread_counts.{member_id}": 0}
    })
    return {"message": "Member added"}

@fastapi_app.post("/api/conversations/{conv_id}/leave")
async def leave_group(conv_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    conv = await db.conversations.find_one({"_id": ObjectId(conv_id), "participant_ids": uid, "type": "group"})
    if not conv:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.conversations.update_one({"_id": ObjectId(conv_id)}, {
        "$pull": {"participant_ids": uid, "participants": {"user_id": uid}},
        "$unset": {f"unread_counts.{uid}": ""}
    })
    return {"message": "Left group"}

@fastapi_app.patch("/api/messages/{msg_id}")
async def edit_message(msg_id: str, body: EditMessageBody, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    msg = await db.messages.find_one({"_id": ObjectId(msg_id), "sender_id": uid})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    await db.messages.update_one({"_id": ObjectId(msg_id)}, {"$set": {"content": body.content, "is_edited": True}})
    conv_id = msg["conversation_id"]
    for pid in (await db.conversations.find_one({"_id": ObjectId(conv_id)})).get("participant_ids", []):
        await sio.emit("message_edited", {"message_id": msg_id, "conversation_id": conv_id, "content": body.content}, room=f"user_{pid}")
    return {"message": "Edited"}

# --- Message Actions ---
@fastapi_app.delete("/api/messages/{msg_id}")
async def delete_message(msg_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    msg = await db.messages.find_one({"_id": ObjectId(msg_id), "sender_id": uid})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    await db.messages.delete_one({"_id": ObjectId(msg_id)})
    conv_id = msg["conversation_id"]
    for pid in (await db.conversations.find_one({"_id": ObjectId(conv_id)})).get("participant_ids", []):
        await sio.emit("message_deleted", {"message_id": msg_id, "conversation_id": conv_id}, room=f"user_{pid}")
    return {"message": "Deleted"}

@fastapi_app.post("/api/messages/{msg_id}/react")
async def react_message(msg_id: str, request: Request):
    user = await get_current_user(request)
    uid = str(user["_id"])
    body = await request.json()
    emoji = body.get("emoji", "")
    msg = await db.messages.find_one({"_id": ObjectId(msg_id)})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    reactions = msg.get("reactions", {})
    if uid in reactions and reactions[uid] == emoji:
        del reactions[uid]
    else:
        reactions[uid] = emoji
    await db.messages.update_one({"_id": ObjectId(msg_id)}, {"$set": {"reactions": reactions}})
    conv_id = msg["conversation_id"]
    conv = await db.conversations.find_one({"_id": ObjectId(conv_id)})
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
    conv = await db.conversations.find_one({"_id": ObjectId(conv_id), "participant_ids": uid})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.messages.delete_many({"conversation_id": conv_id})
    await db.conversations.update_one({"_id": ObjectId(conv_id)}, {"$set": {"last_message": None, "last_message_time": datetime.now(timezone.utc)}})
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
        u = await db.users.find_one({"_id": ObjectId(bid)})
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
        u = await db.users.find_one({"_id": ObjectId(cid)})
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
    orig = await db.messages.find_one({"_id": ObjectId(msg_id)})
    if not orig:
        raise HTTPException(status_code=404, detail="Message not found")
    conv = await db.conversations.find_one({"_id": ObjectId(target_conv_id), "participant_ids": uid})
    if not conv:
        raise HTTPException(status_code=404, detail="Target conversation not found")
    fwd_msg = {
        "conversation_id": target_conv_id,
        "sender_id": uid,
        "content": orig["content"],
        "type": orig.get("type", "text"),
        "status": "sent",
        "forwarded": True,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.messages.insert_one(fwd_msg)
    fwd_msg["_id"] = result.inserted_id
    serialized = serialize_message(fwd_msg)
    serialized["forwarded"] = True
    unread_inc = {f"unread_counts.{pid}": 1 for pid in conv["participant_ids"] if pid != uid}
    await db.conversations.update_one({"_id": ObjectId(target_conv_id)}, {"$set": {"last_message": orig["content"], "last_message_time": fwd_msg["created_at"]}, "$inc": unread_inc})
    for pid in conv["participant_ids"]:
        await sio.emit("new_message", {"message": serialized, "conversation_id": target_conv_id}, room=f"user_{pid}")
    return {"message": serialized}

# --- Health ---
@fastapi_app.get("/api/health")
async def health():
    return {"status": "ok", "service": "quantchat-api"}

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
        await sio.emit("authenticated", {"user_id": user_id}, room=sid)
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
        conv = await db.conversations.find_one({"_id": ObjectId(conv_id)})
        if conv:
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
        await db.conversations.update_one({"_id": ObjectId(conv_id)}, {"$set": {f"unread_counts.{user_id}": 0}})
        # Notify sender about read receipt
        conv = await db.conversations.find_one({"_id": ObjectId(conv_id)})
        if conv:
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
