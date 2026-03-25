from typing import List, Optional
from datetime import datetime
from sqlalchemy import text
from app.database.session import engine, get_db
from app.database.models import User, Profile, Education, Experience, Project, Job
from app.database.vector_store import vector_store
from app.core.logging import logger
from sqlmodel import SQLModel


class Migration:
    """Database migration system"""
    
    def __init__(self):
        self.engine = engine
        self.migrations = [
            ("001_initial_setup", self._initial_setup),
            ("002_create_vector_tables", self._create_vector_tables),
            ("003_add_indexes", self._add_indexes),
        ]
    
    def run_migrations(self):
        """Run all pending migrations"""
        logger.info("Starting database migrations")
        
        # Create migrations table if not exists
        self._create_migrations_table()
        
        # Get applied migrations
        applied_migrations = self._get_applied_migrations()
        
        # Run pending migrations
        for migration_name, migration_func in self.migrations:
            if migration_name not in applied_migrations:
                logger.info(f"Running migration: {migration_name}")
                try:
                    migration_func()
                    self._mark_migration_applied(migration_name)
                    logger.info(f"Migration {migration_name} completed successfully")
                except Exception as e:
                    logger.error(f"Migration {migration_name} failed: {e}")
                    raise
            else:
                logger.debug(f"Migration {migration_name} already applied")
        
        logger.info("All migrations completed")
    
    def _create_migrations_table(self):
        """Create table to track migrations"""
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS migrations (
            id SERIAL PRIMARY KEY,
            migration_name VARCHAR(255) UNIQUE NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
        
        try:
            with self.engine.connect() as conn:
                conn.execute(text(create_table_sql))
                conn.commit()
                logger.debug("Migrations table created/verified")
        except Exception as e:
            logger.error(f"Error creating migrations table: {e}")
            raise
    
    def _get_applied_migrations(self) -> set:
        """Get list of applied migrations"""
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text("SELECT migration_name FROM migrations"))
                return {row.migration_name for row in result}
        except Exception as e:
            logger.error(f"Error getting applied migrations: {e}")
            return set()
    
    def _mark_migration_applied(self, migration_name: str):
        """Mark a migration as applied"""
        try:
            with self.engine.connect() as conn:
                conn.execute(
                    text("INSERT INTO migrations (migration_name) VALUES (:migration_name)"),
                    {"migration_name": migration_name}
                )
                conn.commit()
        except Exception as e:
            logger.error(f"Error marking migration as applied: {e}")
            raise
    
    def _initial_setup(self):
        """Initial database setup"""
        logger.info("Creating initial database tables")
        
        # Create all SQLModel tables
        SQLModel.metadata.create_all(self.engine)
        
        # Insert sample data for testing (optional)
        self._insert_sample_data()
        
        logger.info("Initial setup completed")
    
    def _create_vector_tables(self):
        """Create vector-related tables"""
        logger.info("Creating vector tables")
        
        # Create embeddings table
        vector_store.create_embedding_table()
        
        logger.info("Vector tables created")
    
    def _add_indexes(self):
        """Add database indexes for performance"""
        logger.info("Adding database indexes")
        
        indexes = [
            "CREATE INDEX IF NOT EXISTS idx_user_email ON \"user\"(email)",
            "CREATE INDEX IF NOT EXISTS idx_profile_user_id ON profile(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_education_profile_id ON education(profile_id)",
            "CREATE INDEX IF NOT EXISTS idx_experience_profile_id ON experience(profile_id)",
            "CREATE INDEX IF NOT EXISTS idx_project_profile_id ON project(profile_id)",
            "CREATE INDEX IF NOT EXISTS idx_job_user_id ON job(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_job_title_company ON job(title, company)",
            "CREATE INDEX IF NOT EXISTS idx_experience_embedding_id ON experience(embedding_id)",
            "CREATE INDEX IF NOT EXISTS idx_project_embedding_id ON project(embedding_id)",
        ]
        
        try:
            with self.engine.connect() as conn:
                for index_sql in indexes:
                    conn.execute(text(index_sql))
                conn.commit()
                logger.info("Database indexes added")
        except Exception as e:
            logger.error(f"Error adding indexes: {e}")
            raise
    
    def _insert_sample_data(self):
        """Insert sample data for testing (optional)"""
        # This can be used for development/testing
        # Skip in production
        pass
    
    def rollback_migration(self, migration_name: str):
        """Rollback a specific migration (if rollback is implemented)"""
        logger.warning(f"Rollback requested for {migration_name}")
        # Implement rollback logic if needed
        pass
    
    def reset_database(self):
        """Reset entire database (use with caution!)"""
        logger.warning("Resetting entire database")
        
        try:
            # Drop all tables
            SQLModel.metadata.drop_all(self.engine)
            
            # Drop vector tables
            with self.engine.connect() as conn:
                conn.execute(text("DROP TABLE IF EXISTS embeddings CASCADE"))
                conn.execute(text("DROP TABLE IF EXISTS migrations CASCADE"))
                conn.commit()
            
            logger.warning("Database reset completed")
        except Exception as e:
            logger.error(f"Error resetting database: {e}")
            raise


# Global migration instance
migration = Migration()
