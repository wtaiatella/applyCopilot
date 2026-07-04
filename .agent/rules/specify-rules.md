# applyCopilot Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-07-04

## Active Technologies
- TypeScript 5.x / Next.js 16 (App Router, Turbopack) + Ant Design 6, Tailwind CSS 4, Prisma 7.x (PostgreSQL), NextAuth v5, Lucide Reac (002-frontend-v2-architecture-phase-4)
- PostgreSQL — `SystemConfig` table (key-value store, already seeded with 6 AI config keys) (002-frontend-v2-architecture-phase-4)
- TypeScript / Node.js 20+ (Next.js 16.2.7) + Prisma ORM, Cheerio (for deterministic DOM extraction), NextAuth.js (006-job-scraper-worker)
- PostgreSQL (via Prisma) (006-job-scraper-worker)
- TypeScript / Node.js 20+ (Next.js 16.2.7) + Prisma ORM, Cheerio (for DOM extraction), Turndown (HTML to Markdown conversion) (006-job-scraper-worker)

- TypeScript 5.6+ (Next.js 16) + Next.js 16, React 19, Ant Design 6, Tailwind CSS 4, Prisma v6.x, TensorFlow.js, Ollama SDK, Gemini API, AWS SDK (001-apply-copilot-system)

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
- 006-job-scraper-worker: Added TypeScript / Node.js 20+ (Next.js 16.2.7) + Prisma ORM, Cheerio (for DOM extraction), Turndown (HTML to Markdown conversion)
- 006-job-scraper-worker: Added TypeScript / Node.js 20+ (Next.js 16.2.7) + Prisma ORM, Cheerio (for deterministic DOM extraction), NextAuth.js
- 002-frontend-v2-architecture-phase-4: Added TypeScript 5.x / Next.js 16 (App Router, Turbopack) + Ant Design 6, Tailwind CSS 4, Prisma 7.x (PostgreSQL), NextAuth v5, Lucide Reac


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
