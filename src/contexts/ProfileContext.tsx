"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";
import {
  ProfileDTO,
  BasicDataDTO,
  ExperienceDTO,
  EducationDTO,
  ProjectDTO,
  SkillDTO,
  ReferenceDTO,
  SummaryDTO,
  ParseProgressEvent,
} from "../types/profile";
import { ProfileService } from "../services/profileService";
import { isValidUrl } from "../lib/validation/profileSchemas";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface ProfileContextType {
  profile: ProfileDTO | null;
  loading: boolean;
  saveStatus: SaveStatus;
  error: string | null;
  refreshProfile: () => Promise<void>;

  updateBasicDataState: (
    data: Partial<BasicDataDTO> & { summaries?: SummaryDTO[] },
  ) => void;

  addExperience: () => Promise<void>;
  updateExperienceState: (id: string, data: Partial<ExperienceDTO>) => void;
  deleteExperience: (id: string) => Promise<void>;

  addEducation: () => Promise<void>;
  updateEducationState: (id: string, data: Partial<EducationDTO>) => void;
  deleteEducation: (id: string) => Promise<void>;

  addProject: () => Promise<void>;
  updateProjectState: (id: string, data: Partial<ProjectDTO>) => void;
  deleteProject: (id: string) => Promise<void>;

  updateSkillsState: (skills: SkillDTO[]) => void;
  suggestSkills: () => Promise<void>;
  updateReferencesState: (references: ReferenceDTO[]) => void;
  syncProfile: () => Promise<void>;
  isSyncOutOfDate: boolean;
  lastSyncedAt: number | null;
  handlePartialData: (event: ParseProgressEvent) => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isSyncOutOfDate, setIsSyncOutOfDate] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  // Track pending save operations
  const activeSavesRef = useRef<Set<string>>(new Set());
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pendingBasicDataChangesRef = useRef<
    Partial<BasicDataDTO> & { summaries?: SummaryDTO[] }
  >({});

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      timeoutsRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const refreshProfile = async () => {
    try {
      setLoading(true);
      const data = await ProfileService.getProfile();
      setProfile(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Failed to load profile.");
    } finally {
      setLoading(false);
    }
  };

  // Load initial profile
  useEffect(() => {
    Promise.resolve().then(() => {
      refreshProfile();
    });
  }, []);

  // Central helper to manage debounced saves
  const registerPendingSave = (key: string, saveFn: () => Promise<void>) => {
    // 1. Clear existing timeout for this key
    const existingTimeout = timeoutsRef.current.get(key);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    setSaveStatus("saving");
    activeSavesRef.current.add(key);
    setIsSyncOutOfDate(true);

    // 2. Set new timeout for 1.5 seconds
    const timeout = setTimeout(async () => {
      try {
        await saveFn();
        activeSavesRef.current.delete(key);
        if (activeSavesRef.current.size === 0) {
          setSaveStatus("saved");
        }
      } catch (err) {
        console.error(`Save failed for ${key}:`, err);
        setSaveStatus("error");
        setError("Background save failed.");
      } finally {
        timeoutsRef.current.delete(key);
      }
    }, 1500);

    timeoutsRef.current.set(key, timeout);
  };

  // 1. Basic Data Autosave
  const updateBasicDataState = (
    data: Partial<BasicDataDTO> & { summaries?: SummaryDTO[] },
  ) => {
    if (!profile) return;

    const { summaries, ...basicFields } = data;

    const updatedBasic = { ...profile.basicData, ...basicFields };
    const updatedSummaries =
      summaries !== undefined ? summaries : profile.summaries;

    // Synchronize active summary title/content to basic fields if summaries were updated
    if (summaries !== undefined) {
      const activeSummary = summaries.find((s) => s.isActive);
      if (activeSummary) {
        updatedBasic.title = activeSummary.title;
        updatedBasic.summary = activeSummary.content;
      } else {
        updatedBasic.title = null;
        updatedBasic.summary = null;
      }
    }

    setProfile({
      ...profile,
      basicData: updatedBasic,
      summaries: updatedSummaries,
    });

    const newPendingChanges = { ...pendingBasicDataChangesRef.current };

    for (const key of Object.keys(basicFields) as Array<keyof BasicDataDTO>) {
      const val = basicFields[key];
      if (key === "linkedin" || key === "github" || key === "website") {
        if (isValidUrl(val)) {
          newPendingChanges[key] = val;
        } else {
          // If invalid URL is entered, do not save it, remove it from queue.
          delete newPendingChanges[key];
        }
      } else {
        (newPendingChanges as Record<string, unknown>)[key] = val;
      }
    }

    if (summaries !== undefined) {
      const cleaned = summaries.map((s) => {
        if (s.id && s.id.startsWith("temp-")) {
          const copy: Partial<SummaryDTO> = { ...s };
          delete copy.id;
          return copy;
        }
        return s;
      });
      newPendingChanges.summaries = cleaned as SummaryDTO[];
    }

    pendingBasicDataChangesRef.current = newPendingChanges;

    if (Object.keys(pendingBasicDataChangesRef.current).length > 0) {
      registerPendingSave("basicData", async () => {
        const payload = { ...pendingBasicDataChangesRef.current };
        pendingBasicDataChangesRef.current = {};
        await ProfileService.updateBasicData(payload);
      });
    }
  };

  // 2. Experiences CRUD
  const addExperience = async () => {
    if (!profile) return;
    try {
      setSaveStatus("saving");
      // Pre-create experience on backend to get ID
      const newExp = await ProfileService.createExperience({
        company: "New Company",
        position: "New Position",
        startDate: new Date().toISOString(),
        bullets: [],
      });

      setProfile({
        ...profile,
        experiences: [newExp, ...profile.experiences],
      });
      setSaveStatus("saved");
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
      setError("Failed to add experience.");
    }
  };

  const updateExperienceState = (id: string, data: Partial<ExperienceDTO>) => {
    if (!profile) return;

    const updatedExperiences = profile.experiences.map((exp) => {
      if (exp.id === id) {
        return { ...exp, ...data };
      }
      return exp;
    });

    setProfile({
      ...profile,
      experiences: updatedExperiences,
    });

    const targetExp = updatedExperiences.find((e) => e.id === id);
    if (targetExp) {
      registerPendingSave(`experience_${id}`, async () => {
        const payload = {
          ...targetExp,
          bullets: targetExp.bullets.map((b) => {
            if (b.id && b.id.startsWith("temp-")) {
              const copy: Partial<typeof b> = { ...b };
              delete copy.id;
              return copy;
            }
            return b;
          }),
        };
        await ProfileService.updateExperience(
          id,
          payload as Partial<ExperienceDTO>,
        );
      });
    }
  };

  const deleteExperience = async (id: string) => {
    if (!profile) return;
    try {
      setSaveStatus("saving");
      await ProfileService.deleteExperience(id);
      setProfile({
        ...profile,
        experiences: profile.experiences.filter((exp) => exp.id !== id),
      });
      setSaveStatus("saved");
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
      setError("Failed to delete experience.");
    }
  };

  // 3. Education CRUD
  const addEducation = async () => {
    if (!profile) return;
    try {
      setSaveStatus("saving");
      const newEd = await ProfileService.createEducation({
        institution: "New Institution",
        degree: "New Degree",
        startDate: new Date().toISOString(),
        bullets: [],
      });

      setProfile({
        ...profile,
        education: [newEd, ...profile.education],
      });
      setSaveStatus("saved");
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
      setError("Failed to add education.");
    }
  };

  const updateEducationState = (id: string, data: Partial<EducationDTO>) => {
    if (!profile) return;

    const updatedEdList = profile.education.map((ed) => {
      if (ed.id === id) {
        return { ...ed, ...data };
      }
      return ed;
    });

    setProfile({
      ...profile,
      education: updatedEdList,
    });

    const targetEd = updatedEdList.find((e) => e.id === id);
    if (targetEd) {
      registerPendingSave(`education_${id}`, async () => {
        const payload = {
          ...targetEd,
          bullets: targetEd.bullets.map((b) => {
            if (b.id && b.id.startsWith("temp-")) {
              const copy: Partial<typeof b> = { ...b };
              delete copy.id;
              return copy;
            }
            return b;
          }),
        };
        await ProfileService.updateEducation(
          id,
          payload as Partial<EducationDTO>,
        );
      });
    }
  };

  const deleteEducation = async (id: string) => {
    if (!profile) return;
    try {
      setSaveStatus("saving");
      await ProfileService.deleteEducation(id);
      setProfile({
        ...profile,
        education: profile.education.filter((ed) => ed.id !== id),
      });
      setSaveStatus("saved");
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
      setError("Failed to delete education.");
    }
  };

  // 4. Projects CRUD
  const addProject = async () => {
    if (!profile) return;
    try {
      setSaveStatus("saving");
      const newProj = await ProfileService.createProject({
        name: "New Project",
        technologies: [],
        bullets: [],
      });

      setProfile({
        ...profile,
        projects: [newProj, ...profile.projects],
      });
      setSaveStatus("saved");
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
      setError("Failed to add project.");
    }
  };

  const updateProjectState = (id: string, data: Partial<ProjectDTO>) => {
    if (!profile) return;

    const updatedProjects = profile.projects.map((proj) => {
      if (proj.id === id) {
        return { ...proj, ...data };
      }
      return proj;
    });

    setProfile({
      ...profile,
      projects: updatedProjects,
    });

    const targetProj = updatedProjects.find((p) => p.id === id);
    if (targetProj) {
      registerPendingSave(`project_${id}`, async () => {
        const payload = {
          ...targetProj,
          bullets: targetProj.bullets.map((b) => {
            if (b.id && b.id.startsWith("temp-")) {
              const copy: Partial<typeof b> = { ...b };
              delete copy.id;
              return copy;
            }
            return b;
          }),
        };
        await ProfileService.updateProject(id, payload as Partial<ProjectDTO>);
      });
    }
  };

  const deleteProject = async (id: string) => {
    if (!profile) return;
    try {
      setSaveStatus("saving");
      await ProfileService.deleteProject(id);
      setProfile({
        ...profile,
        projects: profile.projects.filter((proj) => proj.id !== id),
      });
      setSaveStatus("saved");
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
      setError("Failed to delete project.");
    }
  };

  // 5. Skills replace
  const updateSkillsState = (skills: SkillDTO[]) => {
    if (!profile) return;

    setProfile({
      ...profile,
      skills,
    });

    registerPendingSave("skills", async () => {
      await ProfileService.updateSkills(skills);
    });
  };

  // 5b. Skills suggest
  const suggestSkills = async () => {
    if (!profile) return;
    try {
      setSaveStatus("saving");
      const updatedSkills = await ProfileService.suggestSkills();
      setProfile({
        ...profile,
        skills: updatedSkills,
      });
      setSaveStatus("saved");
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
      setError("Failed to extract skills.");
      throw err;
    }
  };

  // 6. References replace
  const updateReferencesState = (references: ReferenceDTO[]) => {
    if (!profile) return;

    setProfile({
      ...profile,
      references,
    });

    registerPendingSave("references", async () => {
      await ProfileService.updateReferences(references);
    });
  };

  const handlePartialData = (event: ParseProgressEvent) => {
    if (!profile) return;
    switch (event.phase) {
      case "basic":
        if (!event.data) return;
        // Update the flat basicData fields immediately from SSE data
        setProfile((prev) =>
          prev ? { ...prev, basicData: event.data! } : null,
        );
        // The backend also created/updated a ProfileSummary for this import.
        // Refresh the full profile so the new summary appears in the summaries list
        // without requiring a manual page reload.
        refreshProfile();
        break;
      case "experiences":
        if (!event.data) return;
        setProfile((prev) =>
          prev ? { ...prev, experiences: event.data! } : null,
        );
        break;
      case "projects":
        if (!event.data) return;
        setProfile((prev) =>
          prev ? { ...prev, projects: event.data! } : null,
        );
        break;
      case "education":
        if (!event.data) return;
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                education: event.data!.education,
                skills: event.data!.skills,
              }
            : null,
        );
        break;
      default:
        break;
    }
  };

  const syncProfile = async () => {
    if (!profile) return;
    try {
      setSaveStatus("saving");
      await ProfileService.syncProfile();
      await refreshProfile();
      setIsSyncOutOfDate(false);
      setLastSyncedAt(Date.now());
      setSaveStatus("saved");
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
      setError(err instanceof Error ? err.message : "AI sync failed.");
      throw err;
    }
  };

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loading,
        saveStatus,
        error,
        refreshProfile,
        updateBasicDataState,
        addExperience,
        updateExperienceState,
        deleteExperience,
        addEducation,
        updateEducationState,
        deleteEducation,
        addProject,
        updateProjectState,
        deleteProject,
        updateSkillsState,
        suggestSkills,
        updateReferencesState,
        syncProfile,
        isSyncOutOfDate,
        lastSyncedAt,
        handlePartialData,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfileContext() {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error("useProfileContext must be used within a ProfileProvider");
  }
  return context;
}
