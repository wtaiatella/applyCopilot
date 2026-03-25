from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class UserRegister(BaseModel):
    """Schema for user registration"""
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, description="User password (min 8 characters)")
    full_name: str = Field(..., min_length=2, description="User full name")


class UserLogin(BaseModel):
    """Schema for user login"""
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class UserResponse(BaseModel):
    """Schema for user response (without sensitive data)"""
    id: int
    email: str
    full_name: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class Token(BaseModel):
    """Schema for JWT token response"""
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenData(BaseModel):
    """Schema for token data"""
    email: Optional[str] = None


class UserUpdate(BaseModel):
    """Schema for user profile update"""
    full_name: Optional[str] = Field(None, min_length=2)
    
    class Config:
        from_attributes = True


class PasswordChange(BaseModel):
    """Schema for password change"""
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password (min 8 characters)")


# CV Processing Schemas

class FileInfo(BaseModel):
    """Schema for file information"""
    filename: str
    file_path: str
    original_filename: str
    file_size: int
    file_hash: str
    file_extension: str


class ContactInfo(BaseModel):
    """Schema for contact information"""
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None


class EducationEntry(BaseModel):
    """Schema for education entry"""
    degree: Optional[str] = None
    institution: Optional[str] = None
    dates: Optional[str] = None
    description: Optional[str] = None


class ExperienceEntry(BaseModel):
    """Schema for work experience entry"""
    position: Optional[str] = None
    company: Optional[str] = None
    dates: Optional[str] = None
    description: Optional[str] = None


class ProjectEntry(BaseModel):
    """Schema for project entry"""
    name: Optional[str] = None
    description: Optional[str] = None


class ExtractedCVData(BaseModel):
    """Schema for extracted CV data"""
    contact_info: Optional[Dict[str, str]] = None
    full_name: Optional[str] = None
    summary: Optional[str] = None
    education: List[Dict[str, Any]] = []
    experience: List[Dict[str, Any]] = []
    projects: List[Dict[str, Any]] = []
    skills: List[str] = []
    raw_text: Optional[str] = None
    extraction_timestamp: Optional[str] = None


class ValidatedCVData(BaseModel):
    """Schema for validated CV data"""
    contact_info: Optional[Dict[str, str]] = None
    full_name: Optional[str] = None
    summary: Optional[str] = None
    education: List[Dict[str, Any]] = []
    experience: List[Dict[str, Any]] = []
    projects: List[Dict[str, Any]] = []
    skills: List[str] = []
    validation_timestamp: Optional[str] = None
    validation_errors: List[str] = []
    is_valid: bool = False


class ProcessingSummary(BaseModel):
    """Schema for processing summary"""
    file_info: Dict[str, Any]
    extraction_results: Dict[str, Any]
    validation_results: Dict[str, Any]
    data_quality: Dict[str, Any]


class CVProcessingResponse(BaseModel):
    """Schema for CV processing response"""
    success: bool
    profile_id: Optional[int] = None
    file_info: Optional[FileInfo] = None
    extracted_data: Optional[ExtractedCVData] = None
    validated_data: Optional[ValidatedCVData] = None
    processing_summary: Optional[ProcessingSummary] = None


class ProcessingStatus(BaseModel):
    """Schema for processing status"""
    has_profile: bool
    has_cv: bool
    profile_id: Optional[int] = None
    cv_file_path: Optional[str] = None
    last_processed: Optional[datetime] = None
    user_files: List[Dict[str, Any]] = []
    processing_summary: Optional[Dict[str, Any]] = None


class ProfileResponse(BaseModel):
    """Schema for profile response"""
    id: int
    phone: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    current_position: Optional[str] = None
    summary: Optional[str] = None
    skills: Optional[List[str]] = None
    contract_types: Optional[List[str]] = None
    work_modality: Optional[List[str]] = None
    salary_range: Optional[Dict[str, Any]] = None
    locations_of_interest: Optional[List[str]] = None
    technologies_of_interest: Optional[List[str]] = None
    cv_file_path: Optional[str] = None
    cv_text: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    """Schema for profile update"""
    phone: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    current_position: Optional[str] = None
    summary: Optional[str] = None
    skills: Optional[List[str]] = None
    contract_types: Optional[List[str]] = None
    work_modality: Optional[List[str]] = None
    salary_range: Optional[Dict[str, Any]] = None
    locations_of_interest: Optional[List[str]] = None
    technologies_of_interest: Optional[List[str]] = None
    
    class Config:
        from_attributes = True


# CRUD Schemas for Education, Experience, Projects

