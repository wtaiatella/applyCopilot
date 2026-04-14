# ApplyCopilot - Project Description

## Overview
**ApplyCopilot** is an intelligent system designed to automate and optimize the job search process, with a primary focus on remote opportunities. The system acts as a co-pilot for the developer, assisting from job discovery to the personalization of application materials.

## Current Tech Stack (Unified Definition)
The project has been consolidated into a modern and efficient architecture:

*   **Framework:** Next.js 16 (Full-stack) using the App Router.
*   **Interface:** Ant Design 6 integrated with Tailwind CSS 4.
*   **Database:** MongoDB (managed via Prisma).
*   **Local AI (Performance & Cost):**
    *   **Ollama:** Used for simple processing tasks, such as transforming raw job Markdown into structured JSON (Suggested models: Llama 3.2 3B, Qwen 2.5).
    *   **TensorFlow.js:** Used in the initial pre-filtering layer to perform matching between profile and job, saving tokens by discarding irrelevant jobs before LLM processing.
*   **Premium AI (API):** High-performance LLMs (Gemini/Claude) used exclusively for high-complexity tasks, such as generating personalized resumes and cover letters.

## Core Features and Workflow

### 1. Onboarding and Profile Management
*   **CV Upload & Processing:** PDF/DOCX upload with automatic data extraction via local parser, organizing data into six main sections:
    - **Basic Data:** Email (primary key), name, location, phone, portfolio links (all editable except email)
    - **Experiences:** Work history with tabbed interface per position
    - **Education:** Academic background with tabbed interface per institution
    - **Projects:** Portfolio projects with tabbed interface per project
    - **Skills:** Technical and soft skills with categorization
    - **References:** Professional references with contact information

*   **Dynamic Summary Management:**
    - Multiple summary versions with AI generation assistance
    - Manual editing capabilities with AI review and suggestions
    - Version control system allowing users to select best summary for each application

*   **Tab-Based Content Organization (Ant Design):**
    - Each section uses Tabs component for individual items (experiences, education, projects, etc.)
    - **Bullet Points System:** Editable bullet points for CV content with non-destructive editing
    - **Free-Form Context Fields:** Text areas where users describe experiences in their own words
    - **AI-Powered Suggestions:** System generates new bullets based on free-form context and existing content

*   **AI-Enhanced Content Generation:**
    - Context-aware bullet suggestions using free-form experience descriptions
    - Multiple content options for each experience allowing AI to select best fit
    - Cover letter content generation from combined profile context
    - Resume optimization suggestions based on target job requirements

### 2. Discovery and Intelligent Filtering (Cost Optimization)

#### 2.1. Smart Scraping Architecture
1.  **Portal Selection Interface:** Dashboard search page allows users to:
    - Choose from pre-configured portals (WeWorkRemotely, LinkedIn, etc.)
    - Input custom job search URLs

2.  **Dual-Layer Scraping System:**
    - **Generic Scraper:** Generic Base WebExtractor for any URL or fallback.
    - **Provider-Specific Extractors:** Optimized parsers for known portals (e.g., WeWorkRemotelyExtractor)
    - **Factory Pattern:** Automatic routing to appropriate extractor based on URL detection

3.  **Content Processing Pipeline:**
    - HTML cleaning and markdown conversion
    - Provider-specific prompt extensions for better parsing
    - Debug logging and session tracking

#### 2.2. AI-Powered Processing Pipeline
1.  **Local Parsing (Ollama):** 
    - Converts raw markdown to structured JSON
    - Applies provider-specific parsing rules
    - Validates job requirements against user preferences

2.  **Pre-filtering (TensorFlow.js):**
    - Mathematical similarity scoring between profile and jobs
    - Discards low-compatibility matches before LLM processing
    - Reduces token costs by up to 90%

3.  **Detailed Analysis (Premium AI):**
    - Deep qualitative analysis of top matches
    - Identifies skill gaps and alignment opportunities
    - Generates actionable insights for application strategy

### 3. Application Personalization
*   **Improvement Suggestions:** AI suggests specific CV adjustments for each favorited job.
*   **Document Generation:** Creation of tailored cover letters and resumes using premium AI, ensuring maximum alignment with job requirements.

### 4. Dashboard Search Interface
*   **Portal Selection Panel:** Intuitive Ant Design interface featuring:
    - Dropdown with pre-configured job portals (WeWorkRemotely, LinkedIn, etc.)
    - Custom URL input field for specific job searches
    - Real-time URL validation and provider detection
*   **Search Configuration:**
    - Per-portal scraping preferences
    - Advanced filtering options (remote type, salary range, technologies)
*   **Results Management:**
    - Live scraping progress indicators
    - Job preview cards with key information
    - Bulk actions for filtering and favoriting jobs

### 5. Application Management
*   Centralized dashboard to track each application's status (Applied, Interview, Technical Test, Offer, Rejected).

## Folder Structure (Reference)
```
/
├── apps/ (if applicable to future monorepo)
├── frontend/ (Unified Next.js Project)
│   ├── src/
|   |   ├── app/api/                    # API Routes
|   |   ├── app/actions/                # Backend actions, DB, external APIs
|   |   ├── app/(main)/(home)/page.tsx   # Frontend home
|   |   ├── app/(main)/dashboard/       # Frontend dashboard
|   |   ├── app/(auth)/                 # Auth pages
|   |   ├── lib/tensorflow/             # ML local
|   |   ├── lib/ollama/                 # AI local
|   |   ├── components/                 # UI components
|   |   ├── types/                      # Zod types
|   |   ├── stores/                     # Zustand contexts
|   |   └── services/                   # Mail, JWT
│   └── prisma/ (MongoDB Schema)
├── docs/ (Technical documentation)
└── .agent/ (Coding assistant configurations)
```

## Benefits of the Approach
*   **Cost Efficiency:** Up to 90% reduction in paid token consumption through strategic use of local AI (Ollama) and mathematical filters (TensorFlow).
*   **Privacy:** Initial processing of sensitive data performed locally.
*   **User Experience:** Premium interface with Ant Design and high performance with Next.js.

