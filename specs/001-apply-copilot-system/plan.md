# Implementation Plan: ApplyCopilot Job Search Automation System

**Branch**: `001-apply-copilot-system` | **Date**: 2025-06-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-apply-copilot-system/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

ApplyCopilot is an intelligent job search automation system that helps users discover remote opportunities and personalize application materials. The system uses a cost-optimized AI pipeline: TensorFlow.js for pre-filtering, Ollama for local parsing, and premium AI (Gemini/Claude) for high-complexity tasks like personalized content generation. The architecture follows Next.js 16 with App Router, Ant Design 6 + Tailwind CSS 4 for UI, and MongoDB with Prisma for data management.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript 5.x (Next.js 16)  
**Primary Dependencies**: Next.js 16, Ant Design 6, Tailwind CSS 4, Prisma, TensorFlow.js, Ollama SDK  
**Storage**: MongoDB (managed via Prisma)  
**Testing**: Jest (unit), Playwright (integration/e2e)  
**Target Platform**: Web browser (Chrome, Firefox, Safari, Edge)  
**Project Type**: Full-stack web application  
**Performance Goals**: <2s for 100 job processing, <5s CV upload and parsing, 99% uptime  
**Constraints**: AI cost optimization hierarchy (TensorFlow.js → Ollama → Premium AI), local processing for sensitive data  
**Scale/Scope**: 1k+ concurrent users, 100k+ job listings processed daily

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ Spec-Driven Development
- Spec is technology-agnostic and focuses on user value
- No implementation details found in spec.md
- Plan will contain all technical decisions

### ✅ Trunk-Based Development
- Feature branch follows naming convention: `001-apply-copilot-system`
- Will use Conventional Commits during implementation
- All changes will be merged via PR to main

### ✅ Test-First
- Jest for unit tests (business logic, utilities)
- Playwright for integration tests (AI services, database, auth)
- 80% coverage requirement enforced

### ✅ English-Only Codebase
- All code, comments, and documentation in English
- Variable names, function names, API routes in English

### ✅ AI Cost Optimization
- TensorFlow.js for pre-filtering (free, local)
- Ollama for CV parsing and structured data extraction (free, local)
- Premium AI only for high-complexity tasks (personalized content generation)

### ✅ Privacy by Default
- CV processing and profile extraction: local only
- Job compatibility pre-filtering: local only
- Minimal data sent to external APIs

### ✅ UI Consistency
- Ant Design 6 as primary component library
- Tailwind CSS 4 for layout and custom styling
- Dark mode as default priority

### ✅ Security Requirements
- NextAuth.js for authentication
- Credentials stored in .env.agent (not in tracked files)
- No secrets in specs or documentation

**GATE STATUS: ✅ PASSED - Ready for Phase 0 Research**

---

## Constitution Check (Post-Phase 1 Design)

*Re-evaluation after completing research and design phases*

### ✅ Spec-Driven Development
- Spec remains technology-agnostic and focused on user value
- Plan contains all technical decisions and architecture
- Data model and contracts derived from spec requirements

### ✅ Trunk-Based Development
- Feature branch follows naming convention: `001-apply-copilot-system`
- Implementation will use Conventional Commits
- All changes will be merged via PR to main

### ✅ Test-First
- Jest for unit tests (business logic, utilities, validation)
- Playwright for integration tests (AI services, database, auth)
- 80% coverage requirement maintained in quickstart guide

### ✅ English-Only Codebase
- All code examples, documentation, and API contracts in English
- Variable names, function names, API routes follow English conventions

### ✅ AI Cost Optimization
- TensorFlow.js for pre-filtering (free, local) ✓
- Ollama for CV parsing and structured data extraction (free, local) ✓
- Premium AI only for high-complexity tasks (personalized content generation) ✓
- Cost optimization strategies documented in research.md

### ✅ Privacy by Default
- CV processing and profile extraction: local only ✓
- Job compatibility pre-filtering: local only ✓
- Minimal data sent to external APIs documented in contracts
- Temporary file storage with automatic cleanup

### ✅ UI Consistency
- Ant Design 6 as primary component library ✓
- Tailwind CSS 4 for layout and custom styling ✓
- Dark mode implementation with ConfigProvider ✓
- Component patterns documented in quickstart guide

### ✅ Security Requirements
- NextAuth.js for authentication ✓
- Rate limiting defined in API contracts ✓
- File validation and security measures documented ✓
- Credential storage in .env.agent (not tracked)

**GATE STATUS: ✅ PASSED - Ready for Phase 2 Tasks**

## Phase 1 Complete: Design & Contracts

✅ **Research Completed**: All technical decisions documented with rationale  
✅ **Data Model Defined**: Complete entity relationships and validation rules  
✅ **API Contracts Specified**: Comprehensive API documentation  
✅ **Quickstart Guide Created**: Development setup and patterns  
✅ **Agent Context Updated**: Windsurf configuration enhanced  
✅ **Constitution Verified**: All gates passed post-design

## Project Structure

### Documentation (this feature)

```text
specs/001-apply-copilot-system/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
frontend/                  # Unified Next.js 16 project
├── src/
│   ├── app/               # Pages, API Routes, Server Actions
│   │   ├── api/          # API endpoints for job scraping, AI processing
│   │   ├── actions/      # Server actions for database operations
│   │   ├── (auth)/       # Authentication pages
│   │   ├── (main)/       # Main application pages
│   │   │   ├── dashboard/ # Job search and application tracking
│   │   │   └── profile/   # CV management and profile editing
│   │   └── globals.css   # Tailwind CSS imports
│   ├── components/        # Ant Design/Tailwind UI Components
│   │   ├── ui/          # Reusable UI components
│   │   ├── forms/       # Profile and job search forms
│   │   └── layout/      # Layout components
│   ├── lib/              # TensorFlow, Ollama, Prisma configs
│   │   ├── tensorflow/   # ML models for job matching
│   │   ├── ollama/      # Local AI integration
│   │   ├── prisma/      # Database client
│   │   └── auth/        # NextAuth configuration
│   ├── services/         # External API integrations
│   │   ├── scraping/    # Job portal scrapers
│   │   ├── ai/          # AI service integrations
│   │   └── email/       # Email notifications
│   ├── types/            # Zod/TypeScript definitions
│   └── stores/           # Zustand state management
├── prisma/               # MongoDB Schema
│   ├── schema.prisma     # Database schema
│   └── migrations/       # Database migrations
└── tests/                # Jest and Playwright tests
    ├── unit/             # Unit tests
    ├── integration/      # Integration tests
    └── e2e/              # End-to-end tests

docs/                      # Technical documentation
└── project description.md # Project overview

.windsurf/                 # Windsurf agent configurations (NO SECRETS)
```

**Structure Decision**: Unified Next.js 16 full-stack application following the constitution-mandated folder structure. All frontend, backend, and API code resides in the `frontend/` directory with clear separation of concerns using Next.js App Router conventions.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
