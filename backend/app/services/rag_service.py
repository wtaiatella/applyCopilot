import json
from typing import List, Dict, Any, Optional, Tuple
from app.services.simple_embedding_service import simple_embedding_service
from app.database.vector_store import vector_store
from app.core.logging import logger


class RAGService:
    """Retrieval-Augmented Generation service for intelligent search and context"""
    
    def __init__(self):
        self.embedding_service = simple_embedding_service
        self.vector_store = vector_store
        logger.info("RAG service initialized")
    
    def index_profile(self, profile_data: Dict[str, Any], user_id: int) -> Dict[str, Any]:
        """Index user profile data for RAG retrieval"""
        try:
            logger.info(f"Starting profile indexing for user {user_id}")
            
            # Process profile data into chunks
            chunks_data = self.embedding_service.process_profile_for_embedding(profile_data, user_id)
            
            # Generate embeddings for all chunks
            texts = [chunk['content'] for chunk in chunks_data]
            embeddings = self.embedding_service.generate_batch_embeddings(texts)
            
            # Store in vector database
            stored_count = 0
            for i, chunk_data in enumerate(chunks_data):
                if i < len(embeddings):
                    chunk_data['embedding'] = embeddings[i]
                    
                    success = self.vector_store.store_embedding(
                        embedding_id=chunk_data['embedding_id'],
                        namespace=chunk_data['namespace'],
                        content=chunk_data['content'],
                        embedding=chunk_data['embedding'],
                        metadata=chunk_data['metadata']
                    )
                    
                    if success:
                        stored_count += 1
                    else:
                        logger.warning(f"Failed to store chunk {i} in namespace {chunk_data['namespace']}")
            
            result = {
                'success': True,
                'user_id': user_id,
                'total_chunks': len(chunks_data),
                'stored_chunks': stored_count,
                'namespaces': list(set(chunk['namespace'] for chunk in chunks_data))
            }
            
            logger.info(f"Profile indexing completed: {stored_count}/{len(chunks_data)} chunks stored")
            return result
            
        except Exception as e:
            logger.error(f"Error indexing profile: {e}")
            return {
                'success': False,
                'error': str(e),
                'user_id': user_id,
                'total_chunks': 0,
                'stored_chunks': 0,
                'namespaces': []
            }
    
    def search_profile(
        self, 
        query: str, 
        user_id: int,
        namespaces: Optional[List[str]] = None,
        limit: int = 10,
        threshold: float = 0.7
    ) -> List[Dict[str, Any]]:
        """Search user profile using semantic search"""
        try:
            logger.info(f"Searching profile for user {user_id} with query: {query}")
            
            # Generate query embedding
            query_embedding = self.embedding_service.generate_embedding(query)
            
            # Default namespaces for user profile
            if not namespaces:
                namespaces = [
                    f"experience_{user_id}",
                    f"projects_{user_id}",
                    f"education_{user_id}",
                    f"skills_{user_id}",
                    f"profile_{user_id}"
                ]
            
            # Search in vector store
            results = []
            for namespace in namespaces:
                logger.debug(f"Searching in namespace: {namespace}")
                namespace_results = self.vector_store.search_similar(
                    query_vector=query_embedding,
                    namespace=namespace,
                    limit=limit,
                    threshold=threshold
                )
                logger.debug(f"Found {len(namespace_results)} results in namespace {namespace}")
                
                # Add namespace info to results
                for result in namespace_results:
                    result['namespace'] = namespace
                    result['source_type'] = result.get('metadata', {}).get('source_type', 'unknown')
                
                results.extend(namespace_results)
            
            # Sort by similarity score and limit results
            results.sort(key=lambda x: x.get('similarity', 0), reverse=True)
            results = results[:limit]
            
            logger.info(f"Search completed: found {len(results)} results")
            return results
            
        except Exception as e:
            logger.error(f"Error searching profile: {e}")
            return []
    
    def hybrid_search(
        self,
        query: str,
        user_id: int,
        namespaces: Optional[List[str]] = None,
        limit: int = 10,
        semantic_weight: float = 0.7,
        keyword_weight: float = 0.3
    ) -> List[Dict[str, Any]]:
        """Hybrid search combining semantic and keyword matching"""
        try:
            logger.info(f"Hybrid search for user {user_id} with query: {query}")
            
            # Semantic search
            semantic_results = self.search_profile(
                query=query,
                user_id=user_id,
                namespaces=namespaces,
                limit=limit,
                threshold=0.5  # Lower threshold for hybrid search
            )
            
            # Keyword search
            keyword_results = self._keyword_search(
                query=query,
                user_id=user_id,
                namespaces=namespaces,
                limit=limit
            )
            
            # Combine and weight results
            combined_results = self._combine_search_results(
                semantic_results, 
                keyword_results,
                semantic_weight,
                keyword_weight
            )
            
            logger.info(f"Hybrid search completed: {len(combined_results)} results")
            return combined_results
            
        except Exception as e:
            logger.error(f"Error in hybrid search: {e}")
            return []
    
    def get_context_for_query(
        self,
        query: str,
        user_id: int,
        max_context_length: int = 2000,
        namespaces: Optional[List[str]] = None
    ) -> str:
        """Get formatted context for LLM prompt"""
        try:
            # Search for relevant content
            search_results = self.search_profile(
                query=query,
                user_id=user_id,
                namespaces=namespaces,
                limit=5,
                threshold=0.6
            )
            
            if not search_results:
                return "No relevant information found in profile."
            
            # Format context by source type
            context_parts = []
            current_context_length = 0
            
            # Group by source type
            grouped_results = {}
            for result in search_results:
                source_type = result.get('source_type', 'unknown')
                if source_type not in grouped_results:
                    grouped_results[source_type] = []
                grouped_results[source_type].append(result)
            
            # Build context string
            for source_type, results in grouped_results.items():
                if current_context_length >= max_context_length:
                    break
                
                context_parts.append(f"\n=== {source_type.title()} ===")
                
                for result in results:
                    content = result.get('content', '')
                    metadata = result.get('metadata', {})
                    similarity = result.get('similarity', 0)
                    
                    # Add source info
                    source_info = ""
                    if source_type == 'experience':
                        source_info = f" ({metadata.get('company', 'Unknown')} - {metadata.get('position', 'Unknown')})"
                    elif source_type == 'project':
                        source_info = f" ({metadata.get('project_name', 'Unknown')})"
                    elif source_type == 'education':
                        source_info = f" ({metadata.get('institution', 'Unknown')})"
                    elif source_type == 'skill':
                        source_info = f" ({metadata.get('skill_name', 'Unknown')})"
                    
                    context_part = f"- {content}{source_info} [similarity: {similarity:.2f}]"
                    
                    if current_context_length + len(context_part) <= max_context_length:
                        context_parts.append(context_part)
                        current_context_length += len(context_part)
            
            context = "\n".join(context_parts)
            logger.info(f"Generated context: {len(context)} characters")
            
            return context
            
        except Exception as e:
            logger.error(f"Error generating context: {e}")
            return "Error generating context from profile."
    
    def find_similar_profiles(
        self,
        user_id: int,
        target_user_id: Optional[int] = None,
        limit: int = 5,
        threshold: float = 0.6
    ) -> List[Dict[str, Any]]:
        """Find profiles similar to target user or current user"""
        try:
            target_id = target_user_id or user_id
            logger.info(f"Finding profiles similar to user {target_id}")
            
            # Get target user's skills as query
            target_skills = self._get_user_skills(target_id)
            
            if not target_skills:
                return []
            
            # Create query from skills
            skills_query = " ".join(target_skills[:10])  # Limit to top 10 skills
            
            # Search for similar profiles (excluding the target user)
            search_results = self.search_profile(
                query=skills_query,
                user_id=user_id,  # Search in current user's namespace
                namespaces=[f"skills_{user_id}"],
                limit=limit * 2,  # Get more results to filter
                threshold=threshold
            )
            
            # Process results to find similar users
            similar_users = self._process_similar_users(search_results, target_id, limit)
            
            logger.info(f"Found {len(similar_users)} similar profiles")
            return similar_users
            
        except Exception as e:
            logger.error(f"Error finding similar profiles: {e}")
            return []
    
    def analyze_profile_gaps(
        self,
        user_id: int,
        target_roles: List[str],
        job_descriptions: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Analyze gaps between user profile and target roles"""
        try:
            logger.info(f"Analyzing profile gaps for user {user_id}")
            
            # Get user profile data
            user_profile = self._get_user_profile_summary(user_id)
            
            # Combine job descriptions if provided
            if job_descriptions:
                job_query = " ".join(job_descriptions)
            else:
                job_query = " ".join(target_roles)
            
            # Search for relevant content
            search_results = self.search_profile(
                query=job_query,
                user_id=user_id,
                limit=20,
                threshold=0.5
            )
            
            # Analyze gaps
            gap_analysis = self._analyze_skill_gaps(user_profile, search_results, target_roles)
            
            logger.info("Profile gap analysis completed")
            return gap_analysis
            
        except Exception as e:
            logger.error(f"Error analyzing profile gaps: {e}")
            return {'error': str(e)}
    
    def _keyword_search(
        self,
        query: str,
        user_id: int,
        namespaces: Optional[List[str]] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Perform keyword-based search"""
        try:
            # This is a simplified keyword search
            # In a real implementation, you might use PostgreSQL's full-text search
            keywords = query.lower().split()
            
            if not namespaces:
                namespaces = [
                    f"experience_{user_id}",
                    f"projects_{user_id}",
                    f"education_{user_id}",
                    f"skills_{user_id}",
                    f"profile_{user_id}"
                ]
            
            results = []
            for namespace in namespaces:
                # Get all embeddings from namespace
                namespace_embeddings = self.vector_store.get_by_namespace(namespace, limit=100)
                
                for embedding_data in namespace_embeddings:
                    content = embedding_data.get('content', '').lower()
                    metadata = embedding_data.get('metadata', {})
                    
                    # Calculate keyword match score
                    score = 0
                    for keyword in keywords:
                        if keyword in content:
                            score += 1
                    
                    if score > 0:
                        results.append({
                            'embedding_id': embedding_data.get('embedding_id'),
                            'namespace': namespace,
                            'content': embedding_data.get('content'),
                            'metadata': metadata,
                            'similarity': score / len(keywords),  # Normalized score
                            'source_type': metadata.get('source_type', 'unknown')
                        })
            
            # Sort by score and limit
            results.sort(key=lambda x: x.get('similarity', 0), reverse=True)
            return results[:limit]
            
        except Exception as e:
            logger.error(f"Error in keyword search: {e}")
            return []
    
    def _combine_search_results(
        self,
        semantic_results: List[Dict[str, Any]],
        keyword_results: List[Dict[str, Any]],
        semantic_weight: float,
        keyword_weight: float
    ) -> List[Dict[str, Any]]:
        """Combine semantic and keyword search results"""
        # Create lookup for keyword results
        keyword_lookup = {
            result['embedding_id']: result 
            for result in keyword_results
        }
        
        combined_results = []
        
        for semantic_result in semantic_results:
            embedding_id = semantic_result['embedding_id']
            
            # Calculate combined score
            semantic_score = semantic_result.get('similarity', 0) * semantic_weight
            
            keyword_score = 0
            if embedding_id in keyword_lookup:
                keyword_score = keyword_lookup[embedding_id].get('similarity', 0) * keyword_weight
            
            combined_score = semantic_score + keyword_score
            
            combined_result = semantic_result.copy()
            combined_result['similarity'] = combined_score
            combined_result['semantic_score'] = semantic_score
            combined_result['keyword_score'] = keyword_score
            
            combined_results.append(combined_result)
        
        # Add keyword-only results
        for keyword_result in keyword_results:
            if keyword_result['embedding_id'] not in [r['embedding_id'] for r in semantic_results]:
                keyword_result['semantic_score'] = 0
                keyword_result['keyword_score'] = keyword_result.get('similarity', 0)
                combined_results.append(keyword_result)
        
        # Sort by combined score
        combined_results.sort(key=lambda x: x.get('similarity', 0), reverse=True)
        
        return combined_results
    
    def _get_user_skills(self, user_id: int) -> List[str]:
        """Get user's skills from vector store"""
        try:
            skills_embeddings = self.vector_store.get_by_namespace(
                f"skills_{user_id}", 
                limit=50
            )
            
            skills = []
            for embedding in skills_embeddings:
                metadata = embedding.get('metadata', {})
                skill_name = metadata.get('skill_name')
                if skill_name:
                    skills.append(skill_name)
            
            return list(set(skills))  # Remove duplicates
            
        except Exception as e:
            logger.error(f"Error getting user skills: {e}")
            return []
    
    def _get_user_profile_summary(self, user_id: int) -> Dict[str, Any]:
        """Get summary of user's profile"""
        try:
            # Get embeddings from all namespaces
            all_embeddings = []
            for namespace_type in ['experience', 'projects', 'education', 'skills']:
                namespace = f"{namespace_type}_{user_id}"
                embeddings = self.vector_store.get_by_namespace(namespace, limit=20)
                all_embeddings.extend(embeddings)
            
            # Extract unique information
            skills = set()
            companies = set()
            technologies = set()
            
            for embedding in all_embeddings:
                metadata = embedding.get('metadata', {})
                
                if metadata.get('technologies'):
                    technologies.update(metadata['technologies'])
                
                if metadata.get('company'):
                    companies.add(metadata['company'])
                
                if metadata.get('skill_name'):
                    skills.add(metadata['skill_name'])
            
            return {
                'skills': list(skills),
                'companies': list(companies),
                'technologies': list(technologies),
                'total_embeddings': len(all_embeddings)
            }
            
        except Exception as e:
            logger.error(f"Error getting user profile summary: {e}")
            return {}
    
    def _process_similar_users(
        self,
        search_results: List[Dict[str, Any]],
        exclude_user_id: int,
        limit: int
    ) -> List[Dict[str, Any]]:
        """Process search results to find similar users"""
        # This is a simplified implementation
        # In a real system, you would have user mapping and more sophisticated logic
        
        user_scores = {}
        
        for result in search_results:
            metadata = result.get('metadata', {})
            result_user_id = metadata.get('user_id')
            
            if result_user_id and result_user_id != exclude_user_id:
                if result_user_id not in user_scores:
                    user_scores[result_user_id] = {
                        'user_id': result_user_id,
                        'skills': set(),
                        'score': 0
                    }
                
                # Add skills and update score
                if metadata.get('skill_name'):
                    user_scores[result_user_id]['skills'].add(metadata['skill_name'])
                
                user_scores[result_user_id]['score'] += result.get('similarity', 0)
        
        # Convert to list and sort by score
        similar_users = []
        for user_data in user_scores.values():
            user_data['skills'] = list(user_data['skills'])
            similar_users.append(user_data)
        
        similar_users.sort(key=lambda x: x['score'], reverse=True)
        
        return similar_users[:limit]
    
    def _analyze_skill_gaps(
        self,
        user_profile: Dict[str, Any],
        search_results: List[Dict[str, Any]],
        target_roles: List[str]
    ) -> Dict[str, Any]:
        """Analyze skill gaps between user profile and target roles"""
        user_skills = set(user_profile.get('skills', []))
        
        # Extract required skills from search results
        required_skills = set()
        for result in search_results:
            metadata = result.get('metadata', {})
            if metadata.get('technologies'):
                required_skills.update(metadata['technologies'])
            if metadata.get('skill_name'):
                required_skills.add(metadata['skill_name'])
        
        # Find gaps
        missing_skills = required_skills - user_skills
        existing_skills = user_skills & required_skills
        
        # Calculate match percentage
        if required_skills:
            match_percentage = len(existing_skills) / len(required_skills) * 100
        else:
            match_percentage = 0
        
        return {
            'target_roles': target_roles,
            'user_skills': list(user_skills),
            'required_skills': list(required_skills),
            'missing_skills': list(missing_skills),
            'existing_skills': list(existing_skills),
            'match_percentage': round(match_percentage, 2),
            'recommendations': self._generate_skill_recommendations(missing_skills)
        }
    
    def _generate_skill_recommendations(self, missing_skills: List[str]) -> List[str]:
        """Generate recommendations for missing skills"""
        # Simple recommendations based on common skill groups
        recommendations = []
        
        skill_groups = {
            'Programming': ['Python', 'JavaScript', 'Java', 'TypeScript', 'Go', 'Rust'],
            'Web Development': ['React', 'Angular', 'Vue', 'Node.js', 'Express', 'FastAPI'],
            'Cloud': ['AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes'],
            'Database': ['PostgreSQL', 'MongoDB', 'Redis', 'MySQL', 'Elasticsearch'],
            'Mobile': ['React Native', 'Flutter', 'Swift', 'Kotlin'],
            'DevOps': ['CI/CD', 'Jenkins', 'GitLab CI', 'GitHub Actions']
        }
        
        for skill in missing_skills:
            for group, group_skills in skill_groups.items():
                if skill in group_skills:
                    recommendations.append(f"Consider learning more {group} technologies")
                    break
        
        return list(set(recommendations))


# Global RAG service instance
rag_service = RAGService()
