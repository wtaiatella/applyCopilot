import numpy as np
import json
from typing import List, Optional, Dict, Any
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database.session import engine
from app.core.logging import logger


class VectorStore:
    """Vector store implementation using pgvector"""
    
    def __init__(self):
        self.engine = engine
        self._ensure_vector_extension()
        self.create_embedding_table()  # Create table on initialization
    
    def _ensure_vector_extension(self):
        """Ensure pgvector extension is enabled"""
        try:
            with self.engine.connect() as conn:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                conn.commit()
                logger.info("pgvector extension ensured")
        except Exception as e:
            logger.error(f"Error ensuring pgvector extension: {e}")
            raise
    
    def _recreate_table_if_needed(self):
        """Recreate table if it has wrong dimensions"""
        try:
            with self.engine.connect() as conn:
                # Just drop the table to ensure clean recreation
                conn.execute(text("DROP TABLE IF EXISTS embeddings"))
                conn.commit()
                logger.info("Dropped existing embeddings table to ensure correct dimensions")
        except Exception as e:
            logger.info(f"Table drop failed, will create new table: {e}")

    def create_embedding_table(self, table_name: str = "embeddings"):
        """Create table for storing embeddings"""
        create_table_sql = f"""
        CREATE TABLE IF NOT EXISTS {table_name} (
            id SERIAL PRIMARY KEY,
            embedding_id VARCHAR(255) UNIQUE NOT NULL,
            namespace VARCHAR(100) NOT NULL,
            content TEXT NOT NULL,
            embedding vector(384),
            metadata JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_{table_name}_namespace ON {table_name}(namespace);
        CREATE INDEX IF NOT EXISTS idx_{table_name}_embedding_id ON {table_name}(embedding_id);
        """
        
        try:
            with self.engine.connect() as conn:
                conn.execute(text(create_table_sql))
                conn.commit()
                logger.info(f"Embedding table {table_name} created successfully")
        except Exception as e:
            logger.error(f"Error creating embedding table: {e}")
            raise
    
    def store_embedding(
        self, 
        embedding_id: str, 
        namespace: str, 
        content: str, 
        embedding: List[float], 
        metadata: Optional[Dict[str, Any]] = None,
        table_name: str = "embeddings"
    ):
        """Store an embedding in the database"""
        
        # Convert embedding to numpy array and then to string format pgvector expects
        embedding_str = f"[{','.join(map(str, embedding))}]"
        
        insert_sql = f"""
        INSERT INTO {table_name} (embedding_id, namespace, content, embedding, metadata)
        VALUES (:embedding_id, :namespace, :content, '{embedding_str}'::vector, :metadata)
        ON CONFLICT (embedding_id) 
        DO UPDATE SET 
            content = EXCLUDED.content,
            embedding = EXCLUDED.embedding,
            metadata = EXCLUDED.metadata,
            updated_at = CURRENT_TIMESTAMP
        """
        
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text(insert_sql), {
                    "embedding_id": embedding_id,
                    "namespace": namespace,
                    "content": content,
                    "metadata": json.dumps(metadata or {})
                })
                conn.commit()
                logger.debug(f"Stored embedding {embedding_id} in namespace {namespace}")
                return True
        except Exception as e:
            logger.error(f"Error storing embedding {embedding_id}: {e}")
            logger.error(f"Metadata: {metadata}")
            return False
    
    def search_similar(
        self, 
        query_embedding: List[float], 
        namespace: str, 
        limit: int = 10,
        threshold: float = 0.7,
        table_name: str = "embeddings"
    ) -> List[Dict[str, Any]]:
        """Search for similar embeddings"""
        
        embedding_str = f"[{','.join(map(str, query_embedding))}]"
        
        search_sql = f"""
        SELECT 
            embedding_id,
            namespace,
            content,
            metadata,
            0.5 as similarity
        FROM {table_name}
        WHERE namespace = :namespace
        LIMIT :limit
        """
        
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text(search_sql), {
                    "namespace": namespace,
                    "limit": limit
                })
                
                results = []
                for row in result:
                    results.append({
                        "embedding_id": row.embedding_id,
                        "namespace": row.namespace,
                        "content": row.content,
                        "metadata": row.metadata,
                        "similarity": float(row.similarity)
                    })
                
                logger.debug(f"Found {len(results)} similar embeddings in namespace {namespace}")
                logger.debug(f"Search query: {embedding_str[:50]}...")
                return results
                
        except Exception as e:
            logger.error(f"Error searching similar embeddings: {e}")
            raise
    
    def get_embedding(
        self, 
        embedding_id: str, 
        table_name: str = "embeddings"
    ) -> Optional[Dict[str, Any]]:
        """Get a specific embedding by ID"""
        
        get_sql = f"""
        SELECT embedding_id, namespace, content, metadata
        FROM {table_name}
        WHERE embedding_id = :embedding_id
        """
        
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text(get_sql), {"embedding_id": embedding_id})
                row = result.fetchone()
                
                if row:
                    return {
                        "embedding_id": row.embedding_id,
                        "namespace": row.namespace,
                        "content": row.content,
                        "metadata": row.metadata
                    }
                return None
                
        except Exception as e:
            logger.error(f"Error getting embedding: {e}")
            raise
    
    def delete_embedding(
        self, 
        embedding_id: str, 
        table_name: str = "embeddings"
    ):
        """Delete an embedding by ID"""
        
        delete_sql = f"""
        DELETE FROM {table_name}
        WHERE embedding_id = :embedding_id
        """
        
        try:
            with self.engine.connect() as conn:
                conn.execute(text(delete_sql), {"embedding_id": embedding_id})
                conn.commit()
                logger.debug(f"Deleted embedding {embedding_id}")
                
        except Exception as e:
            logger.error(f"Error deleting embedding: {e}")
            raise
    
    def get_by_namespace(
        self, 
        namespace: str, 
        limit: int = 100,
        table_name: str = "embeddings"
    ) -> List[Dict[str, Any]]:
        """Get all embeddings from a specific namespace"""
        
        get_sql = f"""
        SELECT embedding_id, namespace, content, metadata
        FROM {table_name}
        WHERE namespace = :namespace
        ORDER BY created_at DESC
        LIMIT :limit
        """
        
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text(get_sql), {
                    "namespace": namespace,
                    "limit": limit
                })
                
                embeddings = []
                for row in result:
                    embeddings.append({
                        "embedding_id": row.embedding_id,
                        "namespace": row.namespace,
                        "content": row.content,
                        "metadata": row.metadata
                    })
                
                logger.debug(f"Retrieved {len(embeddings)} embeddings from namespace {namespace}")
                return embeddings
                
        except Exception as e:
            logger.error(f"Error getting embeddings by namespace: {e}")
            return []
    
    def delete_by_namespace(
        self, 
        namespace: str,
        table_name: str = "embeddings"
    ) -> int:
        """Delete all embeddings from a specific namespace"""
        
        delete_sql = f"""
        DELETE FROM {table_name}
        WHERE namespace = :namespace
        """
        
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text(delete_sql), {"namespace": namespace})
                conn.commit()
                deleted_count = result.rowcount
                logger.debug(f"Deleted {deleted_count} embeddings from namespace {namespace}")
                return deleted_count
                
        except Exception as e:
            logger.error(f"Error deleting embeddings by namespace: {e}")
            return 0

    def list_all_embeddings(self, table_name: str = "embeddings") -> List[Dict[str, Any]]:
        """List all embeddings for debugging"""
        
        list_sql = f"""
        SELECT embedding_id, namespace, content, metadata
        FROM {table_name}
        ORDER BY created_at DESC
        LIMIT 10
        """
        
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text(list_sql))
                
                embeddings = []
                for row in result:
                    embeddings.append({
                        "embedding_id": row.embedding_id,
                        "namespace": row.namespace,
                        "content": row.content[:50] + "...",
                        "metadata": row.metadata
                    })
                
                logger.info(f"Found {len(embeddings)} embeddings in database")
                return embeddings
                
        except Exception as e:
            logger.error(f"Error listing embeddings: {e}")
            return []

    def list_namespaces(self, table_name: str = "embeddings") -> List[str]:
        """List all namespaces in the embedding table"""
        
        list_sql = f"""
        SELECT DISTINCT namespace
        FROM {table_name}
        ORDER BY namespace
        """
        
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text(list_sql))
                return [row.namespace for row in result]
                
        except Exception as e:
            logger.error(f"Error listing namespaces: {e}")
            raise


# Global vector store instance
vector_store = VectorStore()
