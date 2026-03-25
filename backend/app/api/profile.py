from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database.session import get_db
from app.api.dependencies import get_current_active_user
from app.api.schemas import (
    EducationCreate, EducationUpdate, EducationResponse,
    ExperienceCreate, ExperienceUpdate, ExperienceResponse,
    ProjectCreate, ProjectUpdate, ProjectResponse
)
from app.database.models import User, Profile, Education, Experience, Project
from app.core.logging import logger


router = APIRouter(prefix="/api/profile", tags=["profile management"])


# Helper function to get user profile
def get_user_profile(user_id: int, db: Session) -> Profile:
    """Get or create user profile"""
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if not profile:
        profile = Profile(user_id=user_id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


# EDUCATION ENDPOINTS

@router.post("/education", response_model=EducationResponse, status_code=status.HTTP_201_CREATED)
async def create_education(
    education: EducationCreate,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create new education entry"""
    try:
        profile = get_user_profile(user.id, db)
        
        db_education = Education(
            profile_id=profile.id,
            institution=education.institution,
            degree=education.degree,
            field_of_study=education.field_of_study,
            start_date=education.start_date,
            end_date=education.end_date,
            description=education.description,
            technologies=education.technologies,
            personal_comments=education.personal_comments
        )
        
        db.add(db_education)
        db.commit()
        db.refresh(db_education)
        
        logger.info(f"Education created for user {user.id}: {education.institution}")
        return db_education
        
    except Exception as e:
        logger.error(f"Create education error: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error creating education entry"
        )


@router.get("/education", response_model=List[EducationResponse])
async def list_education(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List user's education entries"""
    try:
        profile = get_user_profile(user.id, db)
        
        education = db.query(Education)\
            .filter(Education.profile_id == profile.id)\
            .order_by(Education.start_date.desc())\
            .offset(skip)\
            .limit(limit)\
            .all()
        
        return education
        
    except Exception as e:
        logger.error(f"List education error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error listing education entries"
        )


@router.get("/education/{education_id}", response_model=EducationResponse)
async def get_education(
    education_id: int,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get specific education entry"""
    try:
        profile = get_user_profile(user.id, db)
        
        education = db.query(Education)\
            .filter(Education.id == education_id, Education.profile_id == profile.id)\
            .first()
        
        if not education:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Education entry not found"
            )
        
        return education
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get education error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error getting education entry"
        )


@router.put("/education/{education_id}", response_model=EducationResponse)
async def update_education(
    education_id: int,
    education_update: EducationUpdate,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update education entry"""
    try:
        profile = get_user_profile(user.id, db)
        
        education = db.query(Education)\
            .filter(Education.id == education_id, Education.profile_id == profile.id)\
            .first()
        
        if not education:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Education entry not found"
            )
        
        # Update fields
        update_data = education_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(education, field, value)
        
        db.commit()
        db.refresh(education)
        
        logger.info(f"Education updated for user {user.id}: {education.id}")
        return education
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update education error: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error updating education entry"
        )


@router.delete("/education/{education_id}")
async def delete_education(
    education_id: int,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete education entry"""
    try:
        profile = get_user_profile(user.id, db)
        
        education = db.query(Education)\
            .filter(Education.id == education_id, Education.profile_id == profile.id)\
            .first()
        
        if not education:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Education entry not found"
            )
        
        db.delete(education)
        db.commit()
        
        logger.info(f"Education deleted for user {user.id}: {education.id}")
        return {"message": "Education entry deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete education error: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error deleting education entry"
        )


# EXPERIENCE ENDPOINTS

@router.post("/experience", response_model=ExperienceResponse, status_code=status.HTTP_201_CREATED)
async def create_experience(
    experience: ExperienceCreate,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create new experience entry"""
    try:
        profile = get_user_profile(user.id, db)
        
        db_experience = Experience(
            profile_id=profile.id,
            company=experience.company,
            position=experience.position,
            start_date=experience.start_date,
            end_date=experience.end_date,
            is_current=experience.is_current,
            company_description=experience.company_description,
            alternative_descriptions=experience.alternative_descriptions,
            achievements=experience.achievements,
            technologies=experience.technologies,
            personal_comments=experience.personal_comments
        )
        
        db.add(db_experience)
        db.commit()
        db.refresh(db_experience)
        
        logger.info(f"Experience created for user {user.id}: {experience.company}")
        return db_experience
        
    except Exception as e:
        logger.error(f"Create experience error: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error creating experience entry"
        )


@router.get("/experience", response_model=List[ExperienceResponse])
async def list_experience(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List user's experience entries"""
    try:
        profile = get_user_profile(user.id, db)
        
        experience = db.query(Experience)\
            .filter(Experience.profile_id == profile.id)\
            .order_by(Experience.start_date.desc())\
            .offset(skip)\
            .limit(limit)\
            .all()
        
        return experience
        
    except Exception as e:
        logger.error(f"List experience error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error listing experience entries"
        )


@router.get("/experience/{experience_id}", response_model=ExperienceResponse)
async def get_experience(
    experience_id: int,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get specific experience entry"""
    try:
        profile = get_user_profile(user.id, db)
        
        experience = db.query(Experience)\
            .filter(Experience.id == experience_id, Experience.profile_id == profile.id)\
            .first()
        
        if not experience:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Experience entry not found"
            )
        
        return experience
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get experience error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error getting experience entry"
        )


@router.put("/experience/{experience_id}", response_model=ExperienceResponse)
async def update_experience(
    experience_id: int,
    experience_update: ExperienceUpdate,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update experience entry"""
    try:
        profile = get_user_profile(user.id, db)
        
        experience = db.query(Experience)\
            .filter(Experience.id == experience_id, Experience.profile_id == profile.id)\
            .first()
        
        if not experience:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Experience entry not found"
            )
        
        # Update fields
        update_data = experience_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(experience, field, value)
        
        db.commit()
        db.refresh(experience)
        
        logger.info(f"Experience updated for user {user.id}: {experience.id}")
        return experience
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update experience error: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error updating experience entry"
        )


@router.delete("/experience/{experience_id}")
async def delete_experience(
    experience_id: int,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete experience entry"""
    try:
        profile = get_user_profile(user.id, db)
        
        experience = db.query(Experience)\
            .filter(Experience.id == experience_id, Experience.profile_id == profile.id)\
            .first()
        
        if not experience:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Experience entry not found"
            )
        
        db.delete(experience)
        db.commit()
        
        logger.info(f"Experience deleted for user {user.id}: {experience.id}")
        return {"message": "Experience entry deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete experience error: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error deleting experience entry"
        )


# PROJECT ENDPOINTS

@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project: ProjectCreate,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create new project entry"""
    try:
        profile = get_user_profile(user.id, db)
        
        db_project = Project(
            profile_id=profile.id,
            name=project.name,
            start_date=project.start_date,
            end_date=project.end_date,
            url=project.url,
            github_url=project.github_url,
            description=project.description,
            alternative_descriptions=project.alternative_descriptions,
            highlights=project.highlights,
            technologies=project.technologies,
            personal_comments=project.personal_comments
        )
        
        db.add(db_project)
        db.commit()
        db.refresh(db_project)
        
        logger.info(f"Project created for user {user.id}: {project.name}")
        return db_project
        
    except Exception as e:
        logger.error(f"Create project error: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error creating project entry"
        )


@router.get("/projects", response_model=List[ProjectResponse])
async def list_projects(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List user's project entries"""
    try:
        profile = get_user_profile(user.id, db)
        
        projects = db.query(Project)\
            .filter(Project.profile_id == profile.id)\
            .order_by(Project.created_at.desc())\
            .offset(skip)\
            .limit(limit)\
            .all()
        
        return projects
        
    except Exception as e:
        logger.error(f"List projects error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error listing project entries"
        )


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get specific project entry"""
    try:
        profile = get_user_profile(user.id, db)
        
        project = db.query(Project)\
            .filter(Project.id == project_id, Project.profile_id == profile.id)\
            .first()
        
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project entry not found"
            )
        
        return project
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get project error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error getting project entry"
        )


@router.put("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    project_update: ProjectUpdate,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update project entry"""
    try:
        profile = get_user_profile(user.id, db)
        
        project = db.query(Project)\
            .filter(Project.id == project_id, Project.profile_id == profile.id)\
            .first()
        
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project entry not found"
            )
        
        # Update fields
        update_data = project_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(project, field, value)
        
        db.commit()
        db.refresh(project)
        
        logger.info(f"Project updated for user {user.id}: {project.id}")
        return project
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update project error: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error updating project entry"
        )


@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: int,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete project entry"""
    try:
        profile = get_user_profile(user.id, db)
        
        project = db.query(Project)\
            .filter(Project.id == project_id, Project.profile_id == profile.id)\
            .first()
        
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project entry not found"
            )
        
        db.delete(project)
        db.commit()
        
        logger.info(f"Project deleted for user {user.id}: {project.id}")
        return {"message": "Project entry deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete project error: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error deleting project entry"
        )
