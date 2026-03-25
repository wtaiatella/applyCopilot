#!/usr/bin/env python3
"""
Test script for authentication endpoints
"""

import requests
import json
from typing import Optional

BASE_URL = "http://localhost:8000"


class AuthTester:
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        self.token: Optional[str] = None
        self.user_data = None
    
    def register_user(self, email: str, password: str, full_name: str):
        """Test user registration"""
        print(f"🔧 Testing user registration for: {email}")
        
        url = f"{self.base_url}/api/auth/register"
        data = {
            "email": email,
            "password": password,
            "full_name": full_name
        }
        
        try:
            response = requests.post(url, json=data)
            print(f"Status: {response.status_code}")
            
            if response.status_code == 201:
                self.user_data = response.json()
                print(f"✅ User registered: {self.user_data['email']}")
                return True
            else:
                print(f"❌ Registration failed: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            return False
    
    def login_user(self, email: str, password: str):
        """Test user login"""
        print(f"🔐 Testing user login for: {email}")
        
        url = f"{self.base_url}/api/auth/login"
        data = {
            "email": email,
            "password": password
        }
        
        try:
            response = requests.post(url, json=data)
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                token_data = response.json()
                self.token = token_data["access_token"]
                print(f"✅ Login successful, token received")
                return True
            else:
                print(f"❌ Login failed: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            return False
    
    def get_current_user(self):
        """Test getting current user info"""
        print("👤 Testing get current user")
        
        if not self.token:
            print("❌ No token available, login first")
            return False
        
        url = f"{self.base_url}/api/auth/me"
        headers = {"Authorization": f"Bearer {self.token}"}
        
        try:
            response = requests.get(url, headers=headers)
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                user_data = response.json()
                print(f"✅ Current user: {user_data['email']}")
                return True
            else:
                print(f"❌ Get user failed: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            return False
    
    def verify_token(self):
        """Test token verification"""
        print("🔍 Testing token verification")
        
        if not self.token:
            print("❌ No token available, login first")
            return False
        
        url = f"{self.base_url}/api/auth/verify-token"
        headers = {"Authorization": f"Bearer {self.token}"}
        
        try:
            response = requests.get(url, headers=headers)
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                token_data = response.json()
                print(f"✅ Token valid for user: {token_data['user']['email']}")
                return True
            else:
                print(f"❌ Token verification failed: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            return False
    
    def logout_user(self):
        """Test user logout"""
        print("🚪 Testing user logout")
        
        if not self.token:
            print("❌ No token available, login first")
            return False
        
        url = f"{self.base_url}/api/auth/logout"
        headers = {"Authorization": f"Bearer {self.token}"}
        
        try:
            response = requests.post(url, headers=headers)
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                print("✅ Logout successful")
                self.token = None
                return True
            else:
                print(f"❌ Logout failed: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            return False
    
    def run_full_test(self):
        """Run complete authentication test"""
        print("🚀 Starting Authentication Test Suite")
        print("=" * 50)
        
        test_email = "test2@example.com"
        test_password = "Test123456"
        test_full_name = "Test User"
        
        # Test registration
        success = self.register_user(test_email, test_password, test_full_name)
        if not success:
            print("❌ Registration failed, stopping tests")
            return
        
        print()
        
        # Test login
        success = self.login_user(test_email, test_password)
        if not success:
            print("❌ Login failed, stopping tests")
            return
        
        print()
        
        # Test get current user
        self.get_current_user()
        print()
        
        # Test token verification
        self.verify_token()
        print()
        
        # Test logout
        self.logout_user()
        print()
        
        # Test login again (to make sure it still works)
        print("🔄 Testing login again after logout...")
        self.login_user(test_email, test_password)
        print()
        
        print("🎉 Authentication Test Suite Complete!")


def check_server_health():
    """Check if the server is running"""
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        if response.status_code == 200:
            print("✅ Server is running")
            return True
        else:
            print(f"❌ Server returned status: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Server not accessible: {e}")
        return False


if __name__ == "__main__":
    print("🔧 ApplyCopilot Authentication Test")
    print("=" * 40)
    
    # Check if server is running
    if not check_server_health():
        print("\n❌ Please start the server first:")
        print("   python main.py")
        exit(1)
    
    print()
    
    # Run tests
    tester = AuthTester()
    tester.run_full_test()
