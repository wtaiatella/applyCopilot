import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cvService } from '@/lib/services/cv.service'
import { message } from 'antd'

export const useCVs = () => {
  return useQuery({
    queryKey: ['managed-cvs'],
    queryFn: async () => {
      const response = await cvService.listManagedCVs()
      return response.data || []
    }
  })
}

export const useCreateCV = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (name: string) => cvService.createManagedCV(name),
    onSuccess: () => {
      message.success('CV Template created successfully')
      queryClient.invalidateQueries({ queryKey: ['managed-cvs'] })
    },
    onError: (error: any) => {
      message.error(error.message || 'Failed to create CV Template')
    }
  })
}

export const useUpdateCV = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string, data: { name?: string, isDefault?: boolean } }) => 
      cvService.updateManagedCV(id, data),
    onSuccess: (response) => {
      if (response.success) {
        message.success(response.message || 'CV updated successfully')
        queryClient.invalidateQueries({ queryKey: ['managed-cvs'] })
      }
    },
    onError: (error: any) => {
      message.error(error.message || 'Failed to update CV')
    }
  })
}

export const useDeleteCV = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) => cvService.deleteManagedCV(id),
    onSuccess: () => {
      message.success('CV Template deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['managed-cvs'] })
    },
    onError: (error: any) => {
      message.error(error.message || 'Failed to delete CV Template')
    }
  })
}

export const useDuplicateCV = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) => cvService.duplicateManagedCV(id),
    onSuccess: () => {
      message.success('CV Template duplicated successfully')
      queryClient.invalidateQueries({ queryKey: ['managed-cvs'] })
    },
    onError: (error: any) => {
      message.error(error.message || 'Failed to duplicate CV Template')
    }
  })
}
