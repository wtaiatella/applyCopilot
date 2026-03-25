import time
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database.session import get_db
from app.api.dependencies import get_current_active_user
from app.api.schemas import (
    RAGIndexRequest, RAGIndexResponse,
    RAGSearchRequest, RAGSearchResponse,
    RAGContextRequest, RAGContextResponse,
    RAGSimilarProfilesRequest, RAGSimilarProfilesResponse,
    RAGGapAnalysisRequest, RAGGapAnalysisResponse,
    RAGHybridSearchRequest, RAGHybridSearchResponse
)
from app.database.models import User, Profile, Experience, Project, Education
from app.services.rag_service import rag_service
from app.core.logging import logger


router = APIRouter(prefix="/api/rag", tags=["RAG system"])


@router.post("/index", response_model=RAGIndexResponse)
async def index_profile(
    request: RAGIndexRequest,
    user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Index user profile for RAG search"""
    try:
        logger.info(f"Starting profile indexing for user {user.id}")
        
        # Get user's profile data
        profile = db.query(Profile).filter(Profile.user_id == user.id).first()
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found"
            )
        
        # Get experience data
        experiences = db.query(Experience).filter(Experience.profile_id == profile.id).all()
        experience_data = []
        for exp in experiences:
            experience_data.append({
                'id': exp.id,
                'company': exp.company,
                'position': exp.position,
                'description': exp.description,
                'company_description': exp.company_description,
                'achievements': exp.achievements or [],
                'technologies': exp.technologies or [],
                'is_current': exp.is_current,
                'start_date': exp.start_date.isoformat() if exp.start_date else None,
                'end_date': exp.end_date.isoformat() if exp.end_date else None
            })
        
        # Get project data
        projects = db.query(Project).filter(Project.profile_id == profile.id).all()
        project_data = []
        for proj in projects:
            project_data.append({
                'id': proj.id,
                'name': proj.name,
                'description': proj.description,
                'highlights': proj.highlights or [],
                'technologies': proj.technologies or [],
                'url': proj.url,
                'github_url': proj.github_url,
                'start_date': proj.start_date.isoformat() if proj.start_date else None,
                'end_date': proj.end_date.isoformat() if proj.end_date else None
            })
        
        # Get education data
        education_records = db.query(Education).filter(Education.profile_id == profile.id).all()
        education_data = []
        for edu in education_records:
            education_data.append({
                'id': edu.id,
                'institution': edu.institution,
                'degree': edu.degree,
                'field_of_study': edu.field_of_study,
                'description': edu.description,
                'technologies': edu.technologies or [],
                'start_date': edu.start_date.isoformat() if edu.start_date else None,
                'end_date': edu.end_date.isoformat() if edu.end_date else None
            })
        
        # Combine all profile data
        profile_data = {
            'experience': experience_data,
            'projects': project_data,
            'education': education_data,
            'skills': profile.skills or [],
            'summary': profile.summary
        }
        
        # Index the profile
        result = rag_service.index_profile(profile_data, user.id)
        
        logger.info(f"Profile indexing completed for user {user.id}")
        return RAGIndexResponse(**result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error indexing profile: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error indexing profile: {str(e)}"
        )


@router.post("/search", response_model=RAGSearchResponse)
async def search_profile(
    request: RAGSearchRequest,
    user: User = Depends(get_current_active_user)
):
    """Search user profile using semantic search"""
    try:
        start_time = time.time()
        
        logger.info(f"Searching profile for user {user.id} with query: {request.query}")
        
        # Perform search
        results = rag_service.search_profile(
            query=request.query,
            user_id=user.id,
            namespaces=request.namespaces,
            limit=request.limit,
            threshold=request.threshold
        )
        
        search_time = time.time() - start_time
        
        logger.info(f"Search completed: {len(results)} results in {search_time:.2f}s")
        
        return RAGSearchResponse(
            query=request.query,
            results=results,
            total_results=len(results),
            search_time=search_time
        )
        
    except Exception as e:
        logger.error(f"Error searching profile: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error searching profile: {str(e)}"
        )


@router.post("/context", response_model=RAGContextResponse)
async def get_context(
    request: RAGContextRequest,
    user: User = Depends(get_current_active_user)
):
    """Get formatted context for LLM prompt"""
    try:
        logger.info(f"Generating context for user {user.id} with query: {request.query}")
        
        # Generate context
        context = rag_service.get_context_for_query(
            query=request.query,
            user_id=user.id,
            max_context_length=request.max_context_length,
            namespaces=request.namespaces
        )
        
        # Extract sources used
        sources_used = []
        if request.namespaces:
            sources_used.extend(request.namespaces)
        else:
            sources_used = [
                f"experience_{user.id}",
                f"projects_{user.id}",
                f"education_{user.id}",
                f"skills_{user.id}",
                f"profile_{user.id}"
            ]
        
        logger.info(f"Context generated: {len(context)} characters")
        
        return RAGContextResponse(
            query=request.query,
            context=context,
            context_length=len(context),
            sources_used=sources_used
        )
        
    except Exception as e:
        logger.error(f"Error generating context: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating context: {str(e)}"
        )


@router.post("/similar-profiles", response_model=RAGSimilarProfilesResponse)
async def find_similar_profiles(
    request: RAGSimilarProfilesRequest,
    user: User = Depends(get_current_active_user)
):
    """Find profiles similar to target user"""
    try:
        logger.info(f"Finding similar profiles for user {request.user_id}")
        
        # Find similar profiles
        similar_profiles = rag_service.find_similar_profiles(
            user_id=request.user_id,
            target_user_id=request.target_user_id,
            limit=request.limit,
            threshold=request.threshold
        )
        
        logger.info(f"Found {len(similar_profiles)} similar profiles")
        
        return RAGSimilarProfilesResponse(
            similar_profiles=similar_profiles,
            total_found=len(similar_profiles)
        )
        
    except Exception as e:
        logger.error(f"Error finding similar profiles: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error finding similar profiles: {str(e)}"
        )


@router.post("/gap-analysis", response_model=RAGGapAnalysisResponse)
async def analyze_profile_gaps(
    request: RAGGapAnalysisRequest,
    user: User = Depends(get_current_active_user)
):
    """Analyze gaps between user profile and target roles"""
    try:
        logger.info(f"Analyzing profile gaps for user {user.id}")
        
        # Perform gap analysis
        gap_analysis = rag_service.analyze_profile_gaps(
            user_id=user.id,
            target_roles=request.target_roles,
            job_descriptions=request.job_descriptions
        )
        
        if 'error' in gap_analysis:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error analyzing profile gaps: {gap_analysis['error']}"
            )
        
        logger.info("Profile gap analysis completed")
        
        return RAGGapAnalysisResponse(**gap_analysis)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing profile gaps: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error analyzing profile gaps: {str(e)}"
        )


@router.post("/hybrid-search", response_model=RAGHybridSearchResponse)
async def hybrid_search(
    request: RAGHybridSearchRequest,
    user: User = Depends(get_current_active_user)
):
    """Hybrid search combining semantic and keyword matching"""
    try:
        start_time = time.time()
        
        logger.info(f"Hybrid search for user {user.id} with query: {request.query}")
        
        # Perform hybrid search
        results = rag_service.hybrid_search(
            query=request.query,
            user_id=user.id,
            namespaces=request.namespaces,
            limit=request.limit,
            semantic_weight=request.semantic_weight,
            keyword_weight=request.keyword_weight
        )
        
        search_time = time.time() - start_time
        
        logger.info(f"Hybrid search completed: {len(results)} results in {search_time:.2f}s")
        
        return RAGHybridSearchResponse(
            query=request.query,
            results=results,
            total_results=len(results),
            semantic_weight=request.semantic_weight,
            keyword_weight=request.keyword_weight,
            search_time=search_time
        )
        
    except Exception as e:
        logger.error(f"Error in hybrid search: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error in hybrid search: {str(e)}"
        )


@router.get("/stats")
async def get_rag_stats(
    user: User = Depends(get_current_active_user)
):
    """Get RAG statistics for user"""
    try:
        # This would typically include stats like:
        # - Number of indexed chunks
        # - Index size
        # - Last indexed time
        # - Search performance metrics
        
        # For now, return basic info
        stats = {
            'user_id': user.id,
            'indexed_namespaces': [
                f"experience_{user.id}",
                f"projects_{user.id}",
                f"education_{user.id}",
                f"skills_{user.id}",
                f"profile_{user.id}"
            ],
            'total_chunks': 0,  # This would be calculated from actual storage
            'index_status': 'ready'  # or 'indexing', 'error'
        }
        
        logger.info(f"RAG stats retrieved for user {user.id}")
        return stats
        
    except Exception as e:
        logger.error(f"Error getting RAG stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting RAG stats: {str(e)}"
        )


@router.get("/debug")
async def debug_embeddings(
    user: User = Depends(get_current_active_user)
):
    """Debug endpoint to check embeddings"""
    try:
        # List all embeddings
        all_embeddings = rag_service.vector_store.list_all_embeddings()
        
        # List namespaces
        namespaces = rag_service.vector_store.list_namespaces()
        
        return {
            "total_embeddings": len(all_embeddings),
            "namespaces": namespaces,
            "sample_embeddings": all_embeddings[:5]
        }
        
    except Exception as e:
        logger.error(f"Error in debug endpoint: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error in debug endpoint: {str(e)}"
        )


@router.delete("/index")
async def clear_user_index(
    user: User = Depends(get_current_active_user)
):
    """Clear user's RAG index"""
    try:
        logger.info(f"Clearing RAG index for user {user.id}")
        
        # Get all user namespaces
        namespaces = [
            f"experience_{user.id}",
            f"projects_{user.id}",
            f"education_{user.id}",
            f"skills_{user.id}",
            f"profile_{user.id}"
        ]
        
        # Clear embeddings from vector store
        cleared_count = 0
        for namespace in namespaces:
            count = rag_service.vector_store.delete_by_namespace(namespace)
            cleared_count += count
        
        # Clear embedding cache
        rag_service.embedding_service.clear_cache()
        
        logger.info(f"RAG index cleared for user {user.id}: {cleared_count} namespaces")
        
        return {
            "message": f"RAG index cleared successfully",
            "cleared_namespaces": namespaces,
            "cleared_count": cleared_count
        }
        
    except Exception as e:
        logger.error(f"Error clearing RAG index: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error clearing RAG index: {str(e)}"
        )
