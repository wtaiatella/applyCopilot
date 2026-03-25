from typing import Dict, Any, Optional
from fastapi import UploadFile, HTTPException, status
from sqlalchemy.orm import Session
from app.services.document_parser import document_parser
from app.services.cv_extractor import cv_extractor
from app.services.cv_validator import cv_validator
from app.services.file_handler import file_handler
from app.database.models import User, Profile
from app.core.logging import logger


class CVProcessor:
    """Main CV processing service that integrates parsing, extraction, and validation"""
    
    def __init__(self):
        self.parser = document_parser
        self.extractor = cv_extractor
        self.validator = cv_validator
        self.file_handler = file_handler
    
    async def process_cv_upload(
        self, 
        file: UploadFile, 
        user_id: int,
        db: Session
    ) -> Dict[str, Any]:
        """Process uploaded CV file end-to-end"""
        
        try:
            logger.info(f"Starting CV processing for user {user_id}: {file.filename}")
            
            # Step 1: Save uploaded file
            file_info = await self.file_handler.save_file(file, user_id)
            logger.info(f"File saved: {file_info['file_path']}")
            
            # Step 2: Extract text from document
            raw_text = self.parser.extract_text(file_info['file_path'])
            cleaned_text = self.parser.clean_text(raw_text)
            logger.info(f"Text extracted: {len(cleaned_text)} characters")
            
            # Step 3: Extract structured data
            extracted_data = self.extractor.extract_all_data(cleaned_text)
            logger.info(f"Data extracted: {len(extracted_data.get('experience', []))} experiences, {len(extracted_data.get('skills', []))} skills")
            
            # Step 4: Validate and clean data
            validated_data = self.validator.validate_all_data(extracted_data)
            logger.info(f"Data validated: {len(validated_data.get('validation_errors', []))} errors")
            
            # Step 5: Get or create user profile
            profile = self._get_or_create_profile(user_id, db)
            
            # Step 6: Update profile with extracted data
            self._update_profile_from_cv_data(profile, validated_data, file_info, db)
            
            # Step 7: Generate processing summary
            processing_summary = self._generate_processing_summary(
                file_info, extracted_data, validated_data
            )
            
            logger.info(f"CV processing completed successfully for user {user_id}")
            
            return {
                'success': True,
                'profile_id': profile.id,
                'file_info': file_info,
                'extracted_data': extracted_data,
                'validated_data': validated_data,
                'processing_summary': processing_summary
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"CV processing error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error processing CV: {str(e)}"
            )
    
    def process_existing_file(
        self, 
        file_path: str, 
        user_id: int,
        db: Session
    ) -> Dict[str, Any]:
        """Process existing CV file"""
        
        try:
            logger.info(f"Processing existing CV file: {file_path}")
            
            # Verify file exists and belongs to user
            file_info = self.file_handler.get_file_info(file_path, user_id)
            if not file_info:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="File not found or access denied"
                )
            
            # Step 1: Extract text from document
            raw_text = self.parser.extract_text(file_path)
            cleaned_text = self.parser.clean_text(raw_text)
            logger.info(f"Text extracted: {len(cleaned_text)} characters")
            
            # Step 2: Extract structured data
            extracted_data = self.extractor.extract_all_data(cleaned_text)
            logger.info(f"Data extracted: {len(extracted_data.get('experience', []))} experiences, {len(extracted_data.get('skills', []))} skills")
            
            # Step 3: Validate and clean data
            validated_data = self.validator.validate_all_data(extracted_data)
            logger.info(f"Data validated: {len(validated_data.get('validation_errors', []))} errors")
            
            # Step 4: Get or create user profile
            profile = self._get_or_create_profile(user_id, db)
            
            # Step 5: Update profile with extracted data
            self._update_profile_from_cv_data(profile, validated_data, file_info, db)
            
            # Step 6: Generate processing summary
            processing_summary = self._generate_processing_summary(
                file_info, extracted_data, validated_data
            )
            
            logger.info(f"Existing CV file processing completed for user {user_id}")
            
            return {
                'success': True,
                'profile_id': profile.id,
                'file_info': file_info,
                'extracted_data': extracted_data,
                'validated_data': validated_data,
                'processing_summary': processing_summary
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Existing file processing error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error processing existing file: {str(e)}"
            )
    
    def get_processing_status(self, user_id: int, db: Session) -> Dict[str, Any]:
        """Get CV processing status for user"""
        
        try:
            profile = db.query(Profile).filter(Profile.user_id == user_id).first()
            
            if not profile:
                return {
                    'has_profile': False,
                    'has_cv': False,
                    'last_processed': None,
                    'processing_summary': None
                }
            
            # Get user files
            user_files = self.file_handler.list_user_files(user_id)
            
            return {
                'has_profile': True,
                'has_cv': bool(profile.cv_file_path),
                'profile_id': profile.id,
                'cv_file_path': profile.cv_file_path,
                'last_processed': profile.updated_at,
                'user_files': user_files,
                'processing_summary': {
                    'skills_count': len(profile.skills) if profile.skills else 0,
                    'has_contact_info': bool(
                        profile.phone or profile.linkedin_url or profile.github_url
                    ),
                    'has_summary': bool(profile.summary)
                }
            }
            
        except Exception as e:
            logger.error(f"Error getting processing status: {e}")
            return {
                'has_profile': False,
                'has_cv': False,
                'error': str(e)
            }
    
    def _get_or_create_profile(self, user_id: int, db: Session) -> Profile:
        """Get existing profile or create new one"""
        
        profile = db.query(Profile).filter(Profile.user_id == user_id).first()
        
        if not profile:
            profile = Profile(user_id=user_id)
            db.add(profile)
            db.commit()
            db.refresh(profile)
            logger.info(f"Created new profile for user {user_id}")
        
        return profile
    
    def _update_profile_from_cv_data(
        self, 
        profile: Profile, 
        validated_data: Dict[str, Any],
        file_info: Dict[str, Any],
        db: Session
    ):
        """Update profile with validated CV data"""
        
        try:
            # Update contact information
            contact_info = validated_data.get('contact_info', {})
            if contact_info.get('phone'):
                profile.phone = contact_info['phone']
            if contact_info.get('linkedin_url'):
                profile.linkedin_url = contact_info['linkedin_url']
            if contact_info.get('github_url'):
                profile.github_url = contact_info['github_url']
            
            # Update summary
            if validated_data.get('summary'):
                profile.summary = validated_data['summary']
            
            # Update skills
            if validated_data.get('skills'):
                profile.skills = validated_data['skills']
            
            # Update CV file information
            profile.cv_file_path = file_info['file_path']
            
            # Store raw text for future processing
            if 'raw_text' in validated_data:
                profile.cv_text = validated_data['raw_text'][:10000]  # Limit to 10k chars
            
            db.commit()
            db.refresh(profile)
            
            logger.info(f"Profile {profile.id} updated with CV data")
            
        except Exception as e:
            logger.error(f"Error updating profile: {e}")
            db.rollback()
            raise
    
    def _generate_processing_summary(
        self, 
        file_info: Dict[str, Any],
        extracted_data: Dict[str, Any],
        validated_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate processing summary"""
        
        return {
            'file_info': {
                'original_filename': file_info['original_filename'],
                'file_size': file_info['file_size'],
                'file_extension': file_info['file_extension']
            },
            'extraction_results': {
                'contact_info_found': bool(extracted_data.get('contact_info')),
                'name_found': bool(extracted_data.get('full_name')),
                'summary_found': bool(extracted_data.get('summary')),
                'education_count': len(extracted_data.get('education', [])),
                'experience_count': len(extracted_data.get('experience', [])),
                'projects_count': len(extracted_data.get('projects', [])),
                'skills_count': len(extracted_data.get('skills', []))
            },
            'validation_results': {
                'is_valid': validated_data.get('is_valid', False),
                'validation_errors_count': len(validated_data.get('validation_errors', [])),
                'validation_errors': validated_data.get('validation_errors', [])
            },
            'data_quality': {
                'completeness_score': self._calculate_completeness_score(validated_data),
                'confidence_score': self._calculate_confidence_score(validated_data)
            }
        }
    
    def _calculate_completeness_score(self, validated_data: Dict[str, Any]) -> float:
        """Calculate profile completeness score (0-100)"""
        
        score = 0
        max_score = 100
        
        # Contact info (30 points)
        contact_info = validated_data.get('contact_info', {})
        if contact_info.get('phone'):
            score += 10
        if contact_info.get('linkedin_url'):
            score += 10
        if contact_info.get('github_url'):
            score += 10
        
        # Summary (20 points)
        if validated_data.get('summary'):
            score += 20
        
        # Experience (25 points)
        experience = validated_data.get('experience', [])
        if experience:
            score += min(25, len(experience) * 5)
        
        # Education (15 points)
        education = validated_data.get('education', [])
        if education:
            score += min(15, len(education) * 5)
        
        # Skills (10 points)
        skills = validated_data.get('skills', [])
        if skills:
            score += min(10, len(skills))
        
        return round(score, 2)
    
    def _calculate_confidence_score(self, validated_data: Dict[str, Any]) -> float:
        """Calculate data confidence score (0-100)"""
        
        score = 100
        
        # Deduct points for validation errors
        validation_errors = validated_data.get('validation_errors', [])
        score -= len(validation_errors) * 5
        
        # Deduct points for missing critical data
        if not validated_data.get('contact_info'):
            score -= 20
        
        if not validated_data.get('summary'):
            score -= 15
        
        if not validated_data.get('experience'):
            score -= 25
        
        if not validated_data.get('skills'):
            score -= 10
        
        return max(0, round(score, 2))


# Global CV processor instance
cv_processor = CVProcessor()
