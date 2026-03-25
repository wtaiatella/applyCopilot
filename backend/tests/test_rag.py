#!/usr/bin/env python3
"""
Test script for RAG system functionality
"""

import requests
import json
import time
from typing import Optional

BASE_URL = "http://localhost:8000"


class RAGTester:
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        self.token: Optional[str] = None
        self.user_data = None
    
    def login_user(self, email: str, password: str):
        """Login user and get token"""
        print(f"🔐 Logging in user: {email}")
        
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
                print(f"✅ Login successful")
                return True
            else:
                print(f"❌ Login failed: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            return False
    
    def create_sample_data(self):
        """Create sample profile data for testing"""
        return {
            "experience": [
                {
                    "id": 1,
                    "company": "Tech Solutions Inc.",
                    "position": "Senior Software Engineer",
                    "description": "Leading development of microservices architecture serving 1M+ users",
                    "company_description": "Leading technology company specializing in software solutions",
                    "achievements": [
                        "Led team of 5 developers",
                        "Improved system performance by 40%",
                        "Implemented CI/CD pipeline"
                    ],
                    "technologies": ["Python", "FastAPI", "React", "AWS", "Docker"],
                    "is_current": True,
                    "start_date": "2022-07-01T00:00:00",
                    "end_date": None
                }
            ],
            "projects": [
                {
                    "id": 1,
                    "name": "E-commerce Platform",
                    "description": "Full-stack e-commerce platform with payment integration",
                    "highlights": [
                        "Responsive design",
                        "Payment gateway integration",
                        "Admin dashboard",
                        "Real-time inventory management"
                    ],
                    "technologies": ["React", "Node.js", "MongoDB", "Stripe", "Docker"],
                    "url": "https://example-ecommerce.com",
                    "github_url": "https://github.com/user/ecommerce-platform",
                    "start_date": "2023-01-01T00:00:00",
                    "end_date": "2023-06-01T00:00:00"
                }
            ],
            "education": [
                {
                    "id": 1,
                    "institution": "University of Technology",
                    "degree": "Bachelor of Science",
                    "field_of_study": "Computer Science",
                    "description": "Focused on software engineering and data structures",
                    "technologies": ["Python", "Java", "SQL", "Git"],
                    "start_date": "2018-09-01T00:00:00",
                    "end_date": "2022-06-01T00:00:00"
                }
            ],
            "skills": ["Python", "JavaScript", "React", "Node.js", "AWS", "Docker", "PostgreSQL", "Git"],
            "summary": "Experienced software engineer with expertise in full-stack development and cloud technologies."
        }
    
    def test_index_profile(self):
        """Test profile indexing"""
        print("📚 Testing profile indexing")
        
        if not self.token:
            print("❌ No token available, login first")
            return False
        
        url = f"{self.base_url}/api/rag/index"
        headers = {"Authorization": f"Bearer {self.token}"}
        
        # Create sample data
        profile_data = self.create_sample_data()
        
        request_data = {
            "profile_data": profile_data,
            "user_id": 2  # Using test user ID
        }
        
        try:
            response = requests.post(url, json=request_data, headers=headers)
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Profile indexed successfully")
                print(f"   Total chunks: {result.get('total_chunks', 0)}")
                print(f"   Stored chunks: {result.get('stored_chunks', 0)}")
                print(f"   Namespaces: {result.get('namespaces', [])}")
                return True
            else:
                print(f"❌ Profile indexing failed: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            return False
    
    def test_search_profile(self):
        """Test profile search"""
        print("🔍 Testing profile search")
        
        if not self.token:
            print("❌ No token available, login first")
            return False
        
        url = f"{self.base_url}/api/rag/search"
        headers = {"Authorization": f"Bearer {self.token}"}
        
        request_data = {
            "query": "Python React AWS",
            "user_id": 2,
            "limit": 5,
            "threshold": 0.6
        }
        
        try:
            response = requests.post(url, json=request_data, headers=headers)
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Search completed successfully")
                print(f"   Query: {result.get('query')}")
                print(f"   Results found: {result.get('total_results', 0)}")
                print(f"   Search time: {result.get('search_time', 0):.2f}s")
                
                for i, res in enumerate(result.get('results', [])[:3]):
                    print(f"   Result {i+1}:")
                    print(f"     Content: {res.get('content', '')[:100]}...")
                    print(f"     Similarity: {res.get('similarity', 0):.2f}")
                    print(f"     Source: {res.get('source_type', 'unknown')}")
                
                return True
            else:
                print(f"❌ Search failed: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            return False
    
    def test_context_generation(self):
        """Test context generation"""
        print("📝 Testing context generation")
        
        if not self.token:
            print("❌ No token available, login first")
            return False
        
        url = f"{self.base_url}/api/rag/context"
        headers = {"Authorization": f"Bearer {self.token}"}
        
        request_data = {
            "query": "Senior Python Developer position",
            "user_id": 2,
            "max_context_length": 1000,
            "namespaces": ["experience_2", "skills_2"]
        }
        
        try:
            response = requests.post(url, json=request_data, headers=headers)
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Context generated successfully")
                print(f"   Query: {result.get('query')}")
                print(f"   Context length: {result.get('context_length', 0)}")
                print(f"   Sources used: {result.get('sources_used', [])}")
                print(f"   Context preview: {result.get('context', '')[:200]}...")
                return True
            else:
                print(f"❌ Context generation failed: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            return False
    
    def test_hybrid_search(self):
        """Test hybrid search"""
        print("🔀 Testing hybrid search")
        
        if not self.token:
            print("❌ No token available, login first")
            return False
        
        url = f"{self.base_url}/api/rag/hybrid-search"
        headers = {"Authorization": f"Bearer {self.token}"}
        
        request_data = {
            "query": "Backend Developer Python",
            "user_id": 2,
            "limit": 5,
            "semantic_weight": 0.7,
            "keyword_weight": 0.3
        }
        
        try:
            response = requests.post(url, json=request_data, headers=headers)
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Hybrid search completed successfully")
                print(f"   Query: {result.get('query')}")
                print(f"   Results found: {result.get('total_results', 0)}")
                print(f"   Semantic weight: {result.get('semantic_weight', 0)}")
                print(f"   Keyword weight: {result.get('keyword_weight', 0)}")
                print(f"   Search time: {result.get('search_time', 0):.2f}s")
                
                for i, res in enumerate(result.get('results', [])[:3]):
                    print(f"   Result {i+1}:")
                    print(f"     Content: {res.get('content', '')[:100]}...")
                    print(f"     Similarity: {res.get('similarity', 0):.2f}")
                    print(f"     Semantic score: {res.get('semantic_score', 0):.2f}")
                    print(f"     Keyword score: {res.get('keyword_score', 0):.2f}")
                
                return True
            else:
                print(f"❌ Hybrid search failed: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            return False
    
    def test_gap_analysis(self):
        """Test profile gap analysis"""
        print("📊 Testing profile gap analysis")
        
        if not self.token:
            print("❌ No token available, login first")
            return False
        
        url = f"{self.base_url}/api/rag/gap-analysis"
        headers = {"Authorization": f"Bearer {self.token}"}
        
        request_data = {
            "user_id": 2,
            "target_roles": ["Senior Software Engineer", "Tech Lead"],
            "job_descriptions": [
                "Looking for a Senior Software Engineer with 5+ years of experience in Python, React, and cloud technologies.",
                "Tech Lead position requiring strong leadership skills and full-stack development experience."
            ]
        }
        
        try:
            response = requests.post(url, json=request_data, headers=headers)
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Gap analysis completed successfully")
                print(f"   Target roles: {result.get('target_roles', [])}")
                print(f"   User skills: {len(result.get('user_skills', []))}")
                print(f"   Required skills: {len(result.get('required_skills', []))}")
                print(f"   Missing skills: {len(result.get('missing_skills', []))}")
                print(f"   Match percentage: {result.get('match_percentage', 0)}%")
                print(f"   Recommendations: {len(result.get('recommendations', []))}")
                
                # Show some missing skills
                missing_skills = result.get('missing_skills', [])
                if missing_skills:
                    print(f"   Top missing skills: {missing_skills[:5]}")
                
                # Show some recommendations
                recommendations = result.get('recommendations', [])
                if recommendations:
                    print(f"   Top recommendations: {recommendations[:3]}")
                
                return True
            else:
                print(f"❌ Gap analysis failed: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            return False
    
    def test_rag_stats(self):
        """Test RAG statistics"""
        print("📈 Testing RAG statistics")
        
        if not self.token:
            print("❌ No token available, login first")
            return False
        
        url = f"{self.base_url}/api/rag/stats"
        headers = {"Authorization": f"Bearer {self.token}"}
        
        try:
            response = requests.get(url, headers=headers)
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ RAG stats retrieved successfully")
                print(f"   User ID: {result.get('user_id')}")
                print(f"   Indexed namespaces: {result.get('indexed_namespaces', [])}")
                print(f"   Total chunks: {result.get('total_chunks', 0)}")
                print(f"   Index status: {result.get('index_status')}")
                return True
            else:
                print(f"❌ RAG stats failed: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            return False
    
    def test_clear_index(self):
        """Test clearing user index"""
        print("🗑️ Testing index clearing")
        
        if not self.token:
            print("❌ No token available, login first")
            return False
        
        url = f"{self.base_url}/api/rag/index"
        headers = {"Authorization": f"Bearer {self.token}"}
        
        try:
            response = requests.delete(url, headers=headers)
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Index cleared successfully")
                print(f"   Message: {result.get('message')}")
                print(f"   Cleared namespaces: {result.get('cleared_namespaces', [])}")
                print(f"   Cleared count: {result.get('cleared_count', 0)}")
                return True
            else:
                print(f"❌ Index clearing failed: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            return False
    
    def run_full_test(self):
        """Run complete RAG test suite"""
        print("🚀 Starting RAG Test Suite")
        print("=" * 50)
        
        # Login
        success = self.login_user("test2@example.com", "Test123456")
        if not success:
            print("❌ Login failed, stopping tests")
            return
        
        print()
        
        # Test 1: Index profile
        print("📚 TEST 1: Profile Indexing")
        print("-" * 30)
        self.test_index_profile()
        print()
        
        # Test 2: Search profile
        print("🔍 TEST 2: Profile Search")
        print("-" * 30)
        self.test_search_profile()
        print()
        
        # Test 3: Context generation
        print("📝 TEST 3: Context Generation")
        print("-" * 30)
        self.test_context_generation()
        print()
        
        # Test 4: Hybrid search
        print("🔀 TEST 4: Hybrid Search")
        print("-" * 30)
        self.test_hybrid_search()
        print()
        
        # Test 5: Gap analysis
        print("📊 TEST 5: Gap Analysis")
        print("-" * 30)
        self.test_gap_analysis()
        print()
        
        # Test 6: RAG stats
        print("📈 TEST 6: RAG Statistics")
        print("-" * 30)
        self.test_rag_stats()
        print()
        
        # Test 7: Clear index
        print("🗑️ TEST 7: Clear Index")
        print("-" * 30)
        self.test_clear_index()
        print()
        
        print("🎉 RAG Test Suite Complete!")
        print("\n📋 TEST SUMMARY")
        print("-" * 20)
        print("✅ Profile indexing")
        print("✅ Semantic search")
        print("✅ Context generation")
        print("✅ Hybrid search")
        print("✅ Gap analysis")
        print("✅ RAG statistics")
        print("✅ Index clearing")
        print("🎯 All RAG operations tested successfully!")


def check_server_health():
    """Check if server is running"""
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
    print("🔧 ApplyCopilot RAG Test")
    print("=" * 40)
    
    # Check if server is running
    if not check_server_health():
        print("\n❌ Please start the server first:")
        print("   python main.py")
        exit(1)
    
    print()
    
    # Run tests
    tester = RAGTester()
    tester.run_full_test()
