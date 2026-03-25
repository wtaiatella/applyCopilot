from typing import Optional, List, Dict, Any
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship, Column, JSON


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    full_name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    profile: Optional["Profile"] = Relationship(back_populates="user")
    jobs: List["Job"] = Relationship(back_populates="user")


class Profile(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    
    # Personal data
    phone: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    
    # Professional data
    current_position: Optional[str] = None
    summary: Optional[str] = None
    skills: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    
    # Search preferences
    contract_types: List[str] = Field(default=[], sa_column=Column(JSON))  # CLT, PJ, freelance
    work_modality: List[str] = Field(default=[], sa_column=Column(JSON))   # remote, hybrid, in-person
    salary_range: Dict[str, float] = Field(default={}, sa_column=Column(JSON))  # min, max
    locations_of_interest: List[str] = Field(default=[], sa_column=Column(JSON))
    technologies_of_interest: List[str] = Field(default=[], sa_column=Column(JSON))
    
    # User relationship
    user_id: int = Field(foreign_key="user.id")
    user: User = Relationship(back_populates="profile")
    
    # Relationships with other entities
    educations: List["Education"] = Relationship(back_populates="profile")
    experiences: List["Experience"] = Relationship(back_populates="profile")
    projects: List["Project"] = Relationship(back_populates="profile")
    
    # Metadata
    cv_file_path: Optional[str] = None
    cv_text: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Education(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    institution: str
    degree: str
    field_of_study: str
    start_date: datetime
    end_date: Optional[datetime] = None
    description: Optional[str] = None
    technologies: List[str] = Field(default=[], sa_column=Column(JSON))
    personal_comments: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    profile_id: int = Field(foreign_key="profile.id")
    profile: Profile = Relationship(back_populates="educations")


class Experience(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    company: str
    position: str
    start_date: datetime
    end_date: Optional[datetime] = None
    is_current: bool = False
    
    # Descrição da empresa (2-3 linhas)
    company_description: str
    
    # Versões alternativas da descrição da empresa para diferentes contextos
    alternative_descriptions: List[Dict[str, Any]] = Field(default=[], sa_column=Column(JSON))
    # Exemplo: [{"text": "Empresa líder em fintech...", "context": "fintech", "is_selected": False}]
    
    # Lista de conquistas e responsabilidades (bullet points)
    achievements: List[Dict[str, Any]] = Field(default=[], sa_column=Column(JSON))
    # Estrutura: [{"text": "Desenvolvi sistema X que reduziu custos em 30%", 
    #              "is_selected": True, 
    #              "keywords": ["desenvolvimento", "redução de custos"],
    #              "created_at": "2023-01-01T00:00:00",
    #              "last_used_at": "2023-06-01T00:00:00"}]
    
    # Tecnologias utilizadas nesta experiência
    technologies: List[str] = Field(default=[], sa_column=Column(JSON))
    
    # Comentários pessoais para enriquecimento (não aparecem no CV)
    personal_comments: str = ""
    
    # Metadados para o sistema
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relacionamento com o perfil
    profile_id: int = Field(foreign_key="profile.id")
    profile: Profile = Relationship(back_populates="experiences")
    
    # Vetor embedding (para uso com pgvector)
    embedding_id: Optional[str] = None


class Project(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    url: Optional[str] = None
    github_url: Optional[str] = None
    
    # Descrição principal do projeto
    description: str
    
    # Versões alternativas da descrição
    alternative_descriptions: List[Dict[str, Any]] = Field(default=[], sa_column=Column(JSON))
    
    # Conquistas e características principais (bullet points)
    highlights: List[Dict[str, Any]] = Field(default=[], sa_column=Column(JSON))
    # Mesma estrutura dos achievements na Experience
    
    # Tecnologias utilizadas
    technologies: List[str] = Field(default=[], sa_column=Column(JSON))
    
    # Comentários pessoais para enriquecimento
    personal_comments: str = ""
    
    # Metadados
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relacionamento
    profile_id: int = Field(foreign_key="profile.id")
    profile: Profile = Relationship(back_populates="projects")
    
    # Vetor embedding
    embedding_id: Optional[str] = None


# Keeping the Job model to prepare for future phases
class Job(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(index=True)
    company: str = Field(index=True)
    company_url: Optional[str] = None
    company_location: Optional[str] = None
    job_location: Optional[str] = None
    job_type: Optional[str] = None
    salary: Optional[str] = None
    is_worldwide: Optional[bool] = None
    job_description_url: str = Field(unique=True)
    description: Optional[str] = None
    raw_markdown: Optional[str] = None
    status: str = Field(default="discovered")  # discovered, analyzed, applied, rejected
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    user: Optional[User] = Relationship(back_populates="jobs")
