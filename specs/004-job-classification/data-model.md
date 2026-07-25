# Data Model: Job Classification & Semantic Matching

This document details the modifications to the PostgreSQL database schema managed via Prisma ORM for Spec 004.

---

## 1. Updated Schema Models

We will update `/frontend/prisma/schema.prisma` to include support for 512-dimension vectors (`pgvector`) and the caching entity for deep analysis.

```prisma
// Enum for job classification status tracking
enum ClassificationStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}

// Enum for candidacy AI recommendation verdict
enum RecommendationVerdict {
  APPLY
  CAUTION
  IGNORE
}

model UserProfile {
  id                String           @id @default(cuid())
  userId            String           @unique
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt
  
  // Basic Information
  firstName         String?
  lastName          String?
  title             String?
  summary           String?
  location          String?
  phone             String?
  website           String?
  github            String?
  linkedin          String?
  
  // Cleaned profile representation returned by LLM (used as embedding input)
  aiCleanedText     String?          @db.Text

  // 512-dimension vector from TensorFlow.js (pgvector)
  embedding         Unsupported("vector(512)")?

  // Sync tracking
  embeddingSyncedAt DateTime?

  // Relations
  user              User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  experiences       Experience[]
  education         Education[]
  projects          Project[]
  skills            Skill[]
  references        Reference[]
  summaries         ProfileSummary[]
  cvs               CV[]
}

model JobListing {
  id                       String               @id @default(cuid())
  portalId                 String
  externalJobId            String
  title                    String
  company                  String
  location                 String?
  url                      String
  isFullDescriptionFetched Boolean              @default(false)
  fullDescription          String?              @db.Text

  // Technical summary returned by LLM (used as embedding input)
  cleanedSummary           String?              @db.Text

  // 512-dimension vector from TensorFlow.js (pgvector)
  embedding                Unsupported("vector(512)")?

  // Classification State Tracking
  classificationStatus     ClassificationStatus @default(PENDING)
  classificationAttempts   Int                  @default(0)
  classificationError      String?

  locationType             String?
  countries                String?
  jobType                  String?
  experienceLevel          String?
  postedAt                 DateTime?
  salaryMin                Float?
  salaryMax                Float?
  currency                 String?

  createdAt                DateTime             @default(now())
  updatedAt                DateTime             @updatedAt

  // Relations
  analyses                 JobAnalysis[]

  @@unique([portalId, externalJobId])
}

model JobAnalysis {
  id            String                @id @default(cuid())
  jobId         String                @unique // 1-to-1 cache per job
  
  // LLM generated detailed matching points
  strengths     String[]              @default([]) // Strengths matching profile
  weaknesses    String[]              @default([]) // Weaknesses / Misalignments
  missingSkills String[]              @default([]) // Skills required by job but missing on profile
  
  // Recommendation details
  verdict       RecommendationVerdict @default(CAUTION)
  justification String                @db.Text

  createdAt     DateTime              @default(now())
  updatedAt     DateTime              @updatedAt

  // Relations
  job           JobListing            @relation(fields: [jobId], references: [id], onDelete: Cascade)
}
```

---

## 2. Database Migration Requirements

1.  **pgvector Extension**:
    The migration MUST ensure that the `pgvector` extension is created in PostgreSQL before attempting to define the `vector(512)` column:
    ```sql
    CREATE EXTENSION IF NOT EXISTS vector;
    ```
2.  **Schema Sync via Prisma**:
    Run `npx prisma migrate dev` to generate the new SQL migration files. 
    *Note: Since Prisma does not natively script the `CREATE EXTENSION` command for `Unsupported("vector(512)")` on some PostgreSQL setups, the SQL migration file must be reviewed and customized manually to run `CREATE EXTENSION IF NOT EXISTS vector;` at the very beginning.*
