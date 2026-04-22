# Implementation Plan: ApplyCopilot Job Search Automation System

**Branch**: `001-apply-copilot-system` | **Date**: 2025-06-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-apply-copilot-system/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

ApplyCopilot is an intelligent job search automation system that helps users upload and parse CVs, discover relevant remote jobs through AI-powered filtering, and generate personalized application materials. The system uses a hybrid AI approach with local processing (Ollama, TensorFlow.js) for basic tasks and premium APIs (Gemini) for high-value content generation, all backed by MongoDB with Prisma ORM for data persistence.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript 5.6+ (Next.js 16)
**Primary Dependencies**: Next.js 16, React 19, Ant Design 6, Tailwind CSS 4, Prisma v6.x, TensorFlow.js, Ollama SDK, Gemini API
**Storage**: MongoDB with Prisma ORM v6.x (Prisma v7+ does not support MongoDB)
**Testing**: Jest (unit/integration), Playwright (E2E)
**Target Platform**: Web application (Node.js server, browser client)
**Project Type**: web-service
**Performance Goals**: <2s processing for 100 job listings, <5s CV upload and parsing, 99% uptime
**Constraints**: <200ms p95 for API responses, <1GB memory usage for local AI processing
**Scale/Scope**: 1000+ concurrent users, 10k+ job listings per search

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ Compliance Status

**I. Spec-Driven Development**: ✅ PASS - Specification complete before implementation
**II. Trunk-Based Development**: ✅ PASS - Feature branch strategy followed
**III. Test-First**: ✅ PASS - Testing strategy defined (Jest + Playwright, 80% coverage)
**IV. English-Only Codebase**: ✅ PASS - All documentation in English
**V. AI Cost Optimization**: ✅ PASS - Hybrid approach with clear tier justification:
- TensorFlow.js: Mathematical pre-filtering (free, local)
- Ollama: CV parsing, job data extraction, basic compatibility scoring (free, local)
- Gemini API: Cover letters, advanced CV suggestions, nuanced matching (paid, high-value only)
**VI. Privacy by Default**: ✅ PASS - CV processing and pre-filtering local only
**VII. UI Consistency**: ✅ PASS - Ant Design 6 + Tailwind CSS 4, dark mode priority

**VIII. Security Requirements**: ✅ PASS - NextAuth.js credentials provider, MongoDB with Prisma, proper .env handling

### Technical Decions Aligned with Constitution

1. **AI Pipeline**: TensorFlow.js → Ollama → Gemini follows cost optimization hierarchy
2. **Authentication**: NextAuth.js with credentials provider as required
3. **Database**: MongoDB with Prisma ORM for flexible schema
4. **UI Framework**: Ant Design 6 + Tailwind CSS 4 with dark mode support
5. **Testing**: Jest + Playwright with 80% minimum coverage requirement

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
frontend/                  ← Unified Next.js 16 project
├── src/
│   ├── app/               ← Pages, API Routes, Server Actions
│   │   ├── api/           ← API endpoints (auth, jobs, profile)
│   │   ├── dashboard/     ← Application tracking
│   │   ├── jobs/          ← Job discovery and filtering
│   │   ├── profile/       ← CV upload and profile management
│   │   └── layout.tsx     ← Root layout with theme provider
│   ├── components/        ← Ant Design/Tailwind UI Components
│   │   ├── ui/            ← Reusable UI components
│   │   ├── forms/         ├── Profile and job search forms
│   │   └── layout/        ← Layout components
│   ├── lib/               ← TensorFlow, Ollama, Prisma configs
│   │   ├── ai/            ← AI processing pipeline
│   │   ├── db/            ← Database configuration
│   │   └── scraping/      ← Job portal scrapers
│   ├── services/          ← External API integrations
│   │   ├── auth.ts        ← NextAuth.js configuration
│   │   ├── gemini.ts      ← Premium AI service
│   │   └── ollama.ts      ← Local AI service
│   └── types/             ← Zod/TypeScript definitions
├── prisma/                ← MongoDB Schema
│   ├── schema.prisma      ← Database schema
│   └── migrations/        ← Database migrations
└── tests/
    ├── __mocks__/         ← Test mocks
    ├── integration/        ← Integration tests
    └── unit/               ← Unit tests

specs/001-apply-copilot-system/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api.md           # API contract documentation
└── tasks.md             # Phase 2 output
```

**Structure Decision**: Unified Next.js 16 application following constitution-mandated folder structure. Single frontend/ directory contains all application code with clear separation of concerns (app/, components/, lib/, services/). MongoDB with Prisma handles data persistence, and AI processing is distributed between local (TensorFlow.js, Ollama) and premium (Gemini) services.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
