from .factory import get_extractor_for_url
from typing import List, Dict, Any

def fetch_job_list(url: str) -> str:
    """
    Fetches raw content from a job list URL and cleans it.
    This content will later be parsed by an LLM to extract individual job data.
    """
    extractor = get_extractor_for_url(url)
    return extractor.fetch(url)

def fetch_job_description(url: str) -> str:
    """
    Fetches raw content from a specific job description URL.
    Used for deep analysis against the candidate profile.
    """
    extractor = get_extractor_for_url(url)
    return extractor.fetch(url)
