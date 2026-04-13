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
*   CV Upload (PDF/DOCX) with automatic data extraction via local parser.
*   Ant Design interface for reviewing and enriching the profile (Experiences, Education, Projects, and Skills).
*   Search preference definition (Remote, Salary, Technologies).

### 2. Discovery and Intelligent Filtering (Cost Optimization)
1.  **Scraping:** Capture raw data from job portals.
2.  **Local Parsing (Ollama):** Local conversion of MD to structured JSON.
3.  **Pre-filtering (TensorFlow):** Quick comparison between user profile and job description. Only jobs reaching a minimum compatibility score proceed.
4.  **Detailed Analysis (Premium AI):** Filtered top jobs receive a deep qualitative analysis, identifying gaps and highlights.

### 3. Application Personalization
*   **Improvement Suggestions:** AI suggests specific CV adjustments for each favorited job.
*   **Document Generation:** Creation of tailored cover letters and resumes using premium AI, ensuring maximum alignment with job requirements.

### 4. Application Management
*   Centralized dashboard to track each application's status (Applied, Interview, Technical Test, Offer, Rejected).

## Folder Structure (Reference)
```
/
├── apps/ (if applicable to future monorepo)
├── frontend/ (Unified Next.js Project)
│   ├── src/
│   │   ├── app/ (Pages, API Routes, Actions)
│   │   ├── components/ (Ant Design/Tailwind UI Components)
│   │   ├── lib/ (TensorFlow, Ollama, Prisma configurations)
│   │   ├── services/ (External API integrations)
│   │   └── types/ (Zod/TypeScript definitions)
│   └── prisma/ (MongoDB Schema)
├── docs/ (Technical documentation)
└── .agent/ (Coding assistant configurations)
```

## Benefits of the Approach
*   **Cost Efficiency:** Up to 90% reduction in paid token consumption through strategic use of local AI (Ollama) and mathematical filters (TensorFlow).
*   **Privacy:** Initial processing of sensitive data performed locally.
*   **User Experience:** Premium interface with Ant Design and high performance with Next.js.
