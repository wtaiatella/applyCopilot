import os
import uuid
from typing import List, Dict, Any, Optional, Tuple
from sentence_transformers import SentenceTransformer
import numpy as np
from app.core.config import settings
from app.core.logging import logger


class EmbeddingService:
    """Service for generating and managing text embeddings"""
    
    def __init__(self):
        # Initialize embedding models
        self.primary_model = SentenceTransformer(settings.embedding_model)
        self.embedding_dim = self.primary_model.get_sentence_embedding_dimension()
        
        # Cache for embeddings to avoid recomputation
        self.embedding_cache = {}
        
        logger.info(f"Embedding service initialized with model: {settings.embedding_model}")
        logger.info(f"Embedding dimension: {self.embedding_dim}")
    
    def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for a single text"""
        try:
            # Check cache first
            cache_key = hash(text)
            if cache_key in self.embedding_cache:
                return self.embedding_cache[cache_key]
            
            # Generate embedding
            embedding = self.primary_model.encode(
                text,
                convert_to_numpy=True,
                normalize_embeddings=True  # L2 normalization
            )
            
            # Convert to list for storage
            embedding_list = embedding.tolist()
            
            # Cache the result
            self.embedding_cache[cache_key] = embedding_list
            
            return embedding_list
            
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            raise ValueError(f"Failed to generate embedding: {str(e)}")
    
    def generate_batch_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts efficiently"""
        try:
            # Filter out texts that are already cached
            uncached_texts = []
            uncached_indices = []
            embeddings = []
            
            for i, text in enumerate(texts):
                cache_key = hash(text)
                if cache_key in self.embedding_cache:
                    embeddings.append(self.embedding_cache[cache_key])
                else:
                    uncached_texts.append(text)
                    uncached_indices.append(i)
                    embeddings.append(None)  # Placeholder
            
            # Generate embeddings for uncached texts
            if uncached_texts:
                batch_embeddings = self.primary_model.encode(
                    uncached_texts,
                    convert_to_numpy=True,
                    normalize_embeddings=True,
                    batch_size=32,  # Process in batches
                    show_progress_bar=False
                )
                
                # Update cache and results
                for i, embedding in enumerate(batch_embeddings):
                    original_index = uncached_indices[i]
                    cache_key = hash(uncached_texts[i])
                    embedding_list = embedding.tolist()
                    
                    self.embedding_cache[cache_key] = embedding_list
                    embeddings[original_index] = embedding_list
            
            return embeddings
            
        except Exception as e:
            logger.error(f"Error generating batch embeddings: {e}")
            raise ValueError(f"Failed to generate batch embeddings: {str(e)}")
    
    def chunk_text(self, text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
        """Split text into chunks for embedding"""
        if not text or len(text) <= chunk_size:
            return [text] if text else []
        
        chunks = []
        start = 0
        
        while start < len(text):
            end = start + chunk_size
            
            # Don't split in the middle of a word if possible
            if end < len(text):
                # Try to find the last space before chunk_size
                last_space = text.rfind(' ', start, end)
                if last_space > start:
                    end = last_space + 1
            
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            
            start = end - overlap
        
        return chunks
    
    def calculate_similarity(self, embedding1: List[float], embedding2: List[float]) -> float:
        """Calculate cosine similarity between two embeddings"""
        try:
            # Convert to numpy arrays
            vec1 = np.array(embedding1)
            vec2 = np.array(embedding2)
            
            # Calculate cosine similarity
            dot_product = np.dot(vec1, vec2)
            norm1 = np.linalg.norm(vec1)
            norm2 = np.linalg.norm(vec2)
            
            if norm1 == 0 or norm2 == 0:
                return 0.0
            
            similarity = dot_product / (norm1 * norm2)
            return float(similarity)
            
        except Exception as e:
            logger.error(f"Error calculating similarity: {e}")
            return 0.0
    
    def find_most_similar(
        self, 
        query_embedding: List[float], 
        candidate_embeddings: List[List[float]],
        threshold: float = 0.7
    ) -> List[Tuple[int, float]]:
        """Find most similar embeddings to query"""
        try:
            similarities = []
            
            for i, candidate_embedding in enumerate(candidate_embeddings):
                similarity = self.calculate_similarity(query_embedding, candidate_embedding)
                if similarity >= threshold:
                    similarities.append((i, similarity))
            
            # Sort by similarity (descending)
            similarities.sort(key=lambda x: x[1], reverse=True)
            
            return similarities
            
        except Exception as e:
            logger.error(f"Error finding similar embeddings: {e}")
            return []
    
    def process_profile_for_embedding(
        self, 
        profile_data: Dict[str, Any], 
        user_id: int
    ) -> List[Dict[str, Any]]:
        """Process profile data for embedding generation"""
        chunks_data = []
        
        # Process experience chunks
        if 'experience' in profile_data:
            for exp in profile_data['experience']:
                exp_chunks = self._process_experience_chunk(exp, user_id)
                chunks_data.extend(exp_chunks)
        
        # Process project chunks
        if 'projects' in profile_data:
            for project in profile_data['projects']:
                proj_chunks = self._process_project_chunk(project, user_id)
                chunks_data.extend(proj_chunks)
        
        # Process education chunks
        if 'education' in profile_data:
            for edu in profile_data['education']:
                edu_chunks = self._process_education_chunk(edu, user_id)
                chunks_data.extend(edu_chunks)
        
        # Process skills
        if 'skills' in profile_data:
            skill_chunks = self._process_skills_chunk(profile_data['skills'], user_id)
            chunks_data.extend(skill_chunks)
        
        # Process summary
        if 'summary' in profile_data and profile_data['summary']:
            summary_chunks = self._process_summary_chunk(profile_data['summary'], user_id)
            chunks_data.extend(summary_chunks)
        
        logger.info(f"Processed {len(chunks_data)} chunks for user {user_id}")
        return chunks_data
    
    def _process_experience_chunk(self, experience: Dict[str, Any], user_id: int) -> List[Dict[str, Any]]:
        """Process single experience entry into chunks"""
        chunks = []
        
        # Create namespace
        namespace = f"experience_{user_id}"
        
        # Combine experience text
        exp_text = f"""
        Position: {experience.get('position', '')}
        Company: {experience.get('company', '')}
        Description: {experience.get('description', '')}
        Company Description: {experience.get('company_description', '')}
        """
        
        # Add achievements if available
        if experience.get('achievements'):
            achievements_text = " | ".join(experience['achievements'])
            exp_text += f"Achievements: {achievements_text}"
        
        # Add technologies if available
        if experience.get('technologies'):
            tech_text = ", ".join(experience['technologies'])
            exp_text += f"Technologies: {tech_text}"
        
        # Split into chunks
        text_chunks = self.chunk_text(exp_text, chunk_size=400, overlap=50)
        
        for i, chunk in enumerate(text_chunks):
            chunk_data = {
                'embedding_id': str(uuid.uuid4()),
                'namespace': namespace,
                'content': chunk,
                'metadata': {
                    'source_type': 'experience',
                    'source_id': experience.get('id'),
                    'user_id': user_id,
                    'chunk_index': i,
                    'total_chunks': len(text_chunks),
                    'company': experience.get('company'),
                    'position': experience.get('position'),
                    'technologies': experience.get('technologies', []),
                    'is_current': experience.get('is_current', False),
                    'dates': {
                        'start': str(experience.get('start_date')),
                        'end': str(experience.get('end_date'))
                    }
                }
            }
            chunks.append(chunk_data)
        
        return chunks
    
    def _process_project_chunk(self, project: Dict[str, Any], user_id: int) -> List[Dict[str, Any]]:
        """Process single project entry into chunks"""
        chunks = []
        
        namespace = f"projects_{user_id}"
        
        # Combine project text
        proj_text = f"""
        Project: {project.get('name', '')}
        Description: {project.get('description', '')}
        """
        
        # Add highlights if available
        if project.get('highlights'):
            highlights_text = " | ".join(project['highlights'])
            proj_text += f"Highlights: {highlights_text}"
        
        # Add technologies if available
        if project.get('technologies'):
            tech_text = ", ".join(project['technologies'])
            proj_text += f"Technologies: {tech_text}"
        
        # Add URLs if available
        if project.get('url'):
            proj_text += f"URL: {project['url']}"
        
        if project.get('github_url'):
            proj_text += f"GitHub: {project['github_url']}"
        
        # Split into chunks
        text_chunks = self.chunk_text(proj_text, chunk_size=300, overlap=30)
        
        for i, chunk in enumerate(text_chunks):
            chunk_data = {
                'embedding_id': str(uuid.uuid4()),
                'namespace': namespace,
                'content': chunk,
                'metadata': {
                    'source_type': 'project',
                    'source_id': project.get('id'),
                    'user_id': user_id,
                    'chunk_index': i,
                    'total_chunks': len(text_chunks),
                    'project_name': project.get('name'),
                    'technologies': project.get('technologies', []),
                    'urls': {
                        'project': project.get('url'),
                        'github': project.get('github_url')
                    },
                    'dates': {
                        'start': str(project.get('start_date')),
                        'end': str(project.get('end_date'))
                    }
                }
            }
            chunks.append(chunk_data)
        
        return chunks
    
    def _process_education_chunk(self, education: Dict[str, Any], user_id: int) -> List[Dict[str, Any]]:
        """Process single education entry into chunks"""
        chunks = []
        
        namespace = f"education_{user_id}"
        
        # Combine education text
        edu_text = f"""
        Institution: {education.get('institution', '')}
        Degree: {education.get('degree', '')}
        Field of Study: {education.get('field_of_study', '')}
        Description: {education.get('description', '')}
        """
        
        # Add technologies if available
        if education.get('technologies'):
            tech_text = ", ".join(education['technologies'])
            edu_text += f"Technologies: {tech_text}"
        
        # Split into chunks
        text_chunks = self.chunk_text(edu_text, chunk_size=250, overlap=25)
        
        for i, chunk in enumerate(text_chunks):
            chunk_data = {
                'embedding_id': str(uuid.uuid4()),
                'namespace': namespace,
                'content': chunk,
                'metadata': {
                    'source_type': 'education',
                    'source_id': education.get('id'),
                    'user_id': user_id,
                    'chunk_index': i,
                    'total_chunks': len(text_chunks),
                    'institution': education.get('institution'),
                    'degree': education.get('degree'),
                    'field_of_study': education.get('field_of_study'),
                    'technologies': education.get('technologies', []),
                    'dates': {
                        'start': str(education.get('start_date')),
                        'end': str(education.get('end_date'))
                    }
                }
            }
            chunks.append(chunk_data)
        
        return chunks
    
    def _process_skills_chunk(self, skills: List[str], user_id: int) -> List[Dict[str, Any]]:
        """Process skills into individual chunks"""
        chunks = []
        
        namespace = f"skills_{user_id}"
        
        for i, skill in enumerate(skills):
            chunk_data = {
                'embedding_id': str(uuid.uuid4()),
                'namespace': namespace,
                'content': f"Skill: {skill}",
                'metadata': {
                    'source_type': 'skill',
                    'user_id': user_id,
                    'chunk_index': i,
                    'total_chunks': len(skills),
                    'skill_name': skill
                }
            }
            chunks.append(chunk_data)
        
        return chunks
    
    def _process_summary_chunk(self, summary: str, user_id: int) -> List[Dict[str, Any]]:
        """Process profile summary into chunks"""
        chunks = []
        
        namespace = f"profile_{user_id}"
        
        # Split summary into smaller chunks
        text_chunks = self.chunk_text(summary, chunk_size=200, overlap=20)
        
        for i, chunk in enumerate(text_chunks):
            chunk_data = {
                'embedding_id': str(uuid.uuid4()),
                'namespace': namespace,
                'content': chunk,
                'metadata': {
                    'source_type': 'summary',
                    'user_id': user_id,
                    'chunk_index': i,
                    'total_chunks': len(text_chunks)
                }
            }
            chunks.append(chunk_data)
        
        return chunks
    
    def clear_cache(self):
        """Clear embedding cache"""
        self.embedding_cache.clear()
        logger.info("Embedding cache cleared")


# Global embedding service instance
embedding_service = EmbeddingService()
