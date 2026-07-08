---
trigger: always_on
---

# applyCopilot Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-07-07

## Active Technologies
- TypeScript 5.x
- Next.js 16 (App Router, Turbopack)
- Ant Design 6
- Tailwind CSS 4
- Prisma 7.x (PostgreSQL)
- NextAuth v5
- Lucide Reac (002-frontend-v2-architecture-phase-4)
- PostgreSQL — `SystemConfig` table (key-value store, already seeded with 6 AI config keys) (002-frontend-v2-architecture-phase-4)
- Cheerio (for DOM extraction) (003-job-discovery)
- Turndown (HTML to Markdown conversion) (003-job-discovery)
- TypeScript 5.x / Node.js 20+ (Next.js 16 App Router) + `@tensorflow/tfjs-core`, `@tensorflow/tfjs-converter`, `@tensorflow-models/universal-sentence-encoder`, `@prisma/client` (004-job-classification)
- PostgreSQL 15+ (with `pgvector` extension) (004-job-classification)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.6+ (Next.js 16): Follow standard conventions

## Recent Changes
- 004-job-classification: Added TypeScript 5.x / Node.js 20+ (Next.js 16 App Router) + `@tensorflow/tfjs-core`, `@tensorflow/tfjs-converter`, `@tensorflow-models/universal-sentence-encoder`, `@prisma/client`
- 002-frontend-v2-architecture-phase-4: Added TypeScript 5.x / Next.js 16 (App Router, Turbopack) + Ant Design 6, Tailwind CSS 4, Prisma 7.x (PostgreSQL), NextAuth v5, Lucide Reac


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
