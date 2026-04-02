'use client'

import { useState } from 'react'
import { 
  Upload, 
  Card, 
  Typography, 
  Progress, 
  Button, 
  Space, 
  Alert,
  Tag
} from 'antd'
import { 
  InboxOutlined, 
  FileTextOutlined, 
  DeleteOutlined,
  EyeOutlined,
  LoadingOutlined
} from '@ant-design/icons'
import type { UploadProps, UploadFile } from 'antd'
import { cvService } from '@/lib/services'

const { Dragger } = Upload
const { Title, Text } = Typography

interface CVUploadProps {
  onUploadSuccess?: (fileId: string) => void
  onProcessingComplete?: (extractedData: any) => void
}

export function CVUpload({ onUploadSuccess, onProcessingComplete }: CVUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadedFile, setUploadedFile] = useState<UploadFile | null>(null)
  const [processingStatus, setProcessingStatus] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const validateFile = (file: File) => {
    const isPDF = file.type === 'application/pdf'
    const isDOC = file.type === 'application/msword'
    const isDOCX = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    
    if (!isPDF && !isDOC && !isDOCX) {
      setError('Only PDF, DOC, or DOCX files are allowed')
      return false
    }
    
    const isLt10M = file.size / 1024 / 1024 < 10
    if (!isLt10M) {
      setError('File must be smaller than 10MB')
      return false
    }
    
    setError(null)
    return true
  }

  const handleUpload = async (file: File) => {
    if (!validateFile(file)) {
      return false
    }

    setUploading(true)
    setUploadProgress(0)
    setError(null)

    try {
      // Simulate initial upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return prev + 10
        })
      }, 100)

      const response = await cvService.uploadCV(file)
      
      clearInterval(progressInterval)
      setUploadProgress(100)
      
      if (response.success && response.data) {
        setUploadedFile({
          uid: Date.now().toString(),
          name: file.name,
          status: 'done',
          size: file.size,
          type: file.type,
        } as UploadFile)
        
        // Start polling for processing status
        pollProcessingStatus(response.data.file_path)
        onUploadSuccess?.(response.data.file_path)
      } else {
        throw new Error(response.message || 'Upload failed')
      }
    } catch (err: any) {
      setError(err.message || 'Error uploading file')
      setUploading(false)
      setUploadProgress(0)
    }
    
    return false // Prevent default behavior
  }

  const pollProcessingStatus = async (fileId: string) => {
    try {
      const response = await cvService.getProcessingStatus(fileId)
      
      if (response.success && response.data) {
        setProcessingStatus(response.data)
        
        if (response.data.status === 'completed') {
          setUploading(false)
          onProcessingComplete?.(response.data.extracted_data)
        } else if (response.data.status === 'failed') {
          setError(response.data.error || 'Failed to process file')
          setUploading(false)
        } else {
          // Continue polling
          setTimeout(() => pollProcessingStatus(fileId), 1500)
        }
      }
    } catch (err) {
      setError('Error checking processing status')
      setUploading(false)
    }
  }

  const removeFile = () => {
    setUploadedFile(null)
    setProcessingStatus(null)
    setError(null)
    setUploadProgress(0)
    setUploading(false)
  }

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    accept: '.pdf,.doc,.docx',
    beforeUpload: handleUpload,
    showUploadList: false,
  }

  return (
    <div className="w-full">
      {error && (
        <Alert
          message="Upload Error"
          description={error}
          type="error"
          showIcon
          closable
          className="mb-4"
          onClose={() => setError(null)}
        />
      )}

      {!uploadedFile ? (
        <Dragger 
          {...uploadProps} 
          className="bg-slate-50 border-2 border-dashed border-slate-200 hover:border-blue-400 transition-colors p-8 rounded-2xl"
        >
          <p className="text-4xl text-blue-500 mb-4 text-center">
            <InboxOutlined />
          </p>
          <p className="text-lg font-medium text-slate-700 text-center">
            Click or drag file to this area to upload
          </p>
          <p className="text-slate-500 text-center mt-2">
            Support for PDF, DOC, DOCX. Max size: 10MB
          </p>
        </Dragger>
      ) : (
        <Card className="border-slate-200 shadow-sm rounded-xl overflow-hidden">
          <Space direction="vertical" className="w-full" size="middle">
            <div className="flex items-center justify-between">
              <Space size="middle">
                <div className="w-10 h-10 bg-blue-50 text-blue-500 rounded-lg flex items-center justify-center text-xl">
                  <FileTextOutlined />
                </div>
                <div>
                  <Text strong className="block">{uploadedFile.name}</Text>
                  <Text type="secondary" className="text-xs">
                    {(uploadedFile.size! / 1024 / 1024).toFixed(2)} MB • {uploadedFile.type?.split('/')[1].toUpperCase()}
                  </Text>
                </div>
              </Space>
              
              {!uploading && processingStatus?.status === 'completed' && (
                <Tag color="success" className="m-0 rounded-full px-3">Completed</Tag>
              )}
            </div>
            
            {(uploading || processingStatus?.status === 'processing') && (
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="flex justify-between mb-2">
                  <Text type="secondary" className="text-sm">
                    {processingStatus?.status === 'processing' 
                      ? 'AI Classification in progress...' 
                      : 'Uploading file...'}
                  </Text>
                  <Text className="text-sm font-medium">{uploadProgress}%</Text>
                </div>
                <Progress 
                  percent={processingStatus?.progress || uploadProgress} 
                  showInfo={false}
                  status={processingStatus?.status === 'failed' ? 'exception' : 'active'}
                  strokeColor="#3b82f6"
                  className="mb-0"
                />
              </div>
            )}

            {processingStatus?.status === 'completed' && (
              <Alert
                message="Processing Finished"
                description="Your resume data was successfully extracted and classified."
                type="success"
                showIcon
                className="rounded-lg"
              />
            )}

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button 
                icon={<EyeOutlined />} 
                disabled={processingStatus?.status !== 'completed'}
                className="rounded-lg"
              >
                Review Data
              </Button>
              <Button 
                icon={<DeleteOutlined />} 
                danger
                onClick={removeFile}
                className="rounded-lg"
              >
                Remove
              </Button>
            </div>
          </Space>
        </Card>
      )}
    </div>
  )
}
