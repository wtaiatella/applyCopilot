# Feature Specification: ApplyCopilot — Job Discovery

**Feature Branch**: `003-job-discovery`  
**Created**: 2026-06-07  
**Status**: 🔒 Pending — to be detailed after spec 002 (Profile) is implemented and stable  
**Predecessor**: [spec 002](../002-frontend-v2-architecture/spec.md) — Profile foundation must be complete  
**Input**: To be defined via `/grill-me` interview when Phase 2 begins

---

## Scope

This spec will cover the full Job Discovery feature, including:

- Multi-portal job scraping (Hacker News, LinkedIn, remote boards)
- Portal configuration UI (ADMIN)
- AI-powered job scoring and compatibility calculation (pgvector cosine similarity)
- Job listing UI (cards, filters, search)
- Job detail page with match breakdown
- Background job queue infrastructure (BullMQ + Redis — introduced in this phase)

---

## Dependencies

- **spec 002 complete**: `ProfileContext`, `ProfileDTO`, pgvector on `UserProfile` must be in production
- **pgvector embedding**: `UserProfile.embedding` field (reserved in spec 002 schema) populated before matching can run
- **PostgreSQL `applycopilot` DB**: job_listings table with `embedding vector(1536)` column

---

## Reference

- [spec 001 FR-005 through FR-027](../001-apply-copilot-system/spec.md) — original job discovery requirements
- [spec 002 ADR-001](../002-frontend-v2-architecture/spec.md) — pgvector setup and embedding strategy
- **frontend_V1/** — reference implementation of scraping and scoring logic

---

## To be detailed later

All user stories, acceptance scenarios, functional requirements, API routes, data model extensions, and implementation phases will be added here when spec 002 Phase 1 is shipped.

Use `/grill-me` to refine requirements interactively before starting.