class EducationCreate(BaseModel):
    """Schema for creating education entry"""
    institution: str = Field(..., min_length=2, description="Institution name")
    degree: str = Field(..., min_length=2, description="Degree or qualification")
    field_of_study: str = Field(..., min_length=2, description="Field of study")
    start_date: datetime = Field(..., description="Start date")
    end_date: Optional[datetime] = Field(None, description="End date (null if current)")
    description: Optional[str] = Field(None, description="Description of studies")
    technologies: Optional[List[str]] = Field(None, description="Technologies learned")
    personal_comments: str = Field(..., min_length=5, description="Personal comments")


class EducationUpdate(BaseModel):
    """Schema for updating education entry"""
    institution: Optional[str] = Field(None, min_length=2, description="Institution name")
    degree: Optional[str] = Field(None, min_length=2, description="Degree or qualification")
    field_of_study: Optional[str] = Field(None, min_length=2, description="Field of study")
    start_date: Optional[datetime] = Field(None, description="Start date")
    end_date: Optional[datetime] = Field(None, description="End date (null if current)")
    description: Optional[str] = Field(None, description="Description of studies")
    technologies: Optional[List[str]] = Field(None, description="Technologies learned")
    personal_comments: Optional[str] = Field(None, min_length=5, description="Personal comments")


class EducationResponse(BaseModel):
    """Schema for education response"""
    id: int
    institution: str
    degree: str
    field_of_study: str
    start_date: datetime
    end_date: Optional[datetime] = None
    description: Optional[str] = None
    technologies: Optional[List[str]] = None
    personal_comments: str
    profile_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ExperienceCreate(BaseModel):
    """Schema for creating experience entry"""
    company: str = Field(..., min_length=2, description="Company name")
    position: str = Field(..., min_length=2, description="Position/Role")
    start_date: datetime = Field(..., description="Start date")
    end_date: Optional[datetime] = Field(None, description="End date (null if current)")
    is_current: bool = Field(False, description="Whether this is current position")
    company_description: str = Field(..., min_length=10, description="Company description")
    alternative_descriptions: Optional[List[str]] = Field(None, description="Alternative descriptions")
    achievements: Optional[List[str]] = Field(None, description="Key achievements")
    technologies: Optional[List[str]] = Field(None, description="Technologies used")
    personal_comments: str = Field(..., min_length=5, description="Personal comments")


class ExperienceUpdate(BaseModel):
    """Schema for updating experience entry"""
    company: Optional[str] = Field(None, min_length=2, description="Company name")
    position: Optional[str] = Field(None, min_length=2, description="Position/Role")
    start_date: Optional[datetime] = Field(None, description="Start date")
    end_date: Optional[datetime] = Field(None, description="End date (null if current)")
    is_current: Optional[bool] = Field(None, description="Whether this is current position")
    company_description: Optional[str] = Field(None, min_length=10, description="Company description")
    alternative_descriptions: Optional[List[str]] = Field(None, description="Alternative descriptions")
    achievements: Optional[List[str]] = Field(None, description="Key achievements")
    technologies: Optional[List[str]] = Field(None, description="Technologies used")
    personal_comments: Optional[str] = Field(None, min_length=5, description="Personal comments")


class ExperienceResponse(BaseModel):
    """Schema for experience response"""
    id: int
    company: str
    position: str
    start_date: datetime
    end_date: Optional[datetime] = None
    is_current: bool
    company_description: str
    alternative_descriptions: Optional[List[str]] = None
    achievements: Optional[List[str]] = None
    technologies: Optional[List[str]] = None
    personal_comments: str
    profile_id: int
    embedding_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ProjectCreate(BaseModel):
    """Schema for creating project entry"""
    name: str = Field(..., min_length=2, description="Project name")
    start_date: Optional[datetime] = Field(None, description="Start date")
    end_date: Optional[datetime] = Field(None, description="End date")
    url: Optional[str] = Field(None, description="Project URL")
    github_url: Optional[str] = Field(None, description="GitHub repository URL")
    description: str = Field(..., min_length=10, description="Project description")
    alternative_descriptions: Optional[List[str]] = Field(None, description="Alternative descriptions")
    highlights: Optional[List[str]] = Field(None, description="Key highlights")
    technologies: Optional[List[str]] = Field(None, description="Technologies used")
    personal_comments: str = Field(..., min_length=5, description="Personal comments")


