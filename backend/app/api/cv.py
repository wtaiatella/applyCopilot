from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status, Form
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.api.dependencies import get_current_active_user
from app.api.schemas import (
    CVProcessingResponse, ProcessingStatus, ProfileResponse, ProfileUpdate
)
from app.services.cv_processor import cv_processor
from app.database.models import User
from app.core.logging import logger


router = APIRouter(prefix="/api/cv", tags=["cv processing"])


@router.post("/upload", response_model=CVProcessingResponse)
async def upload_cv(
    file: UploadFile = File(...),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Upload and process CV file"""
    try:
        result = await cv_processor.process_cv_upload(file, user.id, db)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"CV upload error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing CV: {str(e)}"
        )


@router.post("/process-existing", response_model=CVProcessingResponse)
async def process_existing_cv(
    file_path: str = Form(...),
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Process existing CV file"""
    try:
        result = cv_processor.process_existing_file(file_path, user.id, db)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Existing CV processing error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing existing file: {str(e)}"
        )


@router.get("/status", response_model=ProcessingStatus)
async def get_cv_status(
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get CV processing status"""
    try:
        status = cv_processor.get_processing_status(user.id, db)
        return status
    except Exception as e:
        logger.error(f"CV status error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting CV status: {str(e)}"
        )


@router.get("/profile", response_model=ProfileResponse)
async def get_profile(
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get user profile"""
    try:
        from app.database.models import Profile
        
        profile = db.query(Profile).filter(Profile.user_id == user.id).first()
        
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found"
            )
        
        return profile
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get profile error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting profile: {str(e)}"
        )


@router.put("/profile", response_model=ProfileResponse)
async def update_profile(
    profile_update: ProfileUpdate,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update user profile"""
    try:
        from app.database.models import Profile
        
        profile = db.query(Profile).filter(Profile.user_id == user.id).first()
        
        if not profile:
            # Create profile if it doesn't exist
            profile = Profile(user_id=user.id)
            db.add(profile)
        
        # Update profile fields
        update_data = profile_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(profile, field, value)
        
        db.commit()
        db.refresh(profile)
        
        logger.info(f"Profile updated for user {user.id}")
        return profile
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update profile error: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating profile: {str(e)}"
        )


@router.get("/files")
async def list_cv_files(
    user: User = Depends(get_current_active_user)
):
    """List all CV files for user"""
    try:
        files = cv_processor.file_handler.list_user_files(user.id)
        return {"files": files}
    except Exception as e:
        logger.error(f"List files error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error listing files: {str(e)}"
        )


@router.delete("/files/{file_path:path}")
async def delete_cv_file(
    file_path: str,
    user: User = Depends(get_current_active_user)
):
    """Delete CV file"""
    try:
        success = cv_processor.file_handler.delete_file(file_path, user.id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found or could not be deleted"
            )
        
        return {"message": "File deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete file error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting file: {str(e)}"
        )


@router.get("/files/{file_path:path}/info")
async def get_file_info(
    file_path: str,
    user: User = Depends(get_current_active_user)
):
    """Get file information"""
    try:
        file_info = cv_processor.file_handler.get_file_info(file_path, user.id)
        
        if not file_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found"
            )
        
        return file_info
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get file info error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting file info: {str(e)}"
        )


@router.post("/cleanup")
async def cleanup_temp_files(
    user: User = Depends(get_current_active_user)
):
    """Clean up temporary files"""
    try:
        deleted_count = cv_processor.file_handler.cleanup_temp_files(user.id)
        return {"message": f"Cleaned up {deleted_count} temporary files"}
    except Exception as e:
        logger.error(f"Cleanup error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error cleaning up files: {str(e)}"
        )


@router.get("/storage-stats")
async def get_storage_stats(
    user: User = Depends(get_current_active_user)
):
    """Get storage statistics (admin only in future)"""
    try:
        stats = cv_processor.file_handler.get_storage_stats()
        return stats
    except Exception as e:
        logger.error(f"Storage stats error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting storage stats: {str(e)}"
        )
