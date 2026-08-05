// Application Tracker domain DTOs and unions (spec: 009-aplication-tracker).
// Plain DTOs — never raw Prisma model instances — matching CVSnapshotData's
// service-boundary convention (see spectech.md "Boundaries & coupling").

export type ApplicationStage =
  | "APPLIED"
  | "SCREENING"
  | "TECH_INTERVIEW"
  | "OFFER"
  | "FINAL";

export type ApplicationOutcome =
  | "NOT_APPROVED"
  | "NO_RESPONSE"
  | "DECLINED_BY_COMPANY"
  | "DECLINED_BY_CANDIDATE"
  | "HIRED";

export type ApplicationEventType =
  | "STAGE_CHANGE"
  | "NOTE"
  | "MEETING"
  | "COMPANY_RESPONSE";

export interface ApplicationDTO {
  id: string;
  jobListingId: string;
  stage: ApplicationStage;
  outcome: ApplicationOutcome | null;
  createdAt: string; // ISO
}

export interface ApplicationEventDTO {
  id: string;
  type: ApplicationEventType;
  fromStage: ApplicationStage | null;
  toStage: ApplicationStage | null;
  title: string | null;
  eventAt: string | null; // ISO, MEETING only
  content: string | null;
  createdAt: string; // ISO — the field the timeline orders by (see Clarifications)
}

export interface ApplicationBoardRow {
  id: string;
  jobListingId: string;
  jobTitle: string;
  company: string;
  stage: ApplicationStage;
  outcome: ApplicationOutcome | null;
  updatedAt: string; // ISO
}

export interface TrackerListRow {
  jobId: string;
  title: string;
  company: string;
  favorite: boolean;
  deepAnalysisDone: boolean;
  cvStatus: "not_started" | "draft" | "applied";
  applicationStage: ApplicationStage | null;
}
