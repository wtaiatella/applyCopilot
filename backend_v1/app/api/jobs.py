from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
from ..database import get_session, Job, Analysis
from ...tools.web_scraper.scraper import fetch_job_list, fetch_job_description
from ...tools.web_scraper.factory import get_extractor_for_url
from ..agents.job_discovery import parse_job_list
from ..agents.match_analyzer import analyze_job_match
import json

router = APIRouter(prefix="/jobs", tags=["jobs"])

@router.post("/discover")
async def discover_jobs(url: str, session: Session = Depends(get_session)):
    """
    Given a URL, fetch content, parse jobs using AI, and save them to the database.
    """
    # Get site extractor for URL
    extractor = get_extractor_for_url(url)

    # 1. Fetch content
    raw_text = extractor.fetch(url)
    if not raw_text:
        raise HTTPException(status_code=400, detail="Failed to fetch content from URL")
    
    # Get site specific instructions
    site_instructions = extractor.get_prompt_extension()
    
    # 2. Parse jobs with AI
    jobs_data = parse_job_list(raw_text, base_url=url, site_specific_instructions=site_instructions)
    
    # 3. Save to database
    new_jobs = []
    for data in jobs_data:
        # Check if job already exists by URL
        existing_job = session.exec(select(Job).where(Job.url == data["url"])).first()
        if not existing_job:
            job = Job(
                title=data["title"],
                company=data["company"],
                location=data.get("location"),
                url=data["url"],
                status="discovered"
            )
            session.add(job)
            new_jobs.append(job)
    
    session.commit()
    for job in new_jobs:
        session.refresh(job)
        
    return {"discovered": len(jobs_data), "new_saved": len(new_jobs), "jobs": new_jobs}

@router.post("/{job_id}/analyze")
async def analyze_job(job_id: int, session: Session = Depends(get_session)):
    """
    Fetch full job description, compare with candidate profile, and generate analysis.
    """
    # 1. Get job from DB
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # 2. Fetch full description if not already present
    if not job.description:
        description = fetch_job_description(job.url)
        if not description:
            raise HTTPException(status_code=400, detail="Failed to fetch job description")
        job.description = description
    
    # 3. Perform AI Analysis
    analysis_data = analyze_job_match(job.description)
    
    # 4. Save analysis to DB
    analysis = Analysis(
        match_score=analysis_data["match_score"],
        strengths=", ".join(analysis_data["strengths"]),
        gaps=", ".join(analysis_data["gaps"]),
        recommendations=analysis_data["recommendations"],
        full_report=analysis_data["technical_feedback"],
        job_id=job.id
    )
    session.add(analysis)
    
    # Update job status
    job.status = "analyzed"
    session.add(job)
    
    session.commit()
    session.refresh(analysis)
    
    return {"analysis": analysis, "job_status": job.status}

@router.get("/")
async def list_jobs(session: Session = Depends(get_session)):
    jobs = session.exec(select(Job)).all()
    return jobs
