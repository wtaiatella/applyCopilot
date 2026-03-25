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
}

export const cvService = new CVService()
