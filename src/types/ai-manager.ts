export type AISdkType = "GOOGLE_GENAI" | "OPENAI_COMPATIBLE" | "OLLAMA";
export type AITier = "FREE" | "LOCAL";

export type AIRouteId =
  | "cv.parse.basicData"
  | "cv.parse.experiences"
  | "cv.parse.projects"
  | "cv.parse.education"
  | "cv.parse.skills"
  | "jobs.classification"
  | "jobs.deepAnalysis"
  | "profile.summaryGenerate"
  | "profile.bulletReviewAll"
  | "profile.bulletImprove"
  | "profile.bulletGenerate"
  | "profile.summaryAI"
  | "profile.syncFacts"
  | "profile.skillAlias"
  | "profile.projectSuggest"
  | "profile.skillsSuggest";

export interface AIProviderDTO {
  id: string;
  name: string;
  sdkType: AISdkType;
  apiKeyEnvVar: string | null;
  baseUrl: string | null;
  createdAt: string;
  updatedAt: string;
  models?: AIModelDTO[];
}

export interface AIModelDTO {
  id: string;
  providerId: string;
  providerName?: string;
  displayName: string;
  modelId: string;
  tier: AITier;
  rpm: number;
  rpd: number;
  tpm: number;
  tpd: number;
  safetyMargin: number;
  isEnabled: boolean;
  blockedUntil: string | null;
  isBlocked?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AIRoutePreferenceDTO {
  routeId: AIRouteId;
  groupName: string;
  displayName: string;
  preferredTier: AITier;
  isWorker: boolean;
  updatedAt: string;
}

export interface AIModelUsageDashboardDTO {
  id: string;
  displayName: string;
  providerName: string;
  tier: AITier;
  isEnabled: boolean;
  isBlocked: boolean;
  blockedUntil: string | null;
  rpm: number;
  rpd: number;
  effectiveRpm: number;
  effectiveRpd: number;
  usageMin: number;
  usageDay: number;
  resetsMinInSeconds: number;
  resetsDayInSeconds: number;
}

export interface AIDashboardSummaryDTO {
  totalCallsToday: number;
  blockedModelsCount: number;
  nearQuotaModelsCount: number;
}

export interface AIDashboardResponseDTO {
  summary: AIDashboardSummaryDTO;
  models: AIModelUsageDashboardDTO[];
}
