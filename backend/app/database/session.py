from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel
from app.core.config import settings
from app.core.logging import logger

# Create engine
engine = create_engine(
    settings.database_url,
    echo=True,  # Set to False in production
    pool_pre_ping=True,
    pool_recycle=300,
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def get_db():
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """Create all database tables"""
    try:
        SQLModel.metadata.create_all(engine)
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Error creating database tables: {e}")
        raise


def drop_tables():
    """Drop all database tables (use with caution!)"""
    try:
        SQLModel.metadata.drop_all(engine)
        logger.warning("All database tables dropped")
    except Exception as e:
        logger.error(f"Error dropping database tables: {e}")
        raise


def check_pgvector_extension():
    """Check if pgvector extension is available"""
    try:
        with engine.connect() as connection:
            result = connection.execute(text("SELECT 1 FROM pg_extension WHERE extname = 'vector'"))
            exists = result.fetchone() is not None
            if exists:
                logger.info("pgvector extension is available")
            else:
                logger.warning("pgvector extension is not available")
            return exists
    except Exception as e:
        logger.error(f"Error checking pgvector extension: {e}")
        return False
