import os
import uuid
import hashlib
from pathlib import Path
from typing import Optional, Dict, Any, List
from fastapi import UploadFile, HTTPException, status
from app.core.config import settings
from app.core.logging import logger


class FileUploadHandler:
    """Handle secure file uploads with validation and storage"""
    
    def __init__(self):
        self.upload_dir = Path(settings.upload_dir)
        self.allowed_extensions = {'.pdf', '.docx', '.txt'}
        self.max_file_size = settings.max_file_size * 1024 * 1024  # Convert MB to bytes
        
        # Create upload directory if it doesn't exist
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        
        # Create subdirectories
        (self.upload_dir / "temp").mkdir(exist_ok=True)
        (self.upload_dir / "processed").mkdir(exist_ok=True)
    
    def validate_file(self, file: UploadFile) -> Dict[str, Any]:
        """Validate uploaded file"""
        validation_result = {
            'is_valid': False,
            'errors': [],
            'file_info': {}
        }
        
        try:
            # Check file extension
            if not file.filename:
                validation_result['errors'].append("No filename provided")
                return validation_result
            
            file_ext = Path(file.filename).suffix.lower()
            if file_ext not in self.allowed_extensions:
                validation_result['errors'].append(
                    f"File type not allowed. Allowed types: {', '.join(self.allowed_extensions)}"
                )
                return validation_result
            
            # Check file size
            if hasattr(file, 'size') and file.size:
                if file.size > self.max_file_size:
                    validation_result['errors'].append(
                        f"File too large. Maximum size: {settings.max_file_size}MB"
                    )
                    return validation_result
            
            # Check content type
            if file.content_type:
                allowed_types = {
                    '.pdf': ['application/pdf'],
                    '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
                    '.txt': ['text/plain', 'text/x-log', 'application/octet-stream']
                }
                
                file_types = allowed_types.get(file_ext, [])
                if file_types and file.content_type not in file_types:
                    # Log warning but don't fail for text files
                    if file_ext == '.txt':
                        logger.warning(f"Unexpected content type for TXT file: {file.content_type}")
                    else:
                        validation_result['errors'].append(
                            f"Content type mismatch for {file_ext} file"
                        )
                        return validation_result
            
            validation_result['is_valid'] = True
            validation_result['file_info'] = {
                'filename': file.filename,
                'extension': file_ext,
                'content_type': file.content_type,
                'size': getattr(file, 'size', 0)
            }
            
        except Exception as e:
            logger.error(f"File validation error: {e}")
            validation_result['errors'].append(f"Validation error: {str(e)}")
        
        return validation_result
    
    async def save_file(self, file: UploadFile, user_id: int) -> Dict[str, Any]:
        """Save uploaded file securely"""
        try:
            # Validate file first
            validation_result = self.validate_file(file)
            if not validation_result['is_valid']:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File validation failed: {'; '.join(validation_result['errors'])}"
                )
            
            # Generate unique filename
            file_ext = Path(file.filename).suffix.lower()
            unique_filename = f"{uuid.uuid4()}{file_ext}"
            
            # Create user-specific directory
            user_dir = self.upload_dir / str(user_id)
            user_dir.mkdir(parents=True, exist_ok=True)
            
            # Create temp directory
            temp_dir = user_dir / "temp"
            temp_dir.mkdir(parents=True, exist_ok=True)
            
            # File paths
            temp_path = temp_dir / unique_filename
            final_path = user_dir / unique_filename
            
            # Save file to temporary location first
            content = await file.read()
            
            # Double-check file size
            if len(content) > self.max_file_size:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File too large. Maximum size: {settings.max_file_size}MB"
                )
            
            # Calculate file hash for integrity check
            file_hash = hashlib.sha256(content).hexdigest()
            
            # Write file
            with open(temp_path, 'wb') as f:
                f.write(content)
            
            # Move to final location
            temp_path.rename(final_path)
            
            logger.info(f"File saved successfully: {final_path}")
            
            return {
                'success': True,
                'file_path': str(final_path),
                'filename': unique_filename,
                'original_filename': file.filename,
                'file_size': len(content),
                'file_hash': file_hash,
                'file_extension': file_ext
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"File save error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error saving file: {str(e)}"
            )
    
    def delete_file(self, file_path: str, user_id: int) -> bool:
        """Delete uploaded file"""
        try:
            path = Path(file_path)
            
            # Security check: ensure file is in user's directory
            user_dir = self.upload_dir / str(user_id)
            if not str(path).startswith(str(user_dir)):
                logger.warning(f"Attempted to delete file outside user directory: {file_path}")
                return False
            
            if path.exists():
                path.unlink()
                logger.info(f"File deleted: {file_path}")
                return True
            else:
                logger.warning(f"File not found for deletion: {file_path}")
                return False
                
        except Exception as e:
            logger.error(f"File deletion error: {e}")
            return False
    
    def get_file_info(self, file_path: str, user_id: int) -> Optional[Dict[str, Any]]:
        """Get file information"""
        try:
            path = Path(file_path)
            
            # Security check: ensure file is in user's directory
            user_dir = self.upload_dir / str(user_id)
            if not str(path).startswith(str(user_dir)):
                logger.warning(f"Attempted to access file outside user directory: {file_path}")
                return None
            
            if not path.exists():
                return None
            
            stat = path.stat()
            
            # Calculate file hash
            with open(path, 'rb') as f:
                content = f.read()
                file_hash = hashlib.sha256(content).hexdigest()
            
            return {
                'filename': path.name,
                'file_path': str(path),
                'file_size': stat.st_size,
                'file_hash': file_hash,
                'created_time': stat.st_ctime,
                'modified_time': stat.st_mtime,
                'extension': path.suffix.lower()
            }
            
        except Exception as e:
            logger.error(f"Error getting file info: {e}")
            return None
    
    def list_user_files(self, user_id: int) -> List[Dict[str, Any]]:
        """List all files for a user"""
        try:
            user_dir = self.upload_dir / str(user_id)
            if not user_dir.exists():
                return []
            
            files = []
            for file_path in user_dir.rglob('*'):
                if file_path.is_file() and file_path.parent.name != 'temp':
                    file_info = self.get_file_info(str(file_path), user_id)
                    if file_info:
                        files.append(file_info)
            
            # Sort by creation time (newest first)
            files.sort(key=lambda x: x['created_time'], reverse=True)
            
            return files
            
        except Exception as e:
            logger.error(f"Error listing user files: {e}")
            return []
    
    def cleanup_temp_files(self, user_id: int) -> int:
        """Clean up temporary files for a user"""
        try:
            temp_dir = self.upload_dir / str(user_id) / "temp"
            if not temp_dir.exists():
                return 0
            
            deleted_count = 0
            for file_path in temp_dir.iterdir():
                if file_path.is_file():
                    file_path.unlink()
                    deleted_count += 1
            
            logger.info(f"Cleaned up {deleted_count} temporary files for user {user_id}")
            return deleted_count
            
        except Exception as e:
            logger.error(f"Error cleaning up temp files: {e}")
            return 0
    
    def verify_file_integrity(self, file_path: str, expected_hash: str, user_id: int) -> bool:
        """Verify file integrity using hash"""
        try:
            file_info = self.get_file_info(file_path, user_id)
            if not file_info:
                return False
            
            return file_info['file_hash'] == expected_hash
            
        except Exception as e:
            logger.error(f"Error verifying file integrity: {e}")
            return False
    
    def get_storage_stats(self) -> Dict[str, Any]:
        """Get storage statistics"""
        try:
            total_size = 0
            file_count = 0
            
            for file_path in self.upload_dir.rglob('*'):
                if file_path.is_file():
                    total_size += file_path.stat().st_size
                    file_count += 1
            
            return {
                'total_files': file_count,
                'total_size_bytes': total_size,
                'total_size_mb': round(total_size / (1024 * 1024), 2),
                'upload_directory': str(self.upload_dir)
            }
            
        except Exception as e:
            logger.error(f"Error getting storage stats: {e}")
            return {
                'total_files': 0,
                'total_size_bytes': 0,
                'total_size_mb': 0,
                'upload_directory': str(self.upload_dir),
                'error': str(e)
            }


# Global file upload handler instance
file_handler = FileUploadHandler()
