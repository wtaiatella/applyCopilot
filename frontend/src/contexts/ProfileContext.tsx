"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { 
  ProfileDTO, 
  BasicDataDTO, 
  ExperienceDTO, 
  EducationDTO, 
  ProjectDTO, 
  SkillDTO, 
  ReferenceDTO 
} from "../types/profile";
import { ProfileService } from "../services/profileService";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface ProfileContextType {
  profile: ProfileDTO | null;
  loading: boolean;
  saveStatus: SaveStatus;
  error: string | null;
  refreshProfile: () => Promise<void>;
  
  updateBasicDataState: (data: Partial<BasicDataDTO>) => void;
  
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
  updateReferencesState: (references: ReferenceDTO[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handlePartialData: (phase: string, data: any) => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Track pending save operations
  const activeSavesRef = useRef<Set<string>>(new Set());
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

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
  const updateBasicDataState = (data: Partial<BasicDataDTO>) => {
    if (!profile) return;

    const updatedBasic = { ...profile.basicData, ...data };
    setProfile({
      ...profile,
      basicData: updatedBasic,
    });

    registerPendingSave("basicData", async () => {
      await ProfileService.updateBasicData(updatedBasic);
    });
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
        await ProfileService.updateExperience(id, targetExp);
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
        await ProfileService.updateEducation(id, targetEd);
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
        await ProfileService.updateProject(id, targetProj);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePartialData = (phase: string, data: any) => {
    if (!profile) return;
    if (phase === "basic") {
      setProfile((prev) => (prev ? { ...prev, basicData: data } : null));
    } else if (phase === "experiences") {
      setProfile((prev) => (prev ? { ...prev, experiences: data } : null));
    } else if (phase === "projects") {
      setProfile((prev) => (prev ? { ...prev, projects: data } : null));
    } else if (phase === "education") {
      setProfile((prev) => (prev ? { ...prev, education: data.education, skills: data.skills } : null));
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
        updateReferencesState,
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
