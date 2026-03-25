// API Response types
export interface ApiResponse<T = any> {
  data?: T
  message?: string
  error?: string
  success: boolean
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Auth types
export interface AuthUser {
  id: string
  email: string
  full_name: string
  created_at: string
  updated_at: string
}

export interface AuthState {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
}

// UI State types
export interface LoadingState {
  [key: string]: boolean
}

export interface ErrorState {
  [key: string]: string | null
}

// Form types
export interface FormState {
  isSubmitting: boolean
  errors: Record<string, string>
  touched: Record<string, boolean>
}

// Dashboard types
export interface DashboardStats {
  profileCompletion: number
  totalExperiences: number
  totalProjects: number
  totalEducation: number
  recentUploads: number
}

// CV Processing types
export interface CVUploadState {
  file: File | null
  uploading: boolean
  processing: boolean
  extractedData: any
  error: string | null
}

// Search Preferences types
export interface SearchPreferences {
  contract_types: string[]
  work_modality: string[]
  salary_range: {
    min: number
    max: number
  }
  locations_of_interest: string[]
  technologies_of_interest: string[]
}

// Re-export schema types
export type { User, UserRegister, UserLogin, Profile, Education, Experience, Project, Job } from './schemas'
