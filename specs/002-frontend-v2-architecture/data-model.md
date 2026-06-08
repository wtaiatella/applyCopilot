# Phase 1 Data Model: ApplyCopilot V2

This document details the database schema (PostgreSQL + Prisma 7.x) and entity relationships for the ApplyCopilot Frontend V2.

---

## 1. Prisma Schema Design

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  USER
  ADMIN
}

enum BulletType {
  BULLET
  PARAGRAPH
}

enum ProficiencyLevel {
  BEGINNER
  INTERMEDIATE
  ADVANCED
  EXPERT
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  role      Role     @default(USER)
  createdAt DateTime @default(now())
  profile   UserProfile?
  sessions  Session[]
}

model UserProfile {
  id              String           @id @default(cuid())
  userId          String           @unique
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  
  // Basic Information
  firstName       String?
  lastName        String?
  title           String?
  summary         String?
  location        String?
  phone           String?
  website         String?
  github          String?
  linkedin        String?
  
  // pgvector embedding field (stored as PostgreSQL vector)
  embedding       Unsupported("vector(1536)")?

  // Relations
  user            User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  experiences     Experience[]
  education       Education[]
  projects        Project[]
  skills          Skill[]
  references      Reference[]
  summaries       ProfileSummary[]
  cvs             CV[]
}

model Experience {
  id              String             @id @default(cuid())
  profileId       String
  company         String
  position        String
  startDate       DateTime
  endDate         DateTime?
  current         Boolean            @default(false)
  freeFormContext String?
  
  profile         UserProfile        @relation(fields: [profileId], references: [id], onDelete: Cascade)
  bullets         ExperienceBullet[]
}

model ExperienceBullet {
  id           String     @id @default(cuid())
  experienceId String
  text         String
  isActive     Boolean    @default(true)
  isArchived   Boolean    @default(false)
  type         BulletType @default(BULLET)
  sortOrder    Int        @default(0)
  
  experience   Experience @relation(fields: [experienceId], references: [id], onDelete: Cascade)
  usedInCVs    CVBullet[]
}

model Education {
  id              String            @id @default(cuid())
  profileId       String
  institution     String
  degree          String
  fieldOfStudy    String?
  startDate       DateTime
  endDate         DateTime?
  current         Boolean           @default(false)
  hideEndDate     Boolean           @default(false)
  freeFormContext String?
  
  profile         UserProfile       @relation(fields: [profileId], references: [id], onDelete: Cascade)
  bullets         EducationBullet[]
}

model EducationBullet {
  id          String     @id @default(cuid())
  educationId String
  text        String
  isActive    Boolean    @default(true)
  isArchived  Boolean    @default(false)
  type        BulletType @default(BULLET)
  sortOrder   Int        @default(0)
  
  education   Education  @relation(fields: [educationId], references: [id], onDelete: Cascade)
  usedInCVs   CVBullet[]
}

model Project {
  id              String          @id @default(cuid())
  profileId       String
  name            String
  startDate       DateTime?
  endDate         DateTime?
  current         Boolean         @default(false)
  technologies    String[]        // Stored as text array in PostgreSQL
  freeFormContext String?
  
  profile         UserProfile     @relation(fields: [profileId], references: [id], onDelete: Cascade)
  bullets         ProjectBullet[]
}

model ProjectBullet {
  id         String     @id @default(cuid())
  projectId  String
  text       String
  isActive   Boolean    @default(true)
  isArchived Boolean    @default(false)
  type       BulletType @default(BULLET)
  sortOrder  Int        @default(0)
  
  project    Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  usedInCVs  CVBullet[]
}

model Skill {
  id              String           @id @default(cuid())
  profileId       String
  name            String
  proficiency     ProficiencyLevel
  yearsExperience Int?
  
  profile         UserProfile      @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@unique([profileId, name])
}

model Reference {
  id           String      @id @default(cuid())
  profileId    String
  name         String
  company      String?
  relationship String?
  email        String?
  phone        String?
  canContact   Boolean     @default(false)
  
  profile      UserProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
}

model ProfileSummary {
  id            String      @id @default(cuid())
  profileId     String
  title         String
  content       String
  isAIGenerated Boolean     @default(false)
  isActive      Boolean     @default(false)
  sortOrder     Int         @default(0)
  createdAt     DateTime    @default(now())
  
  profile       UserProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
}

model CV {
  id        String     @id @default(cuid())
  profileId String
  name      String
  s3Key     String?
  createdAt DateTime   @default(now())
  
  profile   UserProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  bullets   CVBullet[]
}

model CVBullet {
  id                 String            @id @default(cuid())
  cvId               String
  experienceBulletId String?
  projectBulletId    String?
  educationBulletId  String?
  renderedText       String            // Persists CV bullet content even if original profile bullet is deleted

  cv               CV                @relation(fields: [cvId], references: [id], onDelete: Cascade)
  experienceBullet ExperienceBullet? @relation(fields: [experienceBulletId], references: [id], onDelete: SetNull)
  projectBullet    ProjectBullet?    @relation(fields: [projectBulletId], references: [id], onDelete: SetNull)
  educationBullet  EducationBullet?  @relation(fields: [educationBulletId], references: [id], onDelete: SetNull)
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  token     String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model SystemConfig {
  key   String @id
  value String
}
```

---

## 2. Entity Relationships

```
User
  ├── UserProfile (1:1)
  │   ├── Experience[] (1:N)
  │   │   └── ExperienceBullet[] (1:N)
  │   ├── Education[] (1:N)
  │   │   └── EducationBullet[] (1:N)
  │   ├── Project[] (1:N)
  │   │   └── ProjectBullet[] (1:N)
  │   ├── Skill[] (1:N)
  │   ├── Reference[] (1:N)
  │   ├── ProfileSummary[] (1:N)
  │   └── CV[] (1:N)
  │       └── CVBullet[] (join: CV ↔ ExperienceBullet/ProjectBullet/EducationBullet)
  └── Session[]
```

---

## 3. Database Indexes

To support high performance in production:
1. **HNSW Vector Index**: Created on the `embedding` column of `UserProfile` using pgvector's cosine distance operator.
   ```sql
   CREATE INDEX IF NOT EXISTS user_profile_embedding_hnsw_idx 
   ON "UserProfile" USING hnsw (embedding vector_cosine_ops);
   ```
2. **Standard B-Tree Indexes**:
   - `User(email)` (implicit unique index).
   - `UserProfile(userId)` (implicit unique index).
   - `Skill(profileId, name)` (implicit unique index).
   - `PasswordResetToken(token)` (implicit unique index).
   - `Session(token)` (implicit unique index).
