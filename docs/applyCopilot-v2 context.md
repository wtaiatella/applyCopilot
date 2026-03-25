  # ApplyCopilot v2 - Context and Project Definition

## Project Overview

ApplyCopilot is an intelligent system designed to automate and optimize the job search process. It uses AI agents and advanced orchestration to help developers find, analyze, and apply for jobs, focusing on remote international opportunities.

## Project Objectives

- **Automated Discovery**: Extract data from job portals to identify relevant positions based on personalized profiles.
- **Deep Analysis**: Use LLMs to compare job descriptions with resumes and experiences stored in a RAG system.
- **Content Personalization**: Generate customized CVs and cover letters for each specific application.
- **Application Management**: A centralized dashboard to track the status of each application.

## Technology Stack

- **Frontend**: Next.js (App Router), Tailwind CSS, Lucide Icons
- **Backend**: Python, FastAPI, LangGraph
- **AI/LLM**: Gemini 3 (Flash/Pro), Claude 4, GPT-5
- **Database**: PostgreSQL with pgvector
- **Protocol**: Model Context Protocol (MCP)
- **Web Scraping**: Crawl4AI, Brightdata

## Complete User Flow (Revised)

### 1. Onboarding and Profile Registration

#### 1.1. Initial Registration
- User registers on the platform (email/password or OAuth)
- Fills in basic profile information (name, location, current position)

#### 1.2. CV Upload
- User uploads CV in PDF, DOCX, or TXT format
- System processes the document using parsing tools
- Automatically extracts structured information:
  - Personal data
  - Educational history
  - Professional experiences
  - Technical skills
  - Relevant projects

#### 1.3. Confirmation and Editing of Extracted Data
- System presents the extracted information for confirmation
- User can edit, complement, or correct the data
- Interface allows reorganization and prioritization of experiences/skills

#### 1.4. Search Preferences Definition
- Desired contract type (CLT, PJ, freelance)
- Work modality (remote, hybrid, in-person)
- Expected salary range
- Locations of interest (for non-remote positions)
- Priority technologies and areas of interest

### 2. Profile Processing and Vectorization

#### 2.1. Embeddings Generation
- System processes the complete profile and generates embeddings for different namespaces:
  - profile: Embedding of the candidate's summary/overview
  - experiences: Separate embeddings for each professional experience
  - skills: Embeddings of technical and soft skills
  - projects: Embeddings of relevant projects

#### 2.2. Database Storage
- Structured data is saved in PostgreSQL relational tables
- Embeddings are stored using pgvector with appropriate namespaces
- Metadata is associated with each embedding to facilitate future queries

#### 2.3. Initial Profile Analysis
- LLM analyzes the complete profile and generates initial insights:
  - Candidate's strengths
  - Areas that could be improved
  - Suggestions for profile completion
  - Types of positions most suitable for the profile

#### 2.4. Profile Enrichment with Feedback
- System requests additional information about experiences that are only in bullet point format
- User responses are stored as additional embeddings in the vector database
- This enriched information improves the quality of future analyses

### 3. Job Discovery

#### 3.1. Manual Search (Phase 1)
- User enters specific job links for analysis
- Alternative: User selects job sites for targeted search

#### 3.2. Automated Search (Phases 2 and 3)
- Based on user preferences, the system searches for jobs:
  - Uses Crawl4AI to extract data from job portals
  - Applies initial filters (remote, technologies, seniority)
  - Organizes found jobs into categories

#### 3.3. Processing of Found Jobs
- For each job found:
  - Extracts and structures the complete description
  - Identifies technical requirements, responsibilities, and benefits
  - Stores in the relational database (PostgreSQL)
  - Does not generate embeddings at this moment (according to evolutionary approach)

### 4. Detailed Analysis and Recommendations

#### 4.1. Job Selection by User
- User views discovered jobs and selects those they want to analyze in detail
- System prioritizes selected jobs for on-demand analysis

#### 4.2. On-Demand Analysis
- For each job selected by the user:
  - LLM compares the job description with the profile embeddings
  - Performs detailed compatibility analysis
  - Identifies alignment points between profile and requirements
  - Detects possible skill or experience gaps
  - Generates specific recommendations

#### 4.3. Presentation to User
- Dashboard presents the analysis results with:
  - Compatibility score
  - Candidate's strengths for the position
  - Possible gaps and how to address them
  - Suggestions for adapting the CV for the specific position

#### 4.4. Human-in-the-loop Interaction and Data Enrichment
- User provides feedback on the analysis:
  - Marks jobs as favorites or discards
  - Answers specific questions about relevant experiences
  - Adds detailed information not present in the original CV
- Feedback Storage: All responses and additional information are stored in the vector database as a complement to the profile
- Selective Embedding Generation: For jobs marked as favorites, the system generates and stores embeddings (implementation of Phase 1 of the evolutionary strategy)

### 5. Application Preparation

#### 5.1. CV Personalization
- For jobs selected by the user:
  - System uses enriched profile information (including previous feedback)
  - Suggests specific adaptations to the CV
  - Reorganizes experiences and skills by relevance
  - Highlights projects and achievements aligned with the position
  - User can review and edit the suggestions

#### 5.2. Cover Letter Generation
- System creates personalized cover letter:
  - Specifically addresses the job requirements
  - Highlights the candidate's most relevant experiences
  - Incorporates detailed information provided during previous interactions
  - Explains how the candidate can add value to the company
  - Maintains tone and style aligned with the company culture

#### 5.3. Review and Finalization
- User reviews the generated materials
- System offers suggestions for final improvements
- Documents are formatted according to professional standards

### 6. Application Tracking

#### 6.1. Application Registration
- User marks the job as "applied"
- System records date and materials used
- Creates reminders for follow-up

#### 6.2. Status Monitoring
- User can update the status of applications:
  - Awaiting response
  - Interview scheduled
  - Technical test
  - Offer received
  - Rejected

#### 6.3. Continuous Analysis and Learning
- System learns from feedback from previous applications
- Refines recommendations based on results
- Uses interaction history to improve future analyses
- In more advanced phases (2 and 3), implements automated search based on success patterns

## Technical Implementation by Phase

### Phase 1: Individual Use (MVP)
- Vector Storage: Only for user profile and favorite jobs
- Job Search: Mainly manual
- Analysis: On-demand for jobs selected by the user
- Focus: Solve immediate problem of individual user (you)

### Phase 2: Automation and Optimization
- Automated Search: Programmed crawlers for specific sites
- Expanded Vector Storage: Popular jobs get embeddings
- Analysis Cache: Reuse of analyses for similar jobs
- Focus: Time saving and better organization of opportunities

### Phase 3: Multi-user Platform
- Shared Job Database: Embeddings in separate database
- Collaborative Analyses: Leveraging insights between similar users
- Market Intelligence: Identification of trends in requirements and skills
- Focus: Scalability and shared value

## Advanced Features

### Prompt Caching
Utilizing Gemini 3's context cache to store user CV information, saving tokens and reducing latency in job analyses.

### Non-Linear Orchestration
Implementation of complex workflows with LangGraph, allowing advanced error handling and conditional decisions during the analysis process.

### Intelligent Extraction
Use of modern tools like Crawl4AI for structured job data extraction, with automatic cleaning and optimized formatting.

### Human-AI Interaction
Interactive question system that transforms AI from a passive generator to an active copilot, requesting user feedback at strategic points.