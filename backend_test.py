import requests
import sys
from datetime import datetime

class QuantChatAPITester:
    def __init__(self, base_url="https://interface-upgrade-37.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.conversation_id = None
        self.message_id = None
        self.other_user_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        if headers is None:
            headers = {'Content-Type': 'application/json'}
        if self.token and 'Authorization' not in headers:
            headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    print(f"   Response: {response.text[:200]}")
                except:
                    pass
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health(self):
        """Test health endpoint"""
        success, response = self.run_test(
            "Health Check",
            "GET",
            "api/health",
            200
        )
        return success

    def test_login(self, email, password):
        """Test login and get token"""
        success, response = self.run_test(
            "Login",
            "POST",
            "api/auth/login",
            200,
            data={"email": email, "password": password}
        )
        if success and 'token' in response:
            self.token = response['token']
            if 'user' in response:
                self.user_id = response['user'].get('id')
            print(f"   Token obtained: {self.token[:20]}...")
            return True
        return False

    def test_register(self, name, email, password):
        """Test registration"""
        success, response = self.run_test(
            "Register",
            "POST",
            "api/auth/register",
            200,
            data={"name": name, "email": email, "password": password}
        )
        if success and 'token' in response:
            self.token = response['token']
            if 'user' in response:
                self.user_id = response['user'].get('id')
            return True
        return False

    def test_get_me(self):
        """Test get current user"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "api/auth/me",
            200
        )
        return success

    def test_search_users(self, query=""):
        """Test user search"""
        success, response = self.run_test(
            "Search Users",
            "GET",
            f"api/users/search?q={query}",
            200
        )
        if success and 'users' in response and len(response['users']) > 0:
            self.other_user_id = response['users'][0].get('id')
            print(f"   Found {len(response['users'])} users")
        return success

    def test_create_conversation(self):
        """Test creating a conversation"""
        if not self.other_user_id:
            print("⚠️  Skipping - No other user ID available")
            return False
        
        success, response = self.run_test(
            "Create Conversation",
            "POST",
            "api/conversations",
            200,
            data={"participant_id": self.other_user_id}
        )
        if success and 'conversation' in response:
            self.conversation_id = response['conversation'].get('id')
            print(f"   Conversation ID: {self.conversation_id}")
        return success

    def test_get_conversations(self):
        """Test getting conversations"""
        success, response = self.run_test(
            "Get Conversations",
            "GET",
            "api/conversations",
            200
        )
        if success and 'conversations' in response:
            print(f"   Found {len(response['conversations'])} conversations")
            if len(response['conversations']) > 0 and not self.conversation_id:
                self.conversation_id = response['conversations'][0].get('id')
        return success

    def test_send_message(self, content="Test message", msg_type="text", reply_to=None):
        """Test sending a message"""
        if not self.conversation_id:
            print("⚠️  Skipping - No conversation ID available")
            return False
        
        data = {"content": content, "type": msg_type}
        if reply_to:
            data["reply_to"] = reply_to
        
        success, response = self.run_test(
            "Send Message",
            "POST",
            f"api/conversations/{self.conversation_id}/messages",
            200,
            data=data
        )
        if success and 'message' in response:
            self.message_id = response['message'].get('id')
            print(f"   Message ID: {self.message_id}")
        return success

    def test_get_messages(self):
        """Test getting messages"""
        if not self.conversation_id:
            print("⚠️  Skipping - No conversation ID available")
            return False
        
        success, response = self.run_test(
            "Get Messages",
            "GET",
            f"api/conversations/{self.conversation_id}/messages",
            200
        )
        if success and 'messages' in response:
            print(f"   Found {len(response['messages'])} messages")
            if len(response['messages']) > 0 and not self.message_id:
                self.message_id = response['messages'][0].get('id')
        return success

    def test_edit_message(self, new_content="Edited message"):
        """Test editing a message"""
        if not self.message_id:
            print("⚠️  Skipping - No message ID available")
            return False
        
        success, response = self.run_test(
            "Edit Message",
            "PATCH",
            f"api/messages/{self.message_id}",
            200,
            data={"content": new_content}
        )
        return success

    def test_react_to_message(self, emoji="👍"):
        """Test reacting to a message"""
        if not self.message_id:
            print("⚠️  Skipping - No message ID available")
            return False
        
        success, response = self.run_test(
            "React to Message",
            "POST",
            f"api/messages/{self.message_id}/react",
            200,
            data={"emoji": emoji}
        )
        return success

    def test_forward_message(self):
        """Test forwarding a message"""
        if not self.message_id or not self.conversation_id:
            print("⚠️  Skipping - No message or conversation ID available")
            return False
        
        success, response = self.run_test(
            "Forward Message",
            "POST",
            f"api/messages/{self.message_id}/forward",
            200,
            data={"conversation_id": self.conversation_id}
        )
        return success

    def test_delete_message(self):
        """Test deleting a message"""
        if not self.message_id:
            print("⚠️  Skipping - No message ID available")
            return False
        
        success, response = self.run_test(
            "Delete Message",
            "DELETE",
            f"api/messages/{self.message_id}",
            200
        )
        return success

    def test_get_stories(self):
        """Test getting stories"""
        success, response = self.run_test(
            "Get Stories",
            "GET",
            "api/stories",
            200
        )
        return success

    def test_create_story(self):
        """Test creating a story"""
        success, response = self.run_test(
            "Create Story",
            "POST",
            "api/stories",
            200,
            data={"content": "Test story", "type": "text"}
        )
        return success

def main():
    print("=" * 60)
    print("QuantChat API Testing Suite")
    print("=" * 60)
    
    tester = QuantChatAPITester()
    
    # Test 1: Health Check
    if not tester.test_health():
        print("\n❌ Health check failed - Backend may be down")
        return 1
    
    # Test 2: Login with demo credentials
    test_email = "arjun@quantchat.com"
    test_password = "Demo@1234"
    
    if not tester.test_login(test_email, test_password):
        print("\n❌ Login failed - Cannot proceed with authenticated tests")
        return 1
    
    # Test 3: Get current user
    tester.test_get_me()
    
    # Test 4: Search users
    tester.test_search_users("priya")
    
    # Test 5: Get conversations
    tester.test_get_conversations()
    
    # Test 6: Create conversation
    tester.test_create_conversation()
    
    # Test 7: Send message
    tester.test_send_message("Hello, this is a test message!")
    
    # Test 8: Get messages
    tester.test_get_messages()
    
    # Test 9: Send message with reply
    if tester.message_id:
        tester.test_send_message("This is a reply", reply_to=tester.message_id)
    
    # Test 10: Edit message
    tester.test_edit_message("This message has been edited")
    
    # Test 11: React to message
    tester.test_react_to_message("❤️")
    
    # Test 12: Forward message
    tester.test_forward_message()
    
    # Test 13: Get stories
    tester.test_get_stories()
    
    # Test 14: Create story
    tester.test_create_story()
    
    # Test 15: Delete message (last test as it removes the message)
    tester.test_delete_message()
    
    # Print results
    print("\n" + "=" * 60)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    print("=" * 60)
    
    if tester.tests_passed == tester.tests_run:
        print("✅ All tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())
