import { create } from 'zustand'
import { Profile, Education, Experience, Project } from '@/types'

interface ProfileStore {
  profile: Profile | null
  experiences: Experience[]
  education: Education[]
  projects: Project[]
  isLoading: boolean
  error: string | null
  
  setProfile: (profile: Profile) => void
  setExperiences: (experiences: Experience[]) => void
  setEducation: (education: Education[]) => void
  setProjects: (projects: Project[]) => void
  addExperience: (experience: Experience) => void
  updateExperience: (id: number, experience: Partial<Experience>) => void
  removeExperience: (id: number) => void
  addEducation: (education: Education) => void
  updateEducation: (id: number, education: Partial<Education>) => void
  removeEducation: (id: number) => void
  addProject: (project: Project) => void
  updateProject: (id: number, project: Partial<Project>) => void
  removeProject: (id: number) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearProfile: () => void
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  profile: null,
  experiences: [],
  education: [],
  projects: [],
  isLoading: false,
  error: null,

  setProfile: (profile) => set({ profile }),
  setExperiences: (experiences) => set({ experiences }),
  setEducation: (education) => set({ education }),
  setProjects: (projects) => set({ projects }),

  addExperience: (experience) => set((state) => ({
    experiences: [...state.experiences, experience],
  })),

  updateExperience: (id, updatedExperience) => set((state) => ({
    experiences: state.experiences.map(exp => 
      exp.id === id ? { ...exp, ...updatedExperience } : exp
    ),
  })),

  removeExperience: (id) => set((state) => ({
    experiences: state.experiences.filter(exp => exp.id !== id),
  })),

  addEducation: (education) => set((state) => ({
    education: [...state.education, education],
  })),

  updateEducation: (id, updatedEducation) => set((state) => ({
    education: state.education.map(edu => 
      edu.id === id ? { ...edu, ...updatedEducation } : edu
    ),
  })),

  removeEducation: (id) => set((state) => ({
    education: state.education.filter(edu => edu.id !== id),
  })),

  addProject: (project) => set((state) => ({
    projects: [...state.projects, project],
  })),

  updateProject: (id, updatedProject) => set((state) => ({
    projects: state.projects.map(proj => 
      proj.id === id ? { ...proj, ...updatedProject } : proj
    ),
  })),

  removeProject: (id) => set((state) => ({
    projects: state.projects.filter(proj => proj.id !== id),
  })),

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clearProfile: () => set({
    profile: null,
    experiences: [],
    education: [],
    projects: [],
    error: null,
  }),
}))
