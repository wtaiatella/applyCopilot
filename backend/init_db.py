#!/usr/bin/env python3
"""
Database initialization script for ApplyCopilot
"""

import sys
import os
from pathlib import Path

# Add the backend directory to Python path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from app.database import migration, check_pgvector_extension
from app.core.logging import logger


def init_database():
    """Initialize the database with all tables and migrations"""
    try:
        logger.info("Starting database initialization...")
        
        # Check pgvector extension
        if not check_pgvector_extension():
            logger.error("pgvector extension is not available. Please install it first.")
            return False
        
        # Run migrations
        migration.run_migrations()
        
        logger.info("Database initialization completed successfully!")
        return True
        
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        return False


def reset_database():
    """Reset the entire database (use with caution!)"""
    try:
        logger.warning("WARNING: This will delete all data in the database!")
        confirm = input("Are you sure you want to continue? (yes/no): ")
        
        if confirm.lower() != "yes":
            logger.info("Database reset cancelled")
            return
        
        migration.reset_database()
        logger.warning("Database reset completed!")
        
    except Exception as e:
        logger.error(f"Database reset failed: {e}")


def check_database():
    """Check database status"""
    try:
        logger.info("Checking database status...")
        
        # Check pgvector
        pgvector_available = check_pgvector_extension()
        logger.info(f"pgvector extension: {'✅ Available' if pgvector_available else '❌ Not available'}")
        
        # Check migrations
        applied_migrations = migration._get_applied_migrations()
        total_migrations = len(migration.migrations)
        
        logger.info(f"Migrations: {len(applied_migrations)}/{total_migrations} applied")
        
        if len(applied_migrations) < total_migrations:
            pending = [name for name, _ in migration.migrations if name not in applied_migrations]
            logger.info(f"Pending migrations: {pending}")
        else:
            logger.info("✅ All migrations applied")
        
        return pgvector_available and len(applied_migrations) == total_migrations
        
    except Exception as e:
        logger.error(f"Database check failed: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python init_db.py [init|reset|check]")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "init":
        success = init_database()
        sys.exit(0 if success else 1)
    elif command == "reset":
        reset_database()
    elif command == "check":
        success = check_database()
        sys.exit(0 if success else 1)
    else:
        print(f"Unknown command: {command}")
        print("Usage: python init_db.py [init|reset|check]")
        sys.exit(1)
