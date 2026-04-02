import { apiClient } from '@/lib/api'
import { ApiResponse, Profile, Education, Experience, Project } from '@/types'

export class ProfileService {
  async getProfile(include?: string): Promise<ApiResponse<Profile>> {
    try {
      const params = include ? { include } : undefined
      const response = await apiClient.get<ApiResponse<Profile>>('/api/profile/me', params)
      return response.data
    } catch (error) {
      throw error
    }
  }

  async updateProfile(profileData: Partial<Profile>): Promise<ApiResponse<Profile>> {
    try {
      const response = await apiClient.patch<ApiResponse<Profile>>('/api/profile/update', profileData)
      return response.data
    } catch (error) {
      throw error
    }
  }

  async updatePreferences(preferences: {
    contract_types?: string[]
    work_modality?: string[]
    salary_range?: { min: number; max: number }
    locations_of_interest?: string[]
    technologies_of_interest?: string[]
  }): Promise<ApiResponse<Profile>> {
    try {
      const response = await apiClient.put<ApiResponse<Profile>>('/api/profile/preferences', preferences)
      return response.data
    } catch (error) {
      throw error
    }
  }

  // Education CRUD
  async getEducation(): Promise<ApiResponse<Education[]>> {
    try {
      const response = await apiClient.get<ApiResponse<Education[]>>('/api/profile/education')
      return response.data
    } catch (error) {
      throw error
    }
  }

  async addEducation(educationData: Omit<Education, 'id' | 'created_at' | 'updated_at'>): Promise<ApiResponse<Education>> {
    try {
      const response = await apiClient.post<ApiResponse<Education>>('/api/profile/education', educationData)
      return response.data
    } catch (error) {
      throw error
    }
  }

  async updateEducation(id: number, educationData: Partial<Education>): Promise<ApiResponse<Education>> {
    try {
      const response = await apiClient.put<ApiResponse<Education>>(`/api/profile/education/${id}`, educationData)
      return response.data
    } catch (error) {
      throw error
    }
  }

  async deleteEducation(id: number): Promise<ApiResponse<null>> {
    try {
      const response = await apiClient.delete<ApiResponse<null>>(`/api/profile/education/${id}`)
      return response.data
    } catch (error) {
      throw error
    }
  }

  // Experience CRUD
  async getExperiences(): Promise<ApiResponse<Experience[]>> {
    try {
      const response = await apiClient.get<ApiResponse<Experience[]>>('/api/profile/experience')
      return response.data
    } catch (error) {
      throw error
    }
  }

  async addExperience(experienceData: Omit<Experience, 'id' | 'created_at' | 'updated_at'>): Promise<ApiResponse<Experience>> {
    try {
      const response = await apiClient.post<ApiResponse<Experience>>('/api/profile/experience', experienceData)
      return response.data
    } catch (error) {
      throw error
    }
  }

  async updateExperience(id: number, experienceData: Partial<Experience>): Promise<ApiResponse<Experience>> {
    try {
      const response = await apiClient.put<ApiResponse<Experience>>(`/api/profile/experience/${id}`, experienceData)
      return response.data
    } catch (error) {
      throw error
    }
  }

  async deleteExperience(id: number): Promise<ApiResponse<null>> {
    try {
      const response = await apiClient.delete<ApiResponse<null>>(`/api/profile/experience/${id}`)
      return response.data
    } catch (error) {
      throw error
    }
  }

  // Project CRUD
  async getProjects(): Promise<ApiResponse<Project[]>> {
    try {
      const response = await apiClient.get<ApiResponse<Project[]>>('/api/profile/project')
      return response.data
    } catch (error) {
      throw error
    }
  }

  async addProject(projectData: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<ApiResponse<Project>> {
    try {
      const response = await apiClient.post<ApiResponse<Project>>('/api/profile/project', projectData)
      return response.data
    } catch (error) {
      throw error
    }
  }

  async updateProject(id: number, projectData: Partial<Project>): Promise<ApiResponse<Project>> {
    try {
      const response = await apiClient.put<ApiResponse<Project>>(`/api/profile/project/${id}`, projectData)
      return response.data
    } catch (error) {
      throw error
    }
  }

  async deleteProject(id: number): Promise<ApiResponse<null>> {
    try {
      const response = await apiClient.delete<ApiResponse<null>>(`/api/profile/project/${id}`)
      return response.data
    } catch (error) {
      throw error
    }
  }
}

export const profileService = new ProfileService()
