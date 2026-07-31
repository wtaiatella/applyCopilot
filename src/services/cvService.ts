import type { CVSnapshotData } from "@/types/cv";

export interface CVDTO {
  id: string;
  jobListingId: string;
  status: "DRAFT" | "APPLIED";
  appliedAt: string | null;
  createdAt: string;
}

export interface CVDetailDTO {
  id: string;
  jobListingId: string;
  status: "DRAFT" | "APPLIED";
  appliedAt: string | null;
  snapshotData: CVSnapshotData;
}

/**
 * Client fetch wrapper for `/api/cv/*` (mirrors `profileService.ts`).
 */
export class CVService {
  /**
   * Idempotent create-or-get: returns the existing CV for this job if one already exists (AC.2).
   */
  static async createOrGetCV(jobListingId: string): Promise<CVDTO> {
    const response = await fetch("/api/cv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobListingId }),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        errData.error || `Failed to create CV: ${response.statusText}`,
      );
    }
    return response.json();
  }

  static async getCV(cvId: string): Promise<CVDetailDTO> {
    const response = await fetch(`/api/cv/${cvId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch CV: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Autosave the whole snapshot blob (DRAFT-only; whole-payload replace per API Contracts).
   * Backs `CVComposerContext`'s debounced autosave.
   */
  static async updateSnapshot(
    cvId: string,
    snapshotData: CVSnapshotData,
  ): Promise<{ savedAt: string }> {
    const response = await fetch(`/api/cv/${cvId}/snapshot`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshotData),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        errData.error || `Failed to save CV snapshot: ${response.statusText}`,
      );
    }
    return response.json();
  }

  /**
   * Discard local edits and re-clone the snapshot from the live Profile (FR-11, AC.4, DRAFT-only).
   */
  static async resetCV(
    cvId: string,
  ): Promise<{ snapshotData: CVSnapshotData }> {
    const response = await fetch(`/api/cv/${cvId}/reset`, {
      method: "POST",
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        errData.error || `Failed to reset CV: ${response.statusText}`,
      );
    }
    return response.json();
  }

  /**
   * Fetches the rendered PDF as a Blob (repeatable, no status change; FR-12, AC.7).
   */
  static async downloadPdf(cvId: string): Promise<Blob> {
    const response = await fetch(`/api/cv/${cvId}/pdf`);
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        errData.error || `Failed to generate PDF: ${response.statusText}`,
      );
    }
    return response.blob();
  }

  /**
   * Triggers an on-demand match-score calculation (FR-13, AC.8) — never called automatically.
   */
  static async calculateMatchScore(
    cvId: string,
  ): Promise<{ score: number; computedAt: string }> {
    const response = await fetch(`/api/cv/${cvId}/match-score`, {
      method: "POST",
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        errData.error ||
          `Failed to calculate match score: ${response.statusText}`,
      );
    }
    return response.json();
  }

  /**
   * "Aplicar Vaga" — one-time commit: freezes the CV and triggers reconciliation into the
   * master Profile (FR-14–FR-18, AC.9, AC.11).
   */
  static async applyCV(
    cvId: string,
  ): Promise<{ id: string; status: "APPLIED"; appliedAt: string }> {
    const response = await fetch(`/api/cv/${cvId}/apply`, {
      method: "POST",
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        errData.error || `Failed to apply CV: ${response.statusText}`,
      );
    }
    return response.json();
  }
}
