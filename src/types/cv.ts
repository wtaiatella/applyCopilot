import type { ProficiencyLevel } from "./profile";

export interface CVSnapshotBasicData {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  github: string | null;
  website: string | null;
  title: string | null;
}

export interface CVSnapshotBullet {
  id: string; // snapshot-local id (cuid-style, client- or server-generated)
  sourceBulletId: string | null; // master ExperienceBullet/ProjectBullet/EducationBullet.id, or null if created fresh in this CV
  text: string;
  type: "BULLET" | "PARAGRAPH";
  included: boolean; // FR-3a: independent of mere presence in the pool — this is what CV Editor's
  // SortableBulletItem renders/writes via its `isActive` prop (component reuse mapping)
  sortOrder: number;
}

export interface CVSnapshotSummary {
  id: string;
  sourceSummaryId: string | null;
  title: string;
  content: string;
  isAIGenerated: boolean;
  included: boolean; // exactly one is expected active for render, enforced in CVEditor's Basic Data section
}

export interface CVSnapshotSkill {
  id: string;
  sourceSkillId: string | null;
  name: string;
  proficiency: ProficiencyLevel;
  yearsExperience: number | null;
  included: boolean;
}

export interface CVSnapshotExperience {
  id: string;
  sourceExperienceId: string | null; // FR-16: null for a brand-new entity created fresh in this CV
  company: string;
  position: string;
  startDate: string; // ISO Date string
  endDate: string | null; // ISO Date string or null
  current: boolean;
  tabLabel: string | null;
  freeFormContext: string[];
  bullets: CVSnapshotBullet[];
}

export interface CVSnapshotEducation {
  id: string;
  sourceEducationId: string | null; // FR-16: null for a brand-new entity created fresh in this CV
  institution: string;
  degree: string;
  fieldOfStudy: string | null;
  startDate: string; // ISO Date string
  endDate: string | null; // ISO Date string or null
  current: boolean;
  hideEndDate: boolean;
  tabLabel: string | null;
  freeFormContext: string[];
  bullets: CVSnapshotBullet[];
}

export interface CVSnapshotProject {
  id: string;
  sourceProjectId: string | null; // FR-16: null for a brand-new entity created fresh in this CV
  name: string;
  startDate: string | null; // ISO Date string or null
  endDate: string | null; // ISO Date string or null
  current: boolean;
  technologies: string[];
  tabLabel: string | null;
  freeFormContext: string[];
  bullets: CVSnapshotBullet[];
}

export interface CVSnapshotData {
  version: 1; // forward-compat: allows a future shape change to be migrated on read
  basicData: CVSnapshotBasicData;
  summaries: CVSnapshotSummary[];
  experiences: CVSnapshotExperience[];
  education: CVSnapshotEducation[];
  projects: CVSnapshotProject[];
  skills: CVSnapshotSkill[];
}
