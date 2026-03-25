from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.services.auth_service import auth_service
from app.database.models import User


# HTTP Bearer token scheme
security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user"""
    
    # Verify token
    token_data = auth_service.verify_token(credentials.credentials)
    
    # Get user from database
    user = auth_service.get_user_by_email(db, email=token_data.email)
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user


def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """Get current active user (can be extended with user status checks)"""
    
    # For now, all users are considered active
    # In the future, you can add checks like:
    # if not current_user.is_active:
    #     raise HTTPException(status_code=400, detail="Inactive user")
    
    return current_user


def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User | None:
    """Get current user if token is provided, otherwise return None"""
    
    try:
        # Verify token
        token_data = auth_service.verify_token(credentials.credentials)
        
        # Get user from database
        user = auth_service.get_user_by_email(db, email=token_data.email)
        
        return user
    except HTTPException:
        # If token is invalid or user not found, return None
        return None


# Role-based access (for future use)
def require_admin(current_user: User = Depends(get_current_active_user)) -> User:
    """Require admin role (placeholder for future implementation)"""
    
    # For now, we don't have roles, but this can be extended
    # if not current_user.is_admin:
    #     raise HTTPException(
    #         status_code=status.HTTP_403_FORBIDDEN,
    #         detail="Not enough permissions"
    #     )
    
    return current_user
