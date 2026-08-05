import type {
  ApplicationBoardRow,
  ApplicationStage,
  ApplicationOutcome,
  ApplicationDTO,
  ApplicationEventDTO,
} from "@/types/application";

export interface StageTransitionResult {
  id: string;
  stage: ApplicationStage;
  outcome: ApplicationOutcome | null;
  eventId: string;
}

export interface UndoResult {
  id: string;
  stage: ApplicationStage;
  outcome: ApplicationOutcome | null;
}

export interface ApplicationForCVResult {
  application: ApplicationDTO;
  events: ApplicationEventDTO[];
}

export type AddEventInput =
  | { type: "NOTE"; content: string }
  | { type: "MEETING"; title: string; eventAt: string; content?: string }
  | { type: "COMPANY_RESPONSE"; content: string };

/**
 * Client fetch wrapper for `/api/applications/*` (mirrors `cvService.ts`'s naming/shape
 * convention). This is the single call site both `KanbanBoard.tsx`'s `onDragEnd` and
 * `ApplicationCard.tsx`'s dropdown `onChange` use for stage transitions — never duplicate the
 * underlying `fetch('/api/applications/.../stage', ...)` call inline in either component, so
 * FR-5's "identical effects" guarantee is visible in the code, not just true by coincidence
 * (Implementation Notes).
 */
export class ApplicationTrackerService {
  /** Kanban board read (FR-14, FR-15). */
  static async getApplications(): Promise<ApplicationBoardRow[]> {
    const response = await fetch("/api/applications");
    if (!response.ok) {
      throw new Error(`Failed to fetch applications: ${response.statusText}`);
    }
    const data = (await response.json()) as {
      applications: ApplicationBoardRow[];
    };
    return data.applications;
  }

  /**
   * Stage transition (FR-4–FR-6, AC.2, AC.4) — the same endpoint the dropdown and drag-and-drop
   * both call.
   */
  static async transitionStage(
    applicationId: string,
    input: { stage: ApplicationStage; outcome?: ApplicationOutcome },
  ): Promise<StageTransitionResult> {
    const response = await fetch(`/api/applications/${applicationId}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        errData.error || `Failed to transition stage: ${response.statusText}`,
      );
    }
    return response.json();
  }

  /** Reverts the most recent transition (FR-8, AC.3). */
  static async undoTransition(
    applicationId: string,
    eventId: string,
  ): Promise<UndoResult> {
    const response = await fetch(`/api/applications/${applicationId}/undo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId }),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        errData.error || `Failed to undo transition: ${response.statusText}`,
      );
    }
    return response.json();
  }

  /**
   * Tab 5 read (FR-12), keyed by `cvId` — see spectech.md Technical Decisions. Returns `null` for
   * the not-yet-Applied 404 case, so `ApplicationTab.tsx` can render its empty state instead of
   * an error (Error Handling Strategy).
   */
  static async getForCV(cvId: string): Promise<ApplicationForCVResult | null> {
    const response = await fetch(`/api/cv/${cvId}/application`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch Application: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Manual timeline entry (FR-9, AC.5, AC.6) — the same endpoint the board's own detail modal
   * would use, regardless of which surface (tab or modal) triggers it.
   */
  static async addEvent(
    applicationId: string,
    input: AddEventInput,
  ): Promise<ApplicationEventDTO> {
    const response = await fetch(`/api/applications/${applicationId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        errData.error || `Failed to add event: ${response.statusText}`,
      );
    }
    return response.json();
  }
}
