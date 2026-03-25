from typing import Optional, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    full_name: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    jobs: List["Job"] = Relationship(back_populates="user")

class Job(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(index=True)
    company: str = Field(index=True)
    companyURL
    companyLocation: Optional[str] = None
    jobLocation
    type
    salary
    isWorldWide
    jobDescriptionUrl: str = Field(unique=True)
    description: Optional[str] = None
    raw_markdown: Optional[str] = None
    status: str = Field(default="discovered") # discovered, analyzed, applied, rejected
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    user: Optional[User] = Relationship(back_populates="jobs")
    
    analysis: Optional["Analysis"] = Relationship(back_populates="job")

class Analysis(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    match_score: float
    strengths: str # Stored as JSON string or comma separated
    gaps: str # Stored as JSON string or comma separated
    recommendations: Optional[str] = None
    full_report: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    job_id: int = Field(foreign_key="job.id")
    job: Job = Relationship(back_populates="analysis")
