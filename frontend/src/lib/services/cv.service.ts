import { apiClient } from '@/lib/api'
import { ApiResponse } from '@/types'

export interface CVUploadResponse {
  file_path: string
  extracted_data: any
  processing_status: 'pending' | 'processing' | 'completed' | 'failed'
}

export interface CVProcessingStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  extracted_data?: any
  error?: string
}

export class CVService {
  async uploadCV(file: File): Promise<ApiResponse<CVUploadResponse>> {
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await apiClient.post<ApiResponse<CVUploadResponse>>('/api/profile/upload-cv', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return response.data
    } catch (error) {
      throw error
    }
  }

  async getProcessingStatus(fileId: string): Promise<ApiResponse<CVProcessingStatus>> {
    try {
      const response = await apiClient.get<ApiResponse<CVProcessingStatus>>(`/api/profile/cv-status/${fileId}`)
      return response.data
    } catch (error) {
      throw error
    }
  }

  async confirmExtractedData(extractedData: any): Promise<ApiResponse<null>> {
    try {
      const response = await apiClient.post<ApiResponse<null>>('/api/profile/confirm-cv-data', extractedData)
      return response.data
    } catch (error) {
      throw error
    }
  }

  async updateExtractedData(extractedData: any): Promise<ApiResponse<null>> {
    try {
      const response = await apiClient.put<ApiResponse<null>>('/api/profile/update-cv-data', extractedData)
      return response.data
    } catch (error) {
      throw error
    }
  }
  async listManagedCVs(): Promise<ApiResponse<any[]>> {
    try {
      const response = await apiClient.get<ApiResponse<any[]>>('/api/cv-manager')
      return response.data
    } catch (error) {
      throw error
    }
  }

  async createManagedCV(name: string): Promise<ApiResponse<any>> {
    try {
      const response = await apiClient.post<ApiResponse<any>>('/api/cv-manager', { name })
      return response.data
    } catch (error) {
      throw error
    }
  }

  async updateManagedCV(id: string, data: { name?: string, isDefault?: boolean }): Promise<ApiResponse<any>> {
    try {
      const response = await apiClient.patch<ApiResponse<any>>(`/api/cv-manager/${id}`, data)
      return response.data
    } catch (error) {
      throw error
    }
  }

  async deleteManagedCV(id: string): Promise<ApiResponse<null>> {
    try {
      const response = await apiClient.delete<ApiResponse<null>>(`/api/cv-manager/${id}`)
      return response.data
    } catch (error) {
      throw error
    }
  }

  async duplicateManagedCV(id: string): Promise<ApiResponse<any>> {
    try {
      const response = await apiClient.post<ApiResponse<any>>(`/api/cv-manager/${id}/duplicate`)
      return response.data
    } catch (error) {
      throw error
    }
  }
}

export const cvService = new CVService()
