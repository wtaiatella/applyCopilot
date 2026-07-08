# Research: Job Classification & Vector Matching

This document compiles the research, technology decisions, and integration details for Spec 004.

---

## 1. Local Vectorization Engine: TensorFlow.js & Universal Sentence Encoder (USE)

### Decision
We use the Google **Universal Sentence Encoder (USE)** model via TensorFlow.js for local text vectorization.

### Rationale
*   **Zero-Cost**: Embeddings are generated on the server CPU without requesting third-party paid APIs.
*   **Multi-language Support**: USE natively supports English and Portuguese. It understands synonyms and semantic equivalents across languages (e.g. mapping "software engineer" to "desenvolvedor de software").
*   **Sufficiently Lightweight**: The model takes ~30MB of storage and loads in under 3 seconds on standard CPUs. It outputs 512-dimension vectors, which are faster to query than 1536-dimension vectors.

### Implementation Pattern (Node.js)
```typescript
import '@tensorflow/tfjs-backend-cpu'; // CPU backend is sufficient and easy to install
import * as tf from '@tensorflow/tfjs-core';
import * as use from '@tensorflow-models/universal-sentence-encoder';

let modelInstance: use.UniversalSentenceEncoder | null = null;

export async function getTensorFlowModel() {
  if (!modelInstance) {
    // Loads model from CDN on first execution, caches in memory
    modelInstance = await use.load();
  }
  return modelInstance;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = await getTensorFlowModel();
  const embeddings = await model.embed([text]);
  const vectorArray = await embeddings.array();
  // Cleanup tensor memory to avoid leaks
  embeddings.dispose();
  return vectorArray[0];
}
```

---

## 2. PostgreSQL Vector Database Integration via Prisma

### Decision
We store the 512-dimension vectors inside PostgreSQL using the **pgvector** extension and retrieve them using raw SQL via Prisma's `$queryRaw`.

### Rationale
Prisma does not natively support the `vector` type or operators like `<=>` (cosine distance) inside its standard query builder. However, we can map the column as `Unsupported("vector(512)")` in the Prisma Schema and execute raw SQL queries.

### Schema Mapping
```prisma
model UserProfile {
  // ...
  embedding Unsupported("vector(512)")?
}

model JobListing {
  // ...
  embedding Unsupported("vector(512)")?
}
```

### PostgreSQL Raw Query Pattern
Cosine similarity is calculated as `1 - (vector_A <=> vector_B)`.
We perform the date filter (default: last 15 days) before sorting by match score to maximize query performance:

```typescript
import { prisma } from '@/lib/db';

export async function getJobsWithSimilarity(
  profileEmbedding: number[], 
  daysLimit: number = 15, 
  limit: number = 50
) {
  // Format vector array to PostgreSQL string format: '[x1,x2,...,x512]'
  const vectorStr = `[${profileEmbedding.join(',')}]`;

  const results = await prisma.$queryRawUnsafe<any[]>(`
    SELECT 
      id, 
      title, 
      company, 
      location,
      url, 
      "postedAt",
      "createdAt",
      (1 - (embedding <=> $1::vector)) as "matchScore"
    FROM "JobListing"
    WHERE "classificationStatus" = 'COMPLETED'
      AND ("postedAt" >= NOW() - $2 * INTERVAL '1 day' OR "postedAt" IS NULL)
    ORDER BY "matchScore" DESC
    LIMIT $3;
  `, vectorStr, daysLimit, limit);

  return results;
}
```
*Note: Using `$queryRaw` with parameters is safe from SQL injections. The query calculates similarity scores dynamically.*

---

## 3. Two-Stage (Hybrid) Filtering & LLM Cleaning

### Stage 1: Dynamic Vector Ranking
1.  **Candidate Profile**: The user's experiences, education, and skills are cleaned by the LLM (Summaries Provider) on-demand (when clicking the "Sync with AI" button), and the resulting string is vectorized via USE.
2.  **Job Listing**: Raw job description is cleaned by the LLM (Parsing Provider) once after scrape completion, and vectorized via USE.
3.  **Matching**: Cosine similarity is computed inside the database. This yields a list of candidates sorted by semantic matching.

### Stage 2: On-Demand Deep Analysis
Because deep LLM evaluation is expensive in both API tokens and execution time, we only run it when the user clicks **"Analyze with AI"** on a vacancy details pane.
*   **Inputs**: The candidate's raw profile and the job description.
*   **Outputs**: Strengths, weaknesses, missing skills, and an application recommendation.
*   **Cache**: Stored in the `JobAnalysis` table linked to the job listing. Next time the user opens the same job, the analysis is retrieved instantly from the DB.

---

## 4. Alternatives Considered

1.  **OpenAI Embeddings (`text-embedding-3-small` / 1536 dimensions)**:
    *   *Pros*: High quality semantic mapping.
    *   *Cons*: Every single scraped job description (~100 daily) would require a paid external API call just for vector indexing. If the API key is not configured, the entire scraper classification loop would fail.
    *   *Decision*: Rejected in favor of local TensorFlow.js USE to ensure 100% offline capacity, privacy, and zero API cost for vector generation.
2.  **In-Memory TypeScript Vector Comparison**:
    *   *Pros*: Database-agnostic, works on simple SQL database structures.
    *   *Cons*: Loading thousands of 512-dimension vectors into server memory and calculating cosine similarity manually via TypeScript loop is CPU-intensive and slow.
    *   *Decision*: Rejected in favor of PostgreSQL's `pgvector` index which handles vector calculations inside native C code.
