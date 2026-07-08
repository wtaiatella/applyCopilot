# Quickstart: Job Classification & Matching

This document provides steps to set up, run, and verify the local vectorization and classification features.

---

## 1. Setup Dependencies & Environment

Ensure you have the required TensorFlow.js CPU libraries installed in the frontend package.

```bash
cd frontend
npm install @tensorflow/tfjs-core @tensorflow/tfjs-backend-cpu @tensorflow-models/universal-sentence-encoder
```

Verify that the local PostgreSQL database has the `pgvector` extension installed. Run in your PostgreSQL client:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## 2. Run Database Migration

Generate the Prisma client and apply the migrations:

```bash
npx prisma migrate dev --name add_job_classification_embeddings
```

*Note: Verify that the generated SQL file includes `CREATE EXTENSION IF NOT EXISTS vector;` at the top before it runs the table alterations, especially if running on a clean database.*

---

## 3. Seed Testing Data & Run Scrapers

Ensure you have active vacancies in the database:
```bash
# Run your scraper tests or background workers to populate JobListing
npm run dev
```

1.  Navigate to `/profile` in the browser.
2.  Input cv data and wait for the "Saved" indicator.
3.  Click the **"Sync with AI"** button. This will request the Summaries Provider LLM to clean your CV and generate your vector.
4.  Navigate to the new `/jobs` route.
5.  By default, vacancies published in the last 15 days will show up ranked by **Match %** (green/yellow/gray badges).
6.  If you haven't synced your profile, the list will fall back to publication date ordering, showing a gray "Sync Profile" tag.

---

## 4. Run Verification Tests

Run the newly created unit and integration tests to verify correctness:

```bash
# Execute Jest tests
npx jest tests/unit/vector-service.test.ts
npx jest tests/integration/vector-query.test.ts
```
