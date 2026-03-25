import json
from typing import List, Dict, Any
from urllib.parse import urljoin
from langchain_core.prompts import ChatPromptTemplate
from ..core.llm import get_llm
from ..core.debug import debug_manager
from ..rag.manager import rag_manager

DISCOVERY_PROMPT = """
You are a expert job discovery agent. I will provide you with a raw text (markdown) of a web page that contains a list of job openings.
Your task is to extract ONLY the jobs that pass the validation rules into a structured JSON list.

CANDIDATE PROFILE CONTEXT:
{user_profile}

VALIDATION IS YOUR PRIMARY TASK:
1. Identify a job opening.
2. Filter by RELEVANCE: Only include jobs that match the candidate's core tech stack or experience described above.
3. Filter by LOCATION: Read the location/region information carefully.
4. Compare it against the "CRITICAL VALIDATION RULES" from the site-specific instructions.
5. If a job is restricted to a specific country (like USA, UK, Poland, Latvia, etc.) and DOES NOT explicitly allow Brazil or South America, or is not "Anywhere in the World", YOU MUST EXCLUDE IT.
6. If in doubt about a location or relevance, EXCLUDE the job to be safe.

Each extracted job should have:
- title: The job title.
- company: The company name.
- location: The job location (if available).
- type: If the job is full-time or part-time.
- salary: The expected salary range (if available).
- isWorldWide: Indicates if the job is available worldwide.
- USOnly: Indicates if the job is specific only to the US.
- url: The direct URL to the job details page.

If you cannot find some field, return "".
If no valid jobs are found, return an empty list [].

RAW TEXT:
{raw_text}

{site_specific_instructions}

JSON OUTPUT:
"""

def parse_job_list(raw_text: str, base_url: str = "", site_specific_instructions: str = "") -> List[Dict[str, Any]]:
    # Get User Profile for pre-filtering
    user_profile = rag_manager.get_user_profile_summary()
    
    # Use gemini-3-flash-preview for discovery (latest and faster)
    llm = get_llm(model="gemini-3-flash-preview") 
    prompt = ChatPromptTemplate.from_template(DISCOVERY_PROMPT)
    chain = prompt | llm
    
    # Pre-split text by jobs if it's too large to reduce context per call
    # In Markdown from WWR, jobs usually start with "* [View Company Profile]"
    job_blocks = raw_text.split("* [View Company Profile]")
    
    # The first block is usually header info, we can keep it for context if needed
    # but the instructions are already in the prompt.
    
    all_extracted_jobs = []
    
    # Group jobs in batches to reduce number of calls while keeping context manageable
    batch_size = 30 # Process 30 jobs at a time
    batches = []
    current_batch = []
    
    for i, block in enumerate(job_blocks):
        if i == 0: continue # Skip header
        current_batch.append("* [View Company Profile]" + block)
        if len(current_batch) >= batch_size:
            batches.append("\n\n".join(current_batch))
            current_batch = []
    
    if current_batch:
        batches.append("\n\n".join(current_batch))

    debug_manager.log(f"Processing {len(job_blocks)-1} jobs in {len(batches)} batches")

    for i, batch_text in enumerate(batches):
        debug_manager.log(f"Processing batch {i+1}/{len(batches)}...")
        try:
            response = chain.invoke({
                "raw_text": batch_text,
                "site_specific_instructions": site_specific_instructions,
                "user_profile": user_profile
            })
            
            extracted = _extract_json_from_response(response.content)
            if extracted:
                all_extracted_jobs.extend(extracted)
        except Exception as e:
            debug_manager.log(f"Error processing batch {i+1}: {e}")

    # Convert relative URLs to absolute
    if base_url:
        for job in all_extracted_jobs:
            if job.get("url") and not job["url"].startswith("http"):
                job["url"] = urljoin(base_url, job["url"])
                
    debug_manager.save_data("jobs_extracted.json", json.dumps(all_extracted_jobs, indent=4))
    return all_extracted_jobs

def _extract_json_from_response(content: Any) -> List[Dict[str, Any]]:
    if isinstance(content, list):
        text_parts = []
        for part in content:
            if isinstance(part, str): text_parts.append(part)
            elif hasattr(part, 'text'): text_parts.append(part.text)
            elif isinstance(part, dict) and 'text' in part: text_parts.append(part['text'])
            else: text_parts.append(str(part))
        content = "".join(text_parts)

    try:
        if not isinstance(content, str):
            content = str(content)
            
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        
        return json.loads(content.strip())
    except Exception as e:
        debug_manager.log(f"Failed to parse JSON batch: {e}")
        return []
