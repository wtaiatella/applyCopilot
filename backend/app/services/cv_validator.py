import re
from typing import Dict, List, Any, Optional
from datetime import datetime, date
from app.core.logging import logger


class CVDataValidator:
    """Validate and clean extracted CV data"""
    
    def __init__(self):
        # Email validation pattern
        self.email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        
        # Phone validation pattern (basic)
        self.phone_pattern = r'^\+?[\d\s\-\(\)]{10,}$'
        
        # URL validation patterns
        self.url_pattern = r'^https?://[^\s/$.?#].[^\s]*$'
        
        # Common invalid words/phrases
        self.invalid_words = [
            'test', 'example', 'sample', 'demo', 'fake', 'placeholder',
            'n/a', 'none', 'not applicable', 'to be determined', 'tbd'
        ]
    
    def validate_contact_info(self, contact_info: Dict[str, str]) -> Dict[str, Any]:
        """Validate contact information"""
        validated = {}
        errors = []
        
        # Validate email
        if 'email' in contact_info:
            email = contact_info['email'].strip().lower()
            if re.match(self.email_pattern, email):
                validated['email'] = email
            else:
                errors.append("Invalid email format")
        
        # Validate phone
        if 'phone' in contact_info:
            phone = self._clean_phone_number(contact_info['phone'])
            if re.match(self.phone_pattern, phone):
                validated['phone'] = phone
            else:
                errors.append("Invalid phone format")
        
        # Validate URLs
        for url_field in ['linkedin_url', 'github_url', 'portfolio_url']:
            if url_field in contact_info:
                url = contact_info[url_field].strip()
                if not url.startswith(('http://', 'https://')):
                    url = 'https://' + url
                
                if re.match(self.url_pattern, url):
                    validated[url_field] = url
                else:
                    errors.append(f"Invalid {url_field} format")
        
        return {
            'validated_data': validated,
            'errors': errors
        }
    
    def validate_name(self, name: Optional[str]) -> Dict[str, Any]:
        """Validate candidate name"""
        if not name:
            return {'validated_data': None, 'errors': ['Name not found']}
        
        # Clean name
        cleaned_name = self._clean_text(name)
        
        # Basic validation
        if len(cleaned_name) < 2:
            return {'validated_data': None, 'errors': ['Name too short']}
        
        if len(cleaned_name) > 100:
            return {'validated_data': None, 'errors': ['Name too long']}
        
        # Check for invalid words
        if any(word.lower() in cleaned_name.lower() for word in self.invalid_words):
            return {'validated_data': None, 'errors': ['Name contains invalid words']}
        
        # Check if it looks like a name (at least 2 words, mostly letters)
        words = cleaned_name.split()
        if len(words) < 2:
            return {'validated_data': None, 'errors': ['Name should have at least 2 words']}
        
        letter_count = sum(1 for word in words if word.isalpha() or word.replace('-', '').isalpha())
        if letter_count < len(words) * 0.7:
            return {'validated_data': None, 'errors': ['Name format is invalid']}
        
        return {
            'validated_data': cleaned_name.title(),
            'errors': []
        }
    
    def validate_education(self, education_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Validate education entries"""
        validated_education = []
        errors = []
        
        for i, edu in enumerate(education_list):
            validated_entry = {}
            entry_errors = []
            
            # Validate degree
            if 'degree' in edu:
                degree = self._clean_text(edu['degree'])
                if len(degree) >= 3 and not self._contains_invalid_words(degree):
                    validated_entry['degree'] = degree
                else:
                    entry_errors.append(f"Education entry {i+1}: Invalid degree")
            
            # Validate institution
            if 'institution' in edu:
                institution = self._clean_text(edu['institution'])
                if len(institution) >= 3 and not self._contains_invalid_words(institution):
                    validated_entry['institution'] = institution
                else:
                    entry_errors.append(f"Education entry {i+1}: Invalid institution")
            
            # Validate dates
            if 'dates' in edu:
                dates = self._validate_dates(edu['dates'])
                if dates:
                    validated_entry['dates'] = dates
                else:
                    entry_errors.append(f"Education entry {i+1}: Invalid dates")
            
            # Validate description
            if 'description' in edu:
                description = self._clean_text(edu['description'])
                if len(description) >= 10:
                    validated_entry['description'] = description
                else:
                    entry_errors.append(f"Education entry {i+1}: Description too short")
            
            if validated_entry:
                validated_education.append(validated_entry)
            
            errors.extend(entry_errors)
        
        return {
            'validated_data': validated_education,
            'errors': errors
        }
    
    def validate_experience(self, experience_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Validate work experience entries"""
        validated_experience = []
        errors = []
        
        for i, exp in enumerate(experience_list):
            validated_entry = {}
            entry_errors = []
            
            # Validate position
            if 'position' in exp:
                position = self._clean_text(exp['position'])
                if len(position) >= 3 and not self._contains_invalid_words(position):
                    validated_entry['position'] = position
                else:
                    entry_errors.append(f"Experience entry {i+1}: Invalid position")
            
            # Validate company
            if 'company' in exp:
                company = self._clean_text(exp['company'])
                if len(company) >= 3 and not self._contains_invalid_words(company):
                    validated_entry['company'] = company
                else:
                    entry_errors.append(f"Experience entry {i+1}: Invalid company")
            
            # Validate dates
            if 'dates' in exp:
                dates = self._validate_dates(exp['dates'])
                if dates:
                    validated_entry['dates'] = dates
                else:
                    entry_errors.append(f"Experience entry {i+1}: Invalid dates")
            
            # Validate description
            if 'description' in exp:
                description = self._clean_text(exp['description'])
                if len(description) >= 20:
                    validated_entry['description'] = description
                else:
                    entry_errors.append(f"Experience entry {i+1}: Description too short")
            
            if validated_entry:
                validated_experience.append(validated_entry)
            
            errors.extend(entry_errors)
        
        return {
            'validated_data': validated_experience,
            'errors': errors
        }
    
    def validate_projects(self, project_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Validate project entries"""
        validated_projects = []
        errors = []
        
        for i, project in enumerate(project_list):
            validated_entry = {}
            entry_errors = []
            
            # Validate name
            if 'name' in project:
                name = self._clean_text(project['name'])
                if len(name) >= 3 and not self._contains_invalid_words(name):
                    validated_entry['name'] = name
                else:
                    entry_errors.append(f"Project entry {i+1}: Invalid name")
            
            # Validate description
            if 'description' in project:
                description = self._clean_text(project['description'])
                if len(description) >= 10:
                    validated_entry['description'] = description
                else:
                    entry_errors.append(f"Project entry {i+1}: Description too short")
            
            if validated_entry:
                validated_projects.append(validated_entry)
            
            errors.extend(entry_errors)
        
        return {
            'validated_data': validated_projects,
            'errors': errors
        }
    
    def validate_skills(self, skills_list: List[str]) -> Dict[str, Any]:
        """Validate skills list"""
        validated_skills = []
        errors = []
        
        for skill in skills_list:
            cleaned_skill = self._clean_text(skill)
            
            # Basic validation
            if (len(cleaned_skill) >= 2 and 
                len(cleaned_skill) <= 50 and 
                not self._contains_invalid_words(cleaned_skill)):
                
                # Remove duplicates
                if cleaned_skill.lower() not in [s.lower() for s in validated_skills]:
                    validated_skills.append(cleaned_skill)
            else:
                errors.append(f"Invalid skill: {skill}")
        
        return {
            'validated_data': validated_skills,
            'errors': errors
        }
    
    def validate_summary(self, summary: Optional[str]) -> Dict[str, Any]:
        """Validate professional summary"""
        if not summary:
            return {'validated_data': None, 'errors': []}
        
        cleaned_summary = self._clean_text(summary)
        
        # Basic validation
        if len(cleaned_summary) < 50:
            return {'validated_data': None, 'errors': ['Summary too short']}
        
        if len(cleaned_summary) > 1000:
            return {'validated_data': None, 'errors': ['Summary too long']}
        
        if self._contains_invalid_words(cleaned_summary):
            return {'validated_data': None, 'errors': ['Summary contains invalid words']}
        
        return {
            'validated_data': cleaned_summary,
            'errors': []
        }
    
    def validate_all_data(self, cv_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate all extracted CV data"""
        validated_data = {}
        all_errors = []
        
        # Validate contact info
        if 'contact_info' in cv_data:
            contact_result = self.validate_contact_info(cv_data['contact_info'])
            validated_data['contact_info'] = contact_result['validated_data']
            all_errors.extend(contact_result['errors'])
        
        # Validate name
        if 'full_name' in cv_data:
            name_result = self.validate_name(cv_data['full_name'])
            validated_data['full_name'] = name_result['validated_data']
            all_errors.extend(name_result['errors'])
        
        # Validate summary
        if 'summary' in cv_data:
            summary_result = self.validate_summary(cv_data['summary'])
            validated_data['summary'] = summary_result['validated_data']
            all_errors.extend(summary_result['errors'])
        
        # Validate education
        if 'education' in cv_data:
            education_result = self.validate_education(cv_data['education'])
            validated_data['education'] = education_result['validated_data']
            all_errors.extend(education_result['errors'])
        
        # Validate experience
        if 'experience' in cv_data:
            experience_result = self.validate_experience(cv_data['experience'])
            validated_data['experience'] = experience_result['validated_data']
            all_errors.extend(experience_result['errors'])
        
        # Validate projects
        if 'projects' in cv_data:
            projects_result = self.validate_projects(cv_data['projects'])
            validated_data['projects'] = projects_result['validated_data']
            all_errors.extend(projects_result['errors'])
        
        # Validate skills
        if 'skills' in cv_data:
            skills_result = self.validate_skills(cv_data['skills'])
            validated_data['skills'] = skills_result['validated_data']
            all_errors.extend(skills_result['errors'])
        
        # Add validation metadata
        validated_data['validation_timestamp'] = datetime.utcnow().isoformat()
        validated_data['validation_errors'] = all_errors
        validated_data['is_valid'] = len(all_errors) == 0
        
        logger.info(f"CV validation completed: {len(all_errors)} errors found")
        
        return validated_data
    
    def _clean_text(self, text: str) -> str:
        """Clean and normalize text"""
        if not text:
            return ""
        
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove special characters but keep basic punctuation
        text = re.sub(r'[^\w\s\-\.,;:!?@#$%&*()_+=\[\]{}|\\/"\'<>]', '', text)
        
        # Strip whitespace
        text = text.strip()
        
        return text
    
    def _clean_phone_number(self, phone: str) -> str:
        """Clean and normalize phone number"""
        # Remove all non-digit characters except + and parentheses
        phone = re.sub(r'[^\d\+\(\)\s\-]', '', phone)
        
        # Remove excessive spaces
        phone = re.sub(r'\s+', ' ', phone)
        
        return phone.strip()
    
    def _validate_dates(self, date_str: str) -> Optional[str]:
        """Validate date string"""
        if not date_str:
            return None
        
        # Common date patterns
        patterns = [
            r'\d{4}\s*-\s*\d{4}',  # 2020-2023
            r'\d{4}\s*-\s*Present',  # 2020-Present
            r'\d{1,2}/\d{4}\s*-\s*\d{1,2}/\d{4}',  # 01/2020-12/2023
            r'\d{4}',  # Single year
        ]
        
        for pattern in patterns:
            if re.match(pattern, date_str.strip()):
                return date_str.strip()
        
        return None
    
    def _contains_invalid_words(self, text: str) -> bool:
        """Check if text contains invalid words"""
        text_lower = text.lower()
        return any(word in text_lower for word in self.invalid_words)


# Global CV data validator instance
cv_validator = CVDataValidator()
