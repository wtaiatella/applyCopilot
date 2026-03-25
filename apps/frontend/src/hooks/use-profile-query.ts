import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { profileService } from '@/lib/services'
import { Profile, Education, Experience, Project } from '@/types'

export function useProfile(include?: string) {
  return useQuery({
    queryKey: ['profile', include],
    queryFn: () => profileService.getProfile(include),
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (profileData: Partial<Profile>) =>
      profileService.updateProfile(profileData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (preferences: {
      contract_types?: string[]
      work_modality?: string[]
      salary_range?: { min: number; max: number }
      locations_of_interest?: string[]
      technologies_of_interest?: string[]
    }) => profileService.updatePreferences(preferences),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

// Education hooks
export function useEducation() {
  return useQuery({
    queryKey: ['education'],
    queryFn: () => profileService.getEducation(),
  })
}

export function useAddEducation() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (educationData: Omit<Education, 'id' | 'created_at' | 'updated_at'>) =>
      profileService.addEducation(educationData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['education'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useUpdateEducation() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Education> }) =>
      profileService.updateEducation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['education'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useDeleteEducation() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: number) => profileService.deleteEducation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['education'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

// Experience hooks
export function useExperiences() {
  return useQuery({
    queryKey: ['experiences'],
    queryFn: () => profileService.getExperiences(),
  })
}

export function useAddExperience() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (experienceData: Omit<Experience, 'id' | 'created_at' | 'updated_at'>) =>
      profileService.addExperience(experienceData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiences'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useUpdateExperience() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Experience> }) =>
      profileService.updateExperience(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiences'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useDeleteExperience() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: number) => profileService.deleteExperience(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiences'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

// Project hooks
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => profileService.getProjects(),
  })
}

export function useAddProject() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (projectData: Omit<Project, 'id' | 'created_at' | 'updated_at'>) =>
      profileService.addProject(projectData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useUpdateProject() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Project> }) =>
      profileService.updateProject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: number) => profileService.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}
