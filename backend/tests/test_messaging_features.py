"""
Test messaging features: Edit, Delete, React, Forward
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://app-check-deploy-1.preview.emergentagent.com').rstrip('/')

DEMO_USER_EMAIL = "arjun@quantchat.com"
DEMO_USER_PASSWORD = "Demo@1234"
DEMO_USER2_EMAIL = "priya@quantchat.com"
DEMO_USER2_PASSWORD = "Demo@1234"


class TestMessagingFeatures:
    """Test advanced messaging features"""
    
    @pytest.fixture
    def setup_conversation(self):
        """Setup: Login and create conversation with message"""
        # Login user 1
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DEMO_USER_EMAIL,
            "password": DEMO_USER_PASSWORD
        })
        token1 = login_resp.json()["token"]
        user1_id = login_resp.json()["user"]["id"]
        
        # Find user 2
        search_resp = requests.get(f"{BASE_URL}/api/users/search?q=priya", headers={
            "Authorization": f"Bearer {token1}"
        })
        users = search_resp.json()["users"]
        user2_id = users[0]["id"]
        
        # Create conversation
        conv_resp = requests.post(f"{BASE_URL}/api/conversations", json={
            "participant_id": user2_id,
            "type": "direct"
        }, headers={
            "Authorization": f"Bearer {token1}"
        })
        conv_id = conv_resp.json()["conversation"]["id"]
        
        # Send a test message
        msg_resp = requests.post(f"{BASE_URL}/api/conversations/{conv_id}/messages", json={
            "content": f"Original message {int(time.time())}",
            "type": "text"
        }, headers={
            "Authorization": f"Bearer {token1}"
        })
        msg_id = msg_resp.json()["message"]["id"]
        
        return token1, conv_id, msg_id
    
    def test_edit_message(self, setup_conversation):
        """Test editing a message"""
        token, conv_id, msg_id = setup_conversation
        
        # Edit the message
        edit_resp = requests.patch(f"{BASE_URL}/api/messages/{msg_id}", json={
            "content": "Edited message content"
        }, headers={
            "Authorization": f"Bearer {token}"
        })
        assert edit_resp.status_code == 200
        print("✓ Message edited successfully")
        
        # Verify the edit
        messages_resp = requests.get(f"{BASE_URL}/api/conversations/{conv_id}/messages", headers={
            "Authorization": f"Bearer {token}"
        })
        messages = messages_resp.json()["messages"]
        edited_msg = next((m for m in messages if m["id"] == msg_id), None)
        assert edited_msg is not None
        assert edited_msg["content"] == "Edited message content"
        assert edited_msg["is_edited"] == True
        print("✓ Message edit verified")
    
    def test_delete_message(self, setup_conversation):
        """Test deleting a message"""
        token, conv_id, msg_id = setup_conversation
        
        # Delete the message
        delete_resp = requests.delete(f"{BASE_URL}/api/messages/{msg_id}", headers={
            "Authorization": f"Bearer {token}"
        })
        assert delete_resp.status_code == 200
        print("✓ Message deleted successfully")
        
        # Verify deletion
        messages_resp = requests.get(f"{BASE_URL}/api/conversations/{conv_id}/messages", headers={
            "Authorization": f"Bearer {token}"
        })
        messages = messages_resp.json()["messages"]
        deleted_msg = next((m for m in messages if m["id"] == msg_id), None)
        assert deleted_msg is None
        print("✓ Message deletion verified")
    
    def test_react_to_message(self, setup_conversation):
        """Test reacting to a message"""
        token, conv_id, msg_id = setup_conversation
        
        # React with emoji
        react_resp = requests.post(f"{BASE_URL}/api/messages/{msg_id}/react", json={
            "emoji": "👍"
        }, headers={
            "Authorization": f"Bearer {token}"
        })
        assert react_resp.status_code == 200
        print("✓ Reaction added successfully")
        
        # Verify reaction
        messages_resp = requests.get(f"{BASE_URL}/api/conversations/{conv_id}/messages", headers={
            "Authorization": f"Bearer {token}"
        })
        messages = messages_resp.json()["messages"]
        reacted_msg = next((m for m in messages if m["id"] == msg_id), None)
        assert reacted_msg is not None
        assert "reactions" in reacted_msg
        print("✓ Reaction verified")
    
    def test_forward_message(self, setup_conversation):
        """Test forwarding a message"""
        token, conv_id, msg_id = setup_conversation
        
        # Find another user to forward to
        search_resp = requests.get(f"{BASE_URL}/api/users/search?q=rahul", headers={
            "Authorization": f"Bearer {token}"
        })
        users = search_resp.json()["users"]
        if not users:
            pytest.skip("No user found to forward to")
        
        user3_id = users[0]["id"]
        
        # Create conversation with user 3
        conv2_resp = requests.post(f"{BASE_URL}/api/conversations", json={
            "participant_id": user3_id,
            "type": "direct"
        }, headers={
            "Authorization": f"Bearer {token}"
        })
        conv2_id = conv2_resp.json()["conversation"]["id"]
        
        # Forward the message
        forward_resp = requests.post(f"{BASE_URL}/api/messages/{msg_id}/forward", json={
            "conversation_id": conv2_id
        }, headers={
            "Authorization": f"Bearer {token}"
        })
        assert forward_resp.status_code == 200
        forwarded_msg = forward_resp.json()["message"]
        assert forwarded_msg["forwarded"] == True
        print("✓ Message forwarded successfully")
        
        # Verify forwarded message appears in target conversation
        messages_resp = requests.get(f"{BASE_URL}/api/conversations/{conv2_id}/messages", headers={
            "Authorization": f"Bearer {token}"
        })
        messages = messages_resp.json()["messages"]
        found = any(m["forwarded"] == True for m in messages)
        assert found
        print("✓ Forwarded message verified in target conversation")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
