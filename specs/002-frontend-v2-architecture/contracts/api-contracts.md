# Phase 1 Interface Contracts: REST API & DTOs

This document defines the REST API endpoints and canonical TypeScript DTO definitions for the ApplyCopilot Frontend V2.

---

## 1. REST API Routes (Phase 1)

All endpoints require authentication (NextAuth session) except those explicitly marked public (`❌`).

| Method | Route | Purpose | Auth |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/profile` | Retrieve the complete profile for the authenticated user | ✅ |
| **PUT** | `/api/profile/basic` | Update user name, contact details, summaries list, and sync the active summary | ✅ |
| **POST** | `/api/profile/experiences` | Create a new work experience entry (with empty bullets) | ✅ |
| **PUT** | `/api/profile/experiences/[id]` | Update experience details, bullets array, context, and reorder | ✅ |
| **DELETE** | `/api/profile/experiences/[id]` | Delete a work experience entry | ✅ |
| **POST** | `/api/profile/education` | Create a new education entry | ✅ |
| **PUT** | `/api/profile/education/[id]` | Update education details and reorder bullets | ✅ |
| **DELETE** | `/api/profile/education/[id]` | Delete an education entry | ✅ |
| **POST** | `/api/profile/projects` | Create a new project entry | ✅ |
| **PUT** | `/api/profile/projects/[id]` | Update project details, technology tags, and bullets | ✅ |
| **DELETE** | `/api/profile/projects/[id]` | Delete a project entry | ✅ |
| **PUT** | `/api/profile/skills` | Overwrite the complete flat skills list for the user | ✅ |
| **PUT** | `/api/profile/references` | Overwrite the complete references list | ✅ |
| **POST** | `/api/profile/summaries/generate` | Trigger LLM to generate a summary based on profile + instructions | ✅ |
| **POST** | `/api/profile/parse` | SSE endpoint: upload CV file and stream progress/data events | ✅ |
| **POST** | `/api/auth/[...nextauth]` | NextAuth.js authentication endpoint handler | ❌ |
| **POST** | `/api/auth/register` | Register a new user account (email + password) | ❌ |
| **POST** | `/api/auth/forgot-password` | Request password reset (delivers email via Resend) | ❌ |
| **POST** | `/api/auth/reset-password` | Validate reset token and update password | ❌ |

---

## 2. Canonical TypeScript DTOs (`src/types/profile.ts`)

```typescript
export type ProficiencyLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export type BulletType = 'BULLET' | 'PARAGRAPH';

export interface BulletDTO {
  id: string;
  text: string;
  isActive: boolean;
  isArchived: boolean;
  type: BulletType;
  sortOrder: number;
  usedInCVs: Array<{ id: string; name: string }>;  // Computed at GET time via CVBullet join
}

export interface BasicDataDTO {
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  github: string | null;
  website: string | null;
  title: string | null;    // Synced from active summary
  summary: string | null;  // Synced from active summary
}

export interface SummaryDTO {
  id: string;
  title: string;
  content: string;
  isActive: boolean;
  isAIGenerated: boolean;
  sortOrder: number;
}

export interface ExperienceDTO {
  id: string;
  company: string;
  position: string;
  startDate: string;          // ISO Date string
  endDate: string | null;     // ISO Date string or null
  current: boolean;
  bullets: BulletDTO[];       // Always "bullets", never "description"
  freeFormContext: string | null;
}

export interface EducationDTO {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy: string | null;
  startDate: string;          // ISO Date string
  endDate: string | null;     // ISO Date string or null
  current: boolean;
  hideEndDate: boolean;
  bullets: BulletDTO[];
  freeFormContext: string | null;
}

export interface ProjectDTO {
  id: string;
  name: string;
  startDate: string | null;   // ISO Date string or null
  endDate: string | null;     // ISO Date string or null
  current: boolean;
  technologies: string[];     // Tag list
  bullets: BulletDTO[];
  freeFormContext: string | null;
}

export interface SkillDTO {
  id: string;
  name: string;
  proficiency: ProficiencyLevel;
  yearsExperience: number | null;
}

export interface ReferenceDTO {
  id: string;
  name: string;
  company: string | null;
  relationship: string | null;
  email: string | null;
  phone: string | null;
  canContact: boolean;
}

export interface CVVersionDTO {
  id: string;
  name: string;               // User-defined version label
  s3Key: string | null;       // Saved in S3 (Phase 3)
  createdAt: string;          // ISO Date string
}

export interface ProfileDTO {
  id: string;
  basicData: BasicDataDTO;
  experiences: ExperienceDTO[];
  education: EducationDTO[];
  projects: ProjectDTO[];
  skills: SkillDTO[];
  references: ReferenceDTO[];
  summaries: SummaryDTO[];
  cvs: CVVersionDTO[];
}

// SSE Progress Event Types (src/types/parse.ts)
export type ParseProgressEvent =
  | { phase: 'upload';      progress: 20;  status: string }
  | { phase: 'basic';       progress: 40;  status: string; data: BasicDataDTO }
  | { phase: 'experiences'; progress: 60;  status: string; data: ExperienceDTO[] }
  | { phase: 'projects';    progress: 80;  status: string; data: ProjectDTO[] }
  | { phase: 'education';   progress: 100; status: string; data: { education: EducationDTO[]; skills: SkillDTO[] } }
  | { phase: 'error';       progress: number; error: string };
```
