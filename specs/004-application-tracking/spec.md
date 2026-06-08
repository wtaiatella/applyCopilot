# Feature Specification: ApplyCopilot — Application Tracking

**Feature Branch**: `004-application-tracking`  
**Created**: 2026-06-07  
**Status**: 🔒 Pending — to be detailed after spec 003 (Job Discovery) is implemented and stable  
**Predecessor**: [spec 003](../003-job-discovery/spec.md) — Job Discovery must be complete  
**Input**: To be defined via `/grill-me` interview when Phase 3 begins

---

## Scope

This spec will cover the full Application Tracking feature, including:

- Application Kanban pipeline (Applied → Interview → Offer → Rejected)
- Tailored CV generation per application (AI-powered, stored in S3)
- Cover letter generation (AI, with user guidance prompt)
- Application history and status tracking
- Dashboard metrics (applications sent, response rate, offer rate)
- Notification system (email via Resend, WhatsApp via Twilio — TBD)

---

## Dependencies

- **spec 002 complete**: Profile, CV generation pipeline, `ProfileContext`
- **spec 003 complete**: Job listings DB, job detail pages, job scoring
- **S3 bucket**: for storing generated CV PDFs per application

---

## Reference

- [spec 001 FR-012](../001-apply-copilot-system/spec.md) — original application tracking requirements
- **frontend_V1/** — reference implementation of cover letter and tailored CV generation prompts

---

## To be detailed later

All user stories, acceptance scenarios, functional requirements, API routes, data model extensions, and implementation phases will be added here when spec 003 Phase 2 is shipped.

Use `/grill-me` to refine requirements interactively before starting.
