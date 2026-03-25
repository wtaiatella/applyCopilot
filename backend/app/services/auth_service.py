from datetime import datetime, timedelta
from typing import Optional, Union
from jose import JWTError, jwt
import bcrypt
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.database.models import User
from app.database.session import get_db
from app.core.config import settings
from app.core.logging import logger
from app.api.schemas import UserRegister, UserLogin, TokenData


class AuthService:
    """Authentication service with security measures"""
    
    def __init__(self):
        self.secret_key = settings.secret_key
        self.algorithm = settings.algorithm
        self.access_token_expire_minutes = settings.access_token_expire_minutes
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash"""
        try:
            return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
        except Exception as e:
            logger.error(f"Password verification error: {e}")
            return False
    
    def get_password_hash(self, password: str) -> str:
        """Generate password hash"""
        try:
            # bcrypt has a 72 byte limit, truncate if necessary
            password_bytes = password.encode('utf-8')
            if len(password_bytes) > 72:
                password_bytes = password_bytes[:72]
            
            # Generate salt and hash
            salt = bcrypt.gensalt()
            hashed = bcrypt.hashpw(password_bytes, salt)
            return hashed.decode('utf-8')
        except Exception as e:
            logger.error(f"Password hashing error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error processing password"
            )
    
    def create_access_token(self, data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """Create JWT access token"""
        try:
            to_encode = data.copy()
            
            if expires_delta:
                expire = datetime.utcnow() + expires_delta
            else:
                expire = datetime.utcnow() + timedelta(minutes=self.access_token_expire_minutes)
            
            to_encode.update({"exp": expire})
            encoded_jwt = jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
            
            logger.debug(f"Access token created for user: {data.get('sub')}")
            return encoded_jwt
            
        except Exception as e:
            logger.error(f"Token creation error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error creating access token"
            )
    
    def verify_token(self, token: str) -> TokenData:
        """Verify JWT token and extract user data"""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            email: str = payload.get("sub")
            
            if email is None:
                logger.warning("Token missing subject (email)")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Could not validate credentials",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
            token_data = TokenData(email=email)
            return token_data
            
        except JWTError as e:
            logger.warning(f"JWT token validation error: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except Exception as e:
            logger.error(f"Token verification error: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
    
    def get_user_by_email(self, db: Session, email: str) -> Optional[User]:
        """Get user by email"""
        try:
            user = db.query(User).filter(User.email == email).first()
            return user
        except Exception as e:
            logger.error(f"Error getting user by email: {e}")
            return None
    
    def authenticate_user(self, db: Session, email: str, password: str) -> Optional[User]:
        """Authenticate user with email and password"""
        try:
            user = self.get_user_by_email(db, email)
            
            if not user:
                logger.warning(f"Authentication failed: user not found for email {email}")
                return None
            
            if not self.verify_password(password, user.password_hash):
                logger.warning(f"Authentication failed: invalid password for email {email}")
                return None
            
            logger.info(f"User authenticated successfully: {email}")
            return user
            
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            return None
    
    def create_user(self, db: Session, user_data: UserRegister) -> User:
        """Create a new user"""
        try:
            # Check if user already exists
            existing_user = self.get_user_by_email(db, user_data.email)
            if existing_user:
                logger.warning(f"Registration attempt with existing email: {user_data.email}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered"
                )
            
            # Hash password
            hashed_password = self.get_password_hash(user_data.password)
            
            # Create user
            db_user = User(
                email=user_data.email,
                password_hash=hashed_password,
                full_name=user_data.full_name,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            
            db.add(db_user)
            db.commit()
            db.refresh(db_user)
            
            logger.info(f"User created successfully: {user_data.email}")
            return db_user
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"User creation error: {e}")
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error creating user"
            )
    
    def login_user(self, db: Session, login_data: UserLogin) -> tuple[User, str]:
        """Login user and return user with token"""
        try:
            # Authenticate user
            user = self.authenticate_user(db, login_data.email, login_data.password)
            
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Incorrect email or password",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
            # Create access token
            access_token_expires = timedelta(minutes=self.access_token_expire_minutes)
            access_token = self.create_access_token(
                data={"sub": user.email}, expires_delta=access_token_expires
            )
            
            logger.info(f"User logged in successfully: {login_data.email}")
            return user, access_token
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Login error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error during login"
            )
    
    def change_password(self, db: Session, user: User, current_password: str, new_password: str) -> bool:
        """Change user password"""
        try:
            # Verify current password
            if not self.verify_password(current_password, user.password_hash):
                logger.warning(f"Password change failed: incorrect current password for user {user.email}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Incorrect current password"
                )
            
            # Check if new password is same as current
            if self.verify_password(new_password, user.password_hash):
                logger.warning(f"Password change failed: new password same as current for user {user.email}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="New password must be different from current password"
                )
            
            # Update password
            user.password_hash = self.get_password_hash(new_password)
            user.updated_at = datetime.utcnow()
            
            db.commit()
            db.refresh(user)
            
            logger.info(f"Password changed successfully for user: {user.email}")
            return True
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Password change error: {e}")
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error changing password"
            )


# Global auth service instance
auth_service = AuthService()
