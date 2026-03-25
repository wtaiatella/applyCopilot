import { apiClient } from '@/lib/api'
import { ApiResponse, AuthUser, UserRegister, UserLogin } from '@/types'

export class AuthService {
  async register(userData: UserRegister): Promise<ApiResponse<AuthUser>> {
    try {
      const response = await apiClient.post<ApiResponse<AuthUser>>('/api/auth/register', userData)
      return response.data
    } catch (error) {
      throw error
    }
  }

  async login(credentials: UserLogin): Promise<ApiResponse<{ user: AuthUser; token: string }>> {
    try {
      const response = await apiClient.post<ApiResponse<{ user: AuthUser; token: string }>>('/api/auth/login', credentials)
      
      if (response.data.success && response.data.data?.token) {
        apiClient.setToken(response.data.data.token)
      }
      
      return response.data
    } catch (error) {
      throw error
    }
  }

  async logout(): Promise<ApiResponse<null>> {
    try {
      const response = await apiClient.post<ApiResponse<null>>('/api/auth/logout')
      apiClient.clearToken()
      return response.data
    } catch (error) {
      apiClient.clearToken()
      throw error
    }
  }

  async getCurrentUser(): Promise<ApiResponse<AuthUser>> {
    try {
      const response = await apiClient.get<ApiResponse<AuthUser>>('/api/auth/me')
      return response.data
    } catch (error) {
      throw error
    }
  }

  async refreshToken(): Promise<ApiResponse<{ token: string }>> {
    try {
      const response = await apiClient.post<ApiResponse<{ token: string }>>('/api/auth/refresh')
      
      if (response.data.success && response.data.data?.token) {
        apiClient.setToken(response.data.data.token)
      }
      
      return response.data
    } catch (error) {
      apiClient.clearToken()
      throw error
    }
  }
}

export const authService = new AuthService()
