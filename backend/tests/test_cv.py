#!/usr/bin/env python3
"""
Test script for CV processing system
"""

import requests
import json
from pathlib import Path
from typing import Optional

BASE_URL = "http://localhost:8000"


class CVTester:
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
    
    def upload_cv(self, file_path: str):
        """Upload CV file"""
        print(f"📄 Uploading CV: {file_path}")
        
        if not self.token:
            print("❌ No token available, login first")
            return False
        
        if not Path(file_path).exists():
            print(f"❌ File not found: {file_path}")
            return False
        
        url = f"{self.base_url}/api/cv/upload"
        headers = {"Authorization": f"Bearer {self.token}"}
        
        try:
            with open(file_path, 'rb') as f:
                files = {'file': (Path(file_path).name, f, 'application/octet-stream')}
                response = requests.post(url, headers=headers, files=files)
            
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ CV uploaded and processed successfully")
                print(f"   Profile ID: {result.get('profile_id')}")
                print(f"   File size: {result.get('file_info', {}).get('file_size', 0)} bytes")
                
                # Print extraction summary
                summary = result.get('processing_summary', {})
                extraction = summary.get('extraction_results', {})
                print(f"   Extraction results:")
                print(f"     - Contact info: {extraction.get('contact_info_found', False)}")
                print(f"     - Name found: {extraction.get('name_found', False)}")
                print(f"     - Education: {extraction.get('education_count', 0)} entries")
                print(f"     - Experience: {extraction.get('experience_count', 0)} entries")
                print(f"     - Projects: {extraction.get('projects_count', 0)} entries")
                print(f"     - Skills: {extraction.get('skills_count', 0)} skills")
                
                validation = summary.get('validation_results', {})
                print(f"   Validation results:")
                print(f"     - Is valid: {validation.get('is_valid', False)}")
                print(f"     - Errors: {validation.get('validation_errors_count', 0)}")
                
                quality = summary.get('data_quality', {})
                print(f"   Data quality:")
                print(f"     - Completeness: {quality.get('completeness_score', 0)}%")
                print(f"     - Confidence: {quality.get('confidence_score', 0)}%")
                
                return True
            else:
                print(f"❌ Upload failed: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            return False
    
    def get_cv_status(self):
        """Get CV processing status"""
        print("📊 Getting CV status")
        
        if not self.token:
            print("❌ No token available, login first")
            return False
        
        url = f"{self.base_url}/api/cv/status"
        headers = {"Authorization": f"Bearer {self.token}"}
        
        try:
            response = requests.get(url, headers=headers)
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                status = response.json()
                print(f"✅ CV status retrieved")
                print(f"   Has profile: {status.get('has_profile', False)}")
                print(f"   Has CV: {status.get('has_cv', False)}")
                print(f"   Profile ID: {status.get('profile_id')}")
                print(f"   Last processed: {status.get('last_processed')}")
                print(f"   User files: {len(status.get('user_files', []))}")
                
                processing_summary = status.get('processing_summary', {})
                if processing_summary:
                    print(f"   Processing summary:")
                    print(f"     - Skills count: {processing_summary.get('skills_count', 0)}")
                    print(f"     - Has contact info: {processing_summary.get('has_contact_info', False)}")
                    print(f"     - Has summary: {processing_summary.get('has_summary', False)}")
                
                return True
            else:
                print(f"❌ Status check failed: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            return False
    
    def get_profile(self):
        """Get user profile"""
        print("👤 Getting user profile")
        
        if not self.token:
            print("❌ No token available, login first")
            return False
        
        url = f"{self.base_url}/api/cv/profile"
        headers = {"Authorization": f"Bearer {self.token}"}
        
        try:
            response = requests.get(url, headers=headers)
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                profile = response.json()
                print(f"✅ Profile retrieved")
                print(f"   ID: {profile.get('id')}")
                print(f"   Phone: {profile.get('phone')}")
                print(f"   LinkedIn: {profile.get('linkedin_url')}")
                print(f"   GitHub: {profile.get('github_url')}")
                print(f"   Current position: {profile.get('current_position')}")
                print(f"   Skills: {len(profile.get('skills', []))} skills")
                
                if profile.get('summary'):
                    summary = profile['summary'][:100] + "..." if len(profile['summary']) > 100 else profile['summary']
                    print(f"   Summary: {summary}")
                
                return True
            else:
                print(f"❌ Profile retrieval failed: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            return False
    
    def list_files(self):
        """List user files"""
        print("📁 Listing user files")
        
        if not self.token:
            print("❌ No token available, login first")
            return False
        
        url = f"{self.base_url}/api/cv/files"
        headers = {"Authorization": f"Bearer {self.token}"}
        
        try:
            response = requests.get(url, headers=headers)
            print(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                files = result.get('files', [])
                print(f"✅ Found {len(files)} files")
                
                for file in files:
                    print(f"   - {file.get('filename')} ({file.get('file_size', 0)} bytes)")
                    print(f"     Extension: {file.get('extension')}")
                    print(f"     Created: {file.get('created_time')}")
                
                return True
            else:
                print(f"❌ File listing failed: {response.text}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Request error: {e}")
            return False
    
    def run_full_test(self, cv_file_path: str):
        """Run complete CV processing test"""
        print("🚀 Starting CV Processing Test Suite")
        print("=" * 50)
        
        # Login
        success = self.login_user("test2@example.com", "Test123456")
        if not success:
            print("❌ Login failed, stopping tests")
            return
        
        print()
        
        # Upload CV
        success = self.upload_cv(cv_file_path)
        if not success:
            print("❌ CV upload failed, stopping tests")
            return
        
        print()
        
        # Get status
        self.get_cv_status()
        print()
        
        # Get profile
        self.get_profile()
        print()
        
        # List files
        self.list_files()
        print()
        
        print("🎉 CV Processing Test Suite Complete!")


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


def create_sample_cv():
    """Create a sample CV file for testing"""
    sample_cv_content = """
John Doe
john.doe@email.com
+1 (555) 123-4567
linkedin.com/in/johndoe
github.com/johndoe

PROFESSIONAL SUMMARY
Experienced Software Engineer with 5+ years of experience in full-stack development,
specializing in Python, JavaScript, and cloud technologies. Passionate about building
scalable applications and leading development teams.

WORK EXPERIENCE

Senior Software Engineer | Tech Corp Inc. | 2020-Present
- Lead development of microservices architecture serving 1M+ users
- Implemented CI/CD pipelines reducing deployment time by 60%
- Mentored junior developers and conducted code reviews
- Developed REST APIs using FastAPI and Django

Software Engineer | StartupXYZ | 2018-2020
- Built responsive web applications using React and Node.js
- Designed and implemented database schemas with PostgreSQL
- Collaborated with cross-functional teams to deliver features
- Optimized application performance improving load time by 40%

EDUCATION

Bachelor of Science in Computer Science
University of Technology | 2014-2018
- GPA: 3.8/4.0
- Dean's List for 6 semesters
- Member of Computer Science Club

PROJECTS

E-commerce Platform | 2022
- Full-stack application using MERN stack
- Implemented payment integration with Stripe
- Deployed on AWS with Docker containers

Data Analytics Dashboard | 2021
- Real-time data visualization using D3.js
- Backend API with Python and FastAPI
- Database integration with MongoDB

SKILLS
Programming Languages: Python, JavaScript, Java, C++, SQL
Frameworks: React, Node.js, Django, FastAPI, Express
Databases: PostgreSQL, MongoDB, Redis, MySQL
Cloud: AWS, Docker, Kubernetes, Jenkins
Tools: Git, JIRA, Linux, Nginx
"""
    
    with open("sample_cv.txt", "w") as f:
        f.write(sample_cv_content)
    
    print("📄 Sample CV created: sample_cv.txt")
    return "sample_cv.txt"


if __name__ == "__main__":
    print("🔧 ApplyCopilot CV Processing Test")
    print("=" * 40)
    
    # Check if server is running
    if not check_server_health():
        print("\n❌ Please start the server first:")
        print("   python main.py")
        exit(1)
    
    print()
    
    # Create sample CV if needed
    cv_file = "sample_cv.txt"
    if not Path(cv_file).exists():
        cv_file = create_sample_cv()
    
    # Run tests
    tester = CVTester()
    tester.run_full_test(cv_file)
