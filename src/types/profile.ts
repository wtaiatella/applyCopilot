export type ProficiencyLevel =
  | "BEGINNER"
  | "INTERMEDIATE"
  | "ADVANCED"
  | "EXPERT";
export type BulletType = "BULLET" | "PARAGRAPH";

export interface BulletDTO {
  id: string;
  text: string;
  isActive: boolean;
  isArchived: boolean;
  type: BulletType;
  sortOrder: number;
  usedInCVs: Array<{ id: string; name: string; jobListingId: string }>; // Computed at GET time via CVBullet join
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
  title: string | null; // Synced from active summary
  summary: string | null; // Synced from active summary
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
  startDate: string; // ISO Date string
  endDate: string | null; // ISO Date string or null
  current: boolean;
  bullets: BulletDTO[]; // Always "bullets", never "description"
  freeFormContext: string[]; // Array of user-authored AI context notes
  tabLabel: string | null; // Optional short display name for the tab; does not affect company
}

export interface EducationDTO {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy: string | null;
  startDate: string; // ISO Date string
  endDate: string | null; // ISO Date string or null
  current: boolean;
  hideEndDate: boolean;
  bullets: BulletDTO[];
  freeFormContext: string[]; // Array of user-authored AI context notes
  tabLabel: string | null; // Optional short display name for the tab; does not affect institution
}

export interface ProjectDTO {
  id: string;
  name: string;
  startDate: string | null; // ISO Date string or null
  endDate: string | null; // ISO Date string or null
  current: boolean;
  technologies: string[]; // Tag list
  bullets: BulletDTO[];
  freeFormContext: string[]; // Array of user-authored AI context notes
  tabLabel: string | null; // Optional short display name for the tab; does not affect name
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
  name: string; // User-defined version label
  s3Key: string | null; // Saved in S3 (Phase 3)
  createdAt: string; // ISO Date string
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
  embeddingSyncedAt?: string | null;
  aiCleanedText?: string | null;
}

// --- Match Score v2 (014) ---

export type SeniorityLevel = "junior" | "mid" | "senior" | "lead" | "principal";

// Client-facing shape for GET/PUT /api/profile/preferences — mirrors
// UserPreferencesInput (src/lib/validation/preferencesSchemas.ts). Every field is
// nullable: null is a meaningful tri-state value ("indifferent"/"not stated"), not
// "unset". GET returns this all-null shape by default when the user never saved
// preferences (spectech.md Clarifications & Assumptions).
export interface UserPreferencesDTO {
  seniority: SeniorityLevel | null;
  totalYearsExperience: number | null;

  acceptsContract: boolean | null;
  acceptsFreelance: boolean | null;
  acceptsOnsite: boolean | null;
  acceptsHybrid: boolean | null;
  acceptsRemote: boolean | null;

  onlyWorldwide: boolean | null;
  hasUsWorkAuth: boolean | null;
  requiresVisaRelocation: boolean | null;

  salaryMin: number | null;
  salaryCurrency: string | null;

  excludeKeywords: string[];
}

export type ParseProgressEvent =
  | { phase: "upload"; progress: number; status: string }
  | { phase: "basic"; progress: number; status: string; data?: BasicDataDTO }
  | {
      phase: "experiences";
      progress: number;
      status: string;
      data?: ExperienceDTO[];
    }
  | { phase: "projects"; progress: number; status: string; data?: ProjectDTO[] }
  | {
      phase: "education";
      progress: number;
      status: string;
      data?: { education: EducationDTO[]; skills: SkillDTO[] };
    }
  | { phase: "error"; progress: number; error: string };
