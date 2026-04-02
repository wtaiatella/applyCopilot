import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios'
import { antdStatic } from './antd-static'

export interface ApiError {
  message: string
  status?: number
  code?: string
}

class ApiClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL || '',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    this.setupInterceptors()
  }

  private setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        const token = this.getAuthToken()
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (error) => {
        return Promise.reject(error)
      }
    )

    // Response interceptor
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        return response
      },
      (error: AxiosError) => {
        this.handleError(error)
        return Promise.reject(error)
      }
    )
  }

  private getAuthToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('auth_token')
    }
    return null
  }

  private setAuthToken(token: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token)
    }
  }

  private removeAuthToken() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token')
    }
  }

  private handleError(error: AxiosError) {
    const apiError: ApiError = {
      message: 'Unknown error',
    }

    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response
      apiError.status = status
      apiError.message = (data as any)?.message || `Error ${status}`
      
      // Handle specific error codes
      switch (status) {
        case 401:
          apiError.message = 'Unauthorized. Please login again.'
          this.removeAuthToken()
          // Redirect to login page
          if (typeof window !== 'undefined') {
            window.location.href = '/login'
          }
          break
        case 403:
          apiError.message = 'Access denied.'
          break
        case 404:
          apiError.message = 'Resource not found.'
          break
        case 422:
          apiError.message = 'Invalid data.'
          break
        case 500:
          apiError.message = 'Internal server error.'
          break
      }
    } else if (error.request) {
      // Network error
      apiError.message = 'Connection error. Please check your internet.'
    } else {
      // Other error
      apiError.message = error.message || 'Unknown error'
    }

    // Show error message to user
    if (antdStatic.msg) {
      antdStatic.msg.error(apiError.message)
    } else {
      console.error('API Error:', apiError.message)
    }
  }

  // Auth methods
  setToken(token: string) {
    this.setAuthToken(token)
  }

  clearToken() {
    this.removeAuthToken()
  }

  // HTTP methods with retry logic
  async get<T>(url: string, params?: any, retries = 2): Promise<AxiosResponse<T>> {
    try {
      return await this.client.get(url, { params })
    } catch (error) {
      if (retries > 0 && this.shouldRetry(error)) {
        await this.delay(1000)
        return this.get(url, params, retries - 1)
      }
      throw error
    }
  }

  async post<T>(url: string, data?: any, config?: any, retries = 2): Promise<AxiosResponse<T>> {
    try {
      return await this.client.post(url, data, config)
    } catch (error) {
      if (retries > 0 && this.shouldRetry(error)) {
        await this.delay(1000)
        return this.post(url, data, config, retries - 1)
      }
      throw error
    }
  }

  async put<T>(url: string, data?: any, retries = 2): Promise<AxiosResponse<T>> {
    try {
      return await this.client.put(url, data)
    } catch (error) {
      if (retries > 0 && this.shouldRetry(error)) {
        await this.delay(1000)
        return this.put(url, data, retries - 1)
      }
      throw error
    }
  }

  async patch<T>(url: string, data?: any, retries = 2): Promise<AxiosResponse<T>> {
    try {
      return await this.client.patch(url, data)
    } catch (error) {
      if (retries > 0 && this.shouldRetry(error)) {
        await this.delay(1000)
        return this.patch(url, data, retries - 1)
      }
      throw error
    }
  }

  async delete<T>(url: string, retries = 2): Promise<AxiosResponse<T>> {
    try {
      return await this.client.delete(url)
    } catch (error) {
      if (retries > 0 && this.shouldRetry(error)) {
        await this.delay(1000)
        return this.delete(url, retries - 1)
      }
      throw error
    }
  }

  private shouldRetry(error: any): boolean {
    if (!error.response) return true // Network errors
    const status = error.response.status
    return status >= 500 || status === 429 // Server errors or rate limit
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export const apiClient = new ApiClient()