class ProjectUpdate(BaseModel):
    """Schema for updating project entry"""
    name: Optional[str] = Field(None, min_length=2, description="Project name")
    start_date: Optional[datetime] = Field(None, description="Start date")
    end_date: Optional[datetime] = Field(None, description="End date")
    url: Optional[str] = Field(None, description="Project URL")
    github_url: Optional[str] = Field(None, description="GitHub repository URL")
    description: Optional[str] = Field(None, min_length=10, description="Project description")
    alternative_descriptions: Optional[List[str]] = Field(None, description="Alternative descriptions")
    highlights: Optional[List[str]] = Field(None, description="Key highlights")
    technologies: Optional[List[str]] = Field(None, description="Technologies used")
    personal_comments: Optional[str] = Field(None, min_length=5, description="Personal comments")


class ProjectResponse(BaseModel):
    """Schema for project response"""
    id: int
    name: str
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    url: Optional[str] = None
    github_url: Optional[str] = None
    description: str
    alternative_descriptions: Optional[List[str]] = None
    highlights: Optional[List[str]] = None
    technologies: Optional[List[str]] = None
    personal_comments: str
    profile_id: int
    embedding_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# RAG Schemas

class RAGIndexRequest(BaseModel):
    """Schema for RAG indexing request"""
    profile_data: Dict[str, Any] = Field(..., description="Profile data to index")
    user_id: int = Field(..., description="User ID")


class RAGIndexResponse(BaseModel):
    """Schema for RAG indexing response"""
    success: bool
    user_id: int
    total_chunks: int
    stored_chunks: int
    namespaces: List[str]
    error: Optional[str] = None


class RAGSearchRequest(BaseModel):
    """Schema for RAG search request"""
    query: str = Field(..., min_length=2, description="Search query")
    user_id: int = Field(..., description="User ID")
    namespaces: Optional[List[str]] = Field(None, description="Namespaces to search")
    limit: int = Field(10, ge=1, le=100, description="Maximum number of results")
    threshold: float = Field(0.7, ge=0.0, le=1.0, description="Similarity threshold")


class RAGSearchResponse(BaseModel):
    """Schema for RAG search response"""
    query: str
    results: List[Dict[str, Any]]
    total_results: int
    search_time: float


class RAGContextRequest(BaseModel):
    """Schema for RAG context generation request"""
    query: str = Field(..., min_length=2, description="Query for context generation")
    user_id: int = Field(..., description="User ID")
    max_context_length: int = Field(2000, ge=100, le=5000, description="Maximum context length")
    namespaces: Optional[List[str]] = Field(None, description="Namespaces to include")


class RAGContextResponse(BaseModel):
    """Schema for RAG context response"""
    query: str
    context: str
    context_length: int
    sources_used: List[str]


class RAGSimilarProfilesRequest(BaseModel):
    """Schema for finding similar profiles request"""
    user_id: int = Field(..., description="User ID")
    target_user_id: Optional[int] = Field(None, description="Target user ID (optional)")
    limit: int = Field(5, ge=1, le=20, description="Maximum number of similar profiles")
    threshold: float = Field(0.6, ge=0.0, le=1.0, description="Similarity threshold")


class RAGSimilarProfilesResponse(BaseModel):
    """Schema for similar profiles response"""
    similar_profiles: List[Dict[str, Any]]
    total_found: int


class RAGGapAnalysisRequest(BaseModel):
    """Schema for profile gap analysis request"""
    user_id: int = Field(..., description="User ID")
    target_roles: List[str] = Field(..., description="Target roles to analyze")
    job_descriptions: Optional[List[str]] = Field(None, description="Job descriptions for analysis")


class RAGGapAnalysisResponse(BaseModel):
    """Schema for gap analysis response"""
    target_roles: List[str]
    user_skills: List[str]
    required_skills: List[str]
    missing_skills: List[str]
    existing_skills: List[str]
    match_percentage: float
    recommendations: List[str]


class RAGHybridSearchRequest(BaseModel):
    """Schema for hybrid search request"""
    query: str = Field(..., min_length=2, description="Search query")
    user_id: int = Field(..., description="User ID")
    namespaces: Optional[List[str]] = Field(None, description="Namespaces to search")
    limit: int = Field(10, ge=1, le=100, description="Maximum number of results")
    semantic_weight: float = Field(0.7, ge=0.0, le=1.0, description="Weight for semantic search")
    keyword_weight: float = Field(0.3, ge=0.0, le=1.0, description="Weight for keyword search")


class RAGHybridSearchResponse(BaseModel):
    """Schema for hybrid search response"""
    query: str
    results: List[Dict[str, Any]]
    total_results: int
    semantic_weight: float
    keyword_weight: float
    search_time: float
