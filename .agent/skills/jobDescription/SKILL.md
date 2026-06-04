---
name: "jobDescription"
description: "Scrape, parse, and analyze a job listing from a URL, calculate its potential score, and track it."
---

# Skill: Analyze Job (/jobDescription)

This skill guides the AI agent on how to scrape, parse, and analyze a job listing from a URL.

## Command Trigger
`[Qualquer mensagem que mencione "/jobDescription" seguido por um link/URL]`

## Process Steps

When this skill is triggered, the agent must perform the following steps:

1. **Scrape the Job Posting**:
   - Use the `read_url_content` tool on the provided URL to extract the raw text content of the job listing.

2. **Create the Application Directory**:
   - Identify the Company and the Job Title/Role from the scraped content.
   - Sanitize these names to create a directory path: `/Users/wagnertaiatella/repos/applyCopilot/myJobs/applications/<company-name>-<job-title>/`.

3. **Save the Job Description**:
   - Save a structured job description markdown file to `/Users/wagnertaiatella/repos/applyCopilot/myJobs/applications/<company-name>-<job-title>/job_description.md`.
   - The file must contain:
     - **Company Name**
     - **Job Title**
     - **URL Source**
     - **Salary Range** (if mentioned, otherwise "Not specified")
     - **Contract Type** (Contractor, Full-Time, Deel, etc.)
     - **Workplace Model** (Remote Worldwide, Remote US, Hybrid, etc.)
     - **Required Skills** (bullet list)
     - **Desired Skills** (bullet list)
     - **Full Scraped Text** (under a collapsible section)

4. **Calculate Potential Score**:
   - Read the user's scoring criteria in `/Users/wagnertaiatella/repos/applyCopilot/myJobs/skills/analyze_job/preferences.md`.
   - Evaluate the job listing across the 4 pillars (Tech Stack, Geography/Model, Critical Engineering differentials, and Culture/Seniority) to compute a score out of 100.
   - List the specific scoring breakdown, Pros, Cons, and a recommendation of whether this is a high-potential job for Wagner.
   - Save this evaluation in English to `/Users/wagnertaiatella/repos/applyCopilot/myJobs/applications/<company-name>-<job-title>/analysis.md`.

5. **Update Main Dashboard**:
   - Open `/Users/wagnertaiatella/repos/applyCopilot/myJobs/README.md`.
   - Add a new row to the job applications tracking table:
     - **Company & Role** (with a link to `applications/<company-name>-<job-title>/`)
     - **Date Added** (current date: YYYY-MM-DD)
     - **Potential Score**
     - **Status** (set to `To Evaluate` by default)
     - **Salary & Contract**

6. **Confirm to the User**:
   - Respond in the chat summarizing the scraped details and the final calculated potential score, prompting them if they want to proceed with `/createCV` or `/createCoverLetter`.
