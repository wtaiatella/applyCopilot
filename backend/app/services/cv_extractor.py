import re
from typing import Dict, List, Optional, Any
from datetime import datetime
from app.core.logging import logger


class CVDataExtractor:
    """Extract structured data from CV text"""
    
    def __init__(self):
        # Common patterns for CV parsing
        self.email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        self.phone_pattern = r'(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}'
        self.linkedin_pattern = r'linkedin\.com/in/[\w-]+'
        self.github_pattern = r'github\.com/[\w-]+'
        
        # Education keywords
        self.education_keywords = [
            'education', 'academic', 'university', 'college', 'degree', 
            'bachelor', 'master', 'phd', 'doctorate', 'diploma', 'certification'
        ]
        
        # Experience keywords
        self.experience_keywords = [
            'experience', 'work', 'employment', 'career', 'job', 'position',
            'professional', 'company', 'organization', 'role', 'responsibilities'
        ]
        
        # Project keywords
        self.project_keywords = [
            'projects', 'portfolio', 'work', 'development', 'created', 'built',
            'developed', 'designed', 'implemented', 'launched'
        ]
        
        # Skills keywords
        self.skills_keywords = [
            'skills', 'technologies', 'tools', 'programming', 'languages',
            'frameworks', 'libraries', 'software', 'expertise'
        ]
    
    def extract_contact_info(self, text: str) -> Dict[str, str]:
        """Extract contact information from CV text"""
        contact_info = {}
        
        # Extract email
        emails = re.findall(self.email_pattern, text, re.IGNORECASE)
        if emails:
            contact_info['email'] = emails[0].lower()
        
        # Extract phone numbers
        phones = re.findall(self.phone_pattern, text)
        if phones:
            contact_info['phone'] = phones[0]
        
        # Extract LinkedIn
        linkedin_matches = re.findall(self.linkedin_pattern, text, re.IGNORECASE)
        if linkedin_matches:
            contact_info['linkedin_url'] = f"https://www.{linkedin_matches[0]}"
        
        # Extract GitHub
        github_matches = re.findall(self.github_pattern, text, re.IGNORECASE)
        if github_matches:
            contact_info['github_url'] = f"https://www.{github_matches[0]}"
        
        return contact_info
    
    def extract_name(self, text: str) -> Optional[str]:
        """Extract candidate name from CV text"""
        lines = text.split('\n')
        
        # Usually the name is in the first few lines
        for i, line in enumerate(lines[:5]):
            line = line.strip()
            
            # Skip empty lines and lines with contact info
            if not line or re.search(self.email_pattern, line) or re.search(self.phone_pattern, line):
                continue
            
            # Skip lines that are too long (likely not a name)
            if len(line) > 50:
                continue
            
            # Look for lines that look like names (2-4 words, capitalized)
            words = line.split()
            if 2 <= len(words) <= 4:
                # Check if most words are capitalized
                capitalized_words = sum(1 for word in words if word[0].isupper())
                if capitalized_words >= len(words) * 0.7:
                    return line
        
        return None
    
    def extract_education(self, text: str) -> List[Dict[str, Any]]:
        """Extract education information"""
        education_entries = []
        
        # Split text into sections
        sections = self._split_into_sections(text)
        
        for section_title, section_content in sections:
            if any(keyword in section_title.lower() for keyword in self.education_keywords):
                entries = self._parse_education_section(section_content)
                education_entries.extend(entries)
        
        return education_entries
    
    def extract_experience(self, text: str) -> List[Dict[str, Any]]:
        """Extract work experience information"""
        experience_entries = []
        
        # Split text into sections
        sections = self._split_into_sections(text)
        
        for section_title, section_content in sections:
            if any(keyword in section_title.lower() for keyword in self.experience_keywords):
                entries = self._parse_experience_section(section_content)
                experience_entries.extend(entries)
        
        return experience_entries
    
    def extract_projects(self, text: str) -> List[Dict[str, Any]]:
        """Extract project information"""
        project_entries = []
        
        # Split text into sections
        sections = self._split_into_sections(text)
        
        for section_title, section_content in sections:
            if any(keyword in section_title.lower() for keyword in self.project_keywords):
                entries = self._parse_projects_section(section_content)
                project_entries.extend(entries)
        
        return project_entries
    
    def extract_skills(self, text: str) -> List[str]:
        """Extract skills from CV text"""
        skills = set()
        
        # Split text into sections
        sections = self._split_into_sections(text)
        
        for section_title, section_content in sections:
            if any(keyword in section_title.lower() for keyword in self.skills_keywords):
                section_skills = self._parse_skills_section(section_content)
                skills.update(section_skills)
        
        # Also look for skills throughout the document
        all_skills = self._extract_technical_skills(text)
        skills.update(all_skills)
        
        return list(skills)
    
    def extract_summary(self, text: str) -> Optional[str]:
        """Extract professional summary/objective"""
        lines = text.split('\n')
        
        # Look for summary in the first few lines
        summary_lines = []
        for i, line in enumerate(lines[:10]):
            line = line.strip()
            
            if not line:
                continue
            
            # Stop if we hit a section header
            if self._is_section_header(line):
                break
            
            # Skip if it's just contact info
            if re.search(self.email_pattern, line) or re.search(self.phone_pattern, line):
                continue
            
            summary_lines.append(line)
            
            # Stop if we have enough content
            if len(summary_lines) >= 3:
                break
        
        if summary_lines:
            summary = ' '.join(summary_lines)
            # Return if it looks like a summary (reasonable length)
            if 50 <= len(summary) <= 500:
                return summary
        
        return None
    
    def _split_into_sections(self, text: str) -> List[tuple[str, str]]:
        """Split CV text into sections"""
        sections = []
        lines = text.split('\n')
        current_section = ""
        current_title = "Introduction"
        
        for line in lines:
            line = line.strip()
            
            if self._is_section_header(line):
                # Save previous section
                if current_section.strip():
                    sections.append((current_title, current_section.strip()))
                
                # Start new section
                current_title = line
                current_section = ""
            else:
                current_section += line + "\n"
        
        # Add last section
        if current_section.strip():
            sections.append((current_title, current_section.strip()))
        
        return sections
    
    def _is_section_header(self, line: str) -> bool:
        """Check if a line is a section header"""
        # Common section header patterns
        header_patterns = [
            r'^[A-Z][A-Z\s]+$',  # ALL CAPS
            r'^[A-Z][a-zA-Z\s]+:$',  # Title Case with colon
            r'^[A-Z][a-zA-Z\s]+$',  # Title Case
        ]
        
        for pattern in header_patterns:
            if re.match(pattern, line) and len(line) < 50:
                return True
        
        return False
    
    def _parse_education_section(self, content: str) -> List[Dict[str, Any]]:
        """Parse education section content"""
        entries = []
        
        # Look for degree patterns
        degree_pattern = r'(Bachelor|Master|PhD|Doctorate|Associate|Diploma|Certificate)[^,\n]*'
        
        # Look for institution patterns
        institution_pattern = r'([A-Z][a-zA-Z\s&]+University|College|Institute|School)[^,\n]*'
        
        # Look for date patterns
        date_pattern = r'(\d{4}|\d{1,2}/\d{4}|\d{4}\s*-\s*\d{4}|\d{4}\s*-\s*Present)'
        
        lines = content.split('\n')
        current_entry = {}
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Check for degree
            degree_match = re.search(degree_pattern, line, re.IGNORECASE)
            if degree_match:
                if current_entry:
                    entries.append(current_entry)
                current_entry = {'degree': degree_match.group()}
                continue
            
            # Check for institution
            institution_match = re.search(institution_pattern, line, re.IGNORECASE)
            if institution_match and current_entry:
                current_entry['institution'] = institution_match.group()
                continue
            
            # Check for dates
            date_match = re.search(date_pattern, line)
            if date_match and current_entry:
                current_entry['dates'] = date_match.group()
                continue
            
            # Add other info as description
            if current_entry and 'description' not in current_entry:
                current_entry['description'] = line
        
        # Add last entry
        if current_entry:
            entries.append(current_entry)
        
        return entries
    
    def _parse_experience_section(self, content: str) -> List[Dict[str, Any]]:
        """Parse experience section content"""
        entries = []
        
        # Look for company/position patterns
        position_pattern = r'(Senior|Junior|Lead|Principal|Staff)[^,\n]*\s+(Engineer|Developer|Manager|Director|Analyst|Consultant|Specialist)'
        company_pattern = r'([A-Z][a-zA-Z\s&]+Inc|LLC|Corp|Corporation|Company|Ltd|Limited)[^,\n]*'
        
        # Look for date patterns
        date_pattern = r'(\d{4}\s*-\s*\d{4}|\d{4}\s*-\s*Present|\d{1,2}/\d{4}\s*-\s*\d{1,2}/\d{4})'
        
        lines = content.split('\n')
        current_entry = {}
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Check for position
            position_match = re.search(position_pattern, line, re.IGNORECASE)
            if position_match:
                if current_entry:
                    entries.append(current_entry)
                current_entry = {'position': line}
                continue
            
            # Check for company
            company_match = re.search(company_pattern, line, re.IGNORECASE)
            if company_match and current_entry:
                current_entry['company'] = company_match.group()
                continue
            
            # Check for dates
            date_match = re.search(date_pattern, line)
            if date_match and current_entry:
                current_entry['dates'] = date_match.group()
                continue
            
            # Add other info as description
            if current_entry and 'description' not in current_entry:
                current_entry['description'] = line
        
        # Add last entry
        if current_entry:
            entries.append(current_entry)
        
        return entries
    
    def _parse_projects_section(self, content: str) -> List[Dict[str, Any]]:
        """Parse projects section content"""
        projects = []
        
        lines = content.split('\n')
        current_project = {}
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Look for project names (usually start with capital letter and contain tech terms)
            if re.match(r'^[A-Z][a-zA-Z0-9\s\-_]+$', line) and len(line) < 100:
                if current_project:
                    projects.append(current_project)
                current_project = {'name': line}
                continue
            
            # Add other info as description
            if current_project and 'description' not in current_project:
                current_project['description'] = line
        
        # Add last project
        if current_project:
            projects.append(current_project)
        
        return projects
    
    def _parse_skills_section(self, content: str) -> List[str]:
        """Parse skills section content"""
        skills = []
        
        # Common skill separators
        separators = [',', ';', '•', '-', '|']
        
        for sep in separators:
            if sep in content:
                skills = [skill.strip() for skill in content.split(sep) if skill.strip()]
                break
        
        # If no separators found, split by newlines
        if not skills:
            skills = [skill.strip() for skill in content.split('\n') if skill.strip()]
        
        return skills
    
    def _extract_technical_skills(self, text: str) -> List[str]:
        """Extract technical skills from entire text"""
        # Common programming languages and technologies
        tech_keywords = [
            'Python', 'JavaScript', 'Java', 'C++', 'C#', 'Ruby', 'PHP', 'Go', 'Rust',
            'React', 'Angular', 'Vue', 'Node.js', 'Django', 'Flask', 'FastAPI', 'Spring',
            'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'Git', 'Linux',
            'SQL', 'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Elasticsearch',
            'Machine Learning', 'AI', 'Data Science', 'TensorFlow', 'PyTorch',
            'HTML', 'CSS', 'TypeScript', 'REST', 'GraphQL', 'Microservices'
        ]
        
        found_skills = []
        for keyword in tech_keywords:
            if re.search(r'\b' + re.escape(keyword) + r'\b', text, re.IGNORECASE):
                found_skills.append(keyword)
        
        return found_skills
    
    def extract_all_data(self, text: str) -> Dict[str, Any]:
        """Extract all structured data from CV text"""
        try:
            extracted_data = {
                'contact_info': self.extract_contact_info(text),
                'full_name': self.extract_name(text),
                'summary': self.extract_summary(text),
                'education': self.extract_education(text),
                'experience': self.extract_experience(text),
                'projects': self.extract_projects(text),
                'skills': self.extract_skills(text),
                'raw_text': text,
                'extraction_timestamp': datetime.utcnow().isoformat()
            }
            
            logger.info(f"Successfully extracted CV data: {len(extracted_data['experience'])} experiences, {len(extracted_data['skills'])} skills")
            return extracted_data
            
        except Exception as e:
            logger.error(f"Error extracting CV data: {e}")
            raise ValueError(f"Error extracting data from CV: {str(e)}")


# Global CV data extractor instance
cv_extractor = CVDataExtractor()
