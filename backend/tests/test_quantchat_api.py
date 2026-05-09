"""
QuantChat API Backend Tests
Tests for: Auth (login, register, logout), Users (search, profile), Conversations, Messages, Health
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
DEMO_USER_EMAIL = "arjun@quantchat.com"
DEMO_USER_PASSWORD = "Demo@1234"
ADMIN_EMAIL = "admin@quantchat.com"
ADMIN_PASSWORD = "QuantChat@2026"


class TestHealth:
    """Health endpoint tests"""
    
    def test_health_endpoint(self):
        """Test /api/health returns ok"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "quantchat-api"
        print("✓ Health endpoint working")


class TestAuth:
    """Authentication endpoint tests"""
    
    def test_login_success_demo_user(self):
        """Test login with demo user credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DEMO_USER_EMAIL,
            "password": DEMO_USER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "user" in data
        assert "token" in data
        assert data["user"]["email"] == DEMO_USER_EMAIL
        assert data["user"]["name"] == "Arjun Mehta"
        assert "id" in data["user"]
        print(f"✓ Login successful for {DEMO_USER_EMAIL}")
        return data["token"], data["user"]["id"]
    
    def test_login_success_admin(self):
        """Test login with admin credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful")
    
    def test_login_invalid_credentials(self):
        """Test login with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DEMO_USER_EMAIL,
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        print("✓ Invalid credentials rejected correctly")
    
    def test_login_nonexistent_user(self):
        """Test login with non-existent email"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "nonexistent@test.com",
            "password": "anypassword"
        })
        assert response.status_code == 401
        print("✓ Non-existent user rejected correctly")
    
    def test_register_duplicate_email(self):
        """Test registration with existing email fails"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Test User",
            "email": DEMO_USER_EMAIL,
            "password": "testpass123"
        })
        assert response.status_code == 400
        data = response.json()
        assert "already registered" in data["detail"].lower()
        print("✓ Duplicate email registration rejected")
    
    def test_register_short_password(self):
        """Test registration with short password fails"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "name": "Test User",
            "email": f"test_{int(time.time())}@test.com",
            "password": "12345"
        })
        assert response.status_code == 400
        data = response.json()
        assert "6 characters" in data["detail"]
        print("✓ Short password rejected")
    
    def test_auth_me_without_token(self):
        """Test /api/auth/me without token returns 401"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("✓ Unauthenticated /me request rejected")
    
    def test_auth_me_with_token(self):
        """Test /api/auth/me with valid token"""
        # First login
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DEMO_USER_EMAIL,
            "password": DEMO_USER_PASSWORD
        })
        token = login_resp.json()["token"]
        
        # Then check /me
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["email"] == DEMO_USER_EMAIL
        print("✓ Authenticated /me request successful")
    
    def test_logout(self):
        """Test logout endpoint"""
        response = requests.post(f"{BASE_URL}/api/auth/logout")
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Logged out"
        print("✓ Logout successful")


class TestUsers:
    """User endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DEMO_USER_EMAIL,
            "password": DEMO_USER_PASSWORD
        })
        return response.json()["token"]
    
    def test_search_users_empty_query(self, auth_token):
        """Test user search with empty query returns all users except self"""
        response = requests.get(f"{BASE_URL}/api/users/search?q=", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        assert isinstance(data["users"], list)
        # Should not include the logged-in user
        emails = [u["email"] for u in data["users"]]
        assert DEMO_USER_EMAIL not in emails
        print(f"✓ User search returned {len(data['users'])} users")
    
    def test_search_users_with_query(self, auth_token):
        """Test user search with specific query"""
        response = requests.get(f"{BASE_URL}/api/users/search?q=priya", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        # Should find Priya
        found = any(u["email"] == "priya@quantchat.com" for u in data["users"])
        assert found, "Priya should be found in search results"
        print("✓ User search with query works")
    
    def test_search_users_unauthorized(self):
        """Test user search without auth fails"""
        response = requests.get(f"{BASE_URL}/api/users/search?q=test")
        assert response.status_code == 401
        print("✓ Unauthorized user search rejected")
    
    def test_get_user_by_id(self, auth_token):
        """Test getting user by ID"""
        # First search to get a user ID
        search_resp = requests.get(f"{BASE_URL}/api/users/search?q=priya", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        users = search_resp.json()["users"]
        if users:
            user_id = users[0]["id"]
            response = requests.get(f"{BASE_URL}/api/users/{user_id}", headers={
                "Authorization": f"Bearer {auth_token}"
            })
            assert response.status_code == 200
            data = response.json()
            assert data["user"]["id"] == user_id
            print(f"✓ Get user by ID works")
        else:
            pytest.skip("No users found to test")


class TestConversations:
    """Conversation endpoint tests"""
    
    @pytest.fixture
    def auth_session(self):
        """Get auth token and user ID"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DEMO_USER_EMAIL,
            "password": DEMO_USER_PASSWORD
        })
        data = response.json()
        return data["token"], data["user"]["id"]
    
    def test_get_conversations(self, auth_session):
        """Test getting conversations list"""
        token, user_id = auth_session
        response = requests.get(f"{BASE_URL}/api/conversations", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "conversations" in data
        assert isinstance(data["conversations"], list)
        print(f"✓ Got {len(data['conversations'])} conversations")
    
    def test_get_conversations_unauthorized(self):
        """Test getting conversations without auth fails"""
        response = requests.get(f"{BASE_URL}/api/conversations")
        assert response.status_code == 401
        print("✓ Unauthorized conversations request rejected")
    
    def test_create_conversation(self, auth_session):
        """Test creating a new conversation"""
        token, user_id = auth_session
        
        # Find another user to chat with
        search_resp = requests.get(f"{BASE_URL}/api/users/search?q=priya", headers={
            "Authorization": f"Bearer {token}"
        })
        users = search_resp.json()["users"]
        if not users:
            pytest.skip("No other users found")
        
        other_user_id = users[0]["id"]
        
        # Create conversation
        response = requests.post(f"{BASE_URL}/api/conversations", json={
            "participant_id": other_user_id,
            "type": "direct"
        }, headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "conversation" in data
        assert data["conversation"]["type"] == "direct"
        assert "id" in data["conversation"]
        print(f"✓ Created conversation {data['conversation']['id']}")
        return data["conversation"]["id"]
    
    def test_create_conversation_nonexistent_user(self, auth_session):
        """Test creating conversation with non-existent user fails"""
        token, user_id = auth_session
        response = requests.post(f"{BASE_URL}/api/conversations", json={
            "participant_id": "000000000000000000000000",
            "type": "direct"
        }, headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 404
        print("✓ Conversation with non-existent user rejected")


class TestMessages:
    """Message endpoint tests"""
    
    @pytest.fixture
    def auth_and_conversation(self):
        """Get auth token and create/get a conversation"""
        # Login
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DEMO_USER_EMAIL,
            "password": DEMO_USER_PASSWORD
        })
        token = login_resp.json()["token"]
        user_id = login_resp.json()["user"]["id"]
        
        # Find another user
        search_resp = requests.get(f"{BASE_URL}/api/users/search?q=priya", headers={
            "Authorization": f"Bearer {token}"
        })
        users = search_resp.json()["users"]
        if not users:
            pytest.skip("No other users found")
        
        other_user_id = users[0]["id"]
        
        # Create/get conversation
        conv_resp = requests.post(f"{BASE_URL}/api/conversations", json={
            "participant_id": other_user_id,
            "type": "direct"
        }, headers={
            "Authorization": f"Bearer {token}"
        })
        conv_id = conv_resp.json()["conversation"]["id"]
        
        return token, conv_id
    
    def test_get_messages(self, auth_and_conversation):
        """Test getting messages from a conversation"""
        token, conv_id = auth_and_conversation
        response = requests.get(f"{BASE_URL}/api/conversations/{conv_id}/messages", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "messages" in data
        assert isinstance(data["messages"], list)
        print(f"✓ Got {len(data['messages'])} messages")
    
    def test_send_message(self, auth_and_conversation):
        """Test sending a message"""
        token, conv_id = auth_and_conversation
        test_content = f"Test message at {int(time.time())}"
        
        response = requests.post(f"{BASE_URL}/api/conversations/{conv_id}/messages", json={
            "content": test_content,
            "type": "text"
        }, headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data["message"]["content"] == test_content
        assert data["message"]["type"] == "text"
        assert "id" in data["message"]
        print(f"✓ Sent message: {test_content[:30]}...")
        
        # Verify message appears in conversation
        get_resp = requests.get(f"{BASE_URL}/api/conversations/{conv_id}/messages", headers={
            "Authorization": f"Bearer {token}"
        })
        messages = get_resp.json()["messages"]
        found = any(m["content"] == test_content for m in messages)
        assert found, "Sent message should appear in conversation"
        print("✓ Message persisted and retrievable")
    
    def test_send_message_unauthorized(self):
        """Test sending message without auth fails"""
        response = requests.post(f"{BASE_URL}/api/conversations/someconvid/messages", json={
            "content": "test",
            "type": "text"
        })
        assert response.status_code == 401
        print("✓ Unauthorized message send rejected")
    
    def test_get_messages_invalid_conversation(self):
        """Test getting messages from invalid conversation"""
        # Login first
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DEMO_USER_EMAIL,
            "password": DEMO_USER_PASSWORD
        })
        token = login_resp.json()["token"]
        
        response = requests.get(f"{BASE_URL}/api/conversations/000000000000000000000000/messages", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 404
        print("✓ Invalid conversation messages request rejected")


class TestStories:
    """Stories endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DEMO_USER_EMAIL,
            "password": DEMO_USER_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_stories(self, auth_token):
        """Test getting stories"""
        response = requests.get(f"{BASE_URL}/api/stories", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "stories" in data
        print(f"✓ Got stories endpoint working")
    
    def test_create_story(self, auth_token):
        """Test creating a story"""
        response = requests.post(f"{BASE_URL}/api/stories", json={
            "content": f"Test story at {int(time.time())}",
            "type": "text"
        }, headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "story" in data
        assert "id" in data["story"]
        print("✓ Story created successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
