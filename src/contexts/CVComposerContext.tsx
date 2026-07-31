"use client";

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
} from "react";
import { CVService, CVDetailDTO } from "../services/cvService";
import type { CVSnapshotData } from "../types/cv";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface CVComposerContextType {
  cv: CVDetailDTO | null;
  loading: boolean;
  saveStatus: SaveStatus;
  error: string | null;

  loadOrCreateCV: (jobListingId: string) => Promise<void>;
  refreshCV: () => Promise<void>;
  updateSnapshotState: (data: Partial<CVSnapshotData>) => void;
  resetCV: () => Promise<void>;
  applyCV: () => Promise<void>;
}

const CVComposerContext = createContext<CVComposerContextType | undefined>(
  undefined,
);

export function CVComposerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cv, setCV] = useState<CVDetailDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up any pending debounced save on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const refreshCV = async () => {
    if (!cv) return;
    try {
      setLoading(true);
      const data = await CVService.getCV(cv.id);
      setCV(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Failed to load CV.");
    } finally {
      setLoading(false);
    }
  };

  // Loads the existing CV for this job, or creates it (idempotent create-or-get, AC.1/AC.2).
  const loadOrCreateCV = async (jobListingId: string) => {
    try {
      setLoading(true);
      setError(null);
      const created = await CVService.createOrGetCV(jobListingId);
      const detail = await CVService.getCV(created.id);
      setCV(detail);
    } catch (err) {
      console.error(err);
      setError("Failed to load or create CV.");
    } finally {
      setLoading(false);
    }
  };

  // Debounced autosave, mirrors `ProfileContext.tsx`'s `registerPendingSave` (single-blob PUT).
  const registerPendingSave = (nextSnapshot: CVSnapshotData) => {
    if (!cv) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setSaveStatus("saving");

    timeoutRef.current = setTimeout(async () => {
      try {
        await CVService.updateSnapshot(cv.id, nextSnapshot);
        setSaveStatus("saved");
      } catch (err) {
        console.error("CV snapshot save failed:", err);
        setSaveStatus("error");
        setError("Background save failed.");
      } finally {
        timeoutRef.current = null;
      }
    }, 1500);
  };

  const updateSnapshotState = (data: Partial<CVSnapshotData>) => {
    if (!cv) return;

    const updatedSnapshot: CVSnapshotData = { ...cv.snapshotData, ...data };

    setCV({ ...cv, snapshotData: updatedSnapshot });
    registerPendingSave(updatedSnapshot);
  };

  // Discards local edits and re-clones the snapshot from the live Profile (FR-11, AC.4, DRAFT-only).
  const resetCV = async () => {
    if (!cv) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const { snapshotData } = await CVService.resetCV(cv.id);
    setCV({ ...cv, snapshotData });
    setSaveStatus("idle");
  };

  // "Aplicar Vaga" — one-time commit; freezes the CV and triggers Profile reconciliation
  // (FR-14–FR-18, AC.9, AC.11). Cancels any pending autosave first so no further DRAFT write
  // races the freeze.
  const applyCV = async () => {
    if (!cv) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const { status, appliedAt } = await CVService.applyCV(cv.id);
    setCV({ ...cv, status, appliedAt });
    setSaveStatus("idle");
  };

  return (
    <CVComposerContext.Provider
      value={{
        cv,
        loading,
        saveStatus,
        error,
        loadOrCreateCV,
        refreshCV,
        updateSnapshotState,
        resetCV,
        applyCV,
      }}
    >
      {children}
    </CVComposerContext.Provider>
  );
}

export function useCVComposer() {
  const context = useContext(CVComposerContext);
  if (context === undefined) {
    throw new Error("useCVComposer must be used within a CVComposerProvider");
  }
  return context;
}
