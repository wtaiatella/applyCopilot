from typing import Dict, Any, List
from langchain_core.prompts import ChatPromptTemplate
from ..core.llm import get_llm
from ..rag.manager import rag_manager

MATCH_PROMPT = """
You are a career specialist assistant. Your task is to analyze the match between a candidate's profile and a job description.

CANDIDATE PROFILE (Relevant fragments from CV):
{context}

JOB DESCRIPTION:
{job_description}

Please provide a structured analysis in JSON format with the following fields:
- match_score: A number between 0 and 100 representing the compatibility.
- strengths: A list of points where the candidate matches the job requirements.
- gaps: A list of requirements that the candidate seems to be missing or could improve.
- recommendations: Specific advice on how to improve the application or what to highlight.
- technical_feedback: A brief markdown summary of the technical compatibility.

JSON OUTPUT:
"""

def analyze_job_match(job_description: str) -> Dict[str, Any]:
    # 1. Retrieve relevant context from RAG
    # We query using the job description to find matching skills in the CV
    context_fragments = rag_manager.query(job_description, n_results=10)
    context = "\n\n".join(context_fragments)
    
    # 2. Setup LLM (using 2.5 Pro for deep analysis)
    llm = get_llm(model="gemini-2.5-pro")
    prompt = ChatPromptTemplate.from_template(MATCH_PROMPT)
    chain = prompt | llm
    
    # 3. Invoke analysis
    response = chain.invoke({
        "context": context,
        "job_description": job_description
    })
    
    content = response.content
    import json
    try:
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        
        return json.loads(content.strip())
    except Exception as e:
        print(f"Failed to parse analysis JSON: {e}")
        return {
            "match_score": 0,
            "strengths": [],
            "gaps": [],
            "recommendations": "Failed to generate analysis",
            "technical_feedback": content
        }
