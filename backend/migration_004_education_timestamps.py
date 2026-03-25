from typing import List
from sqlalchemy import text
from app.database.session import engine
from app.core.logging import logger


def add_timestamps_to_education():
    """Add created_at and updated_at columns to education table"""
    logger.info("Adding timestamps to education table")
    
    try:
        with engine.connect() as conn:
            # Check if columns already exist
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'education' 
                AND column_name IN ('created_at', 'updated_at')
            """))
            existing_columns = [row[0] for row in result.fetchall()]
            
            # Add created_at column if it doesn't exist
            if 'created_at' not in existing_columns:
                conn.execute(text("""
                    ALTER TABLE education 
                    ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                """))
                logger.info("Added created_at column to education table")
            
            # Add updated_at column if it doesn't exist
            if 'updated_at' not in existing_columns:
                conn.execute(text("""
                    ALTER TABLE education 
                    ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                """))
                logger.info("Added updated_at column to education table")
            
            # Update existing rows with current timestamp
            if existing_columns:
                conn.execute(text("""
                    UPDATE education 
                    SET created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
                    WHERE created_at IS NULL OR updated_at IS NULL
                """))
                logger.info("Updated existing education records with timestamps")
            
            conn.commit()
            logger.info("Education table timestamps added successfully")
            
    except Exception as e:
        logger.error(f"Error adding timestamps to education table: {e}")
        raise


def run_migration():
    """Run the migration"""
    try:
        add_timestamps_to_education()
        logger.info("Migration 004_add_education_timestamps completed")
        return True
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        return False


if __name__ == "__main__":
    run_migration()
