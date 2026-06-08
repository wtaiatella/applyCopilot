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
