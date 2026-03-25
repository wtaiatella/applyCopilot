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
  List,
  Tag
} from 'antd'
import { 
  InboxOutlined, 
  FileTextOutlined, 
  DeleteOutlined,
  EyeOutlined,
  UploadOutlined
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
      setError('Apenas arquivos PDF, DOC ou DOCX são permitidos')
      return false
    }
    
    const isLt10M = file.size / 1024 / 1024 < 10
    if (!isLt10M) {
      setError('O arquivo deve ser menor que 10MB')
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
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return prev + 10
        })
      }, 200)

      const response = await cvService.uploadCV(file)
      
      clearInterval(progressInterval)
      setUploadProgress(100)
      
      if (response.success && response.data) {
        setUploadedFile({
          uid: Date.now().toString(), // Generate unique ID
          name: file.name,
          status: 'done',
          size: file.size,
          type: file.type,
        } as UploadFile)
        
        // Start polling for processing status
        pollProcessingStatus(response.data.file_path)
        
        onUploadSuccess?.(response.data.file_path)
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer upload do arquivo')
      setUploading(false)
      setUploadProgress(0)
    }
    
    return false // Prevent default upload behavior
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
          setError(response.data.error || 'Falha no processamento do arquivo')
          setUploading(false)
        } else {
          // Continue polling
          setTimeout(() => pollProcessingStatus(fileId), 2000)
        }
      }
    } catch (err) {
      setError('Erro ao verificar status do processamento')
      setUploading(false)
    }
  }

  const removeFile = () => {
    setUploadedFile(null)
    setProcessingStatus(null)
    setError(null)
    setUploadProgress(0)
  }

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    accept: '.pdf,.doc,.docx',
    beforeUpload: handleUpload,
    showUploadList: false,
  }

  return (
    <Card className="w-full">
      <Title level={4}>Upload de Currículo</Title>
      <Text type="secondary">
        Envie seu currículo em formato PDF, DOC ou DOCX (máximo 10MB)
      </Text>

      {error && (
        <Alert
          message="Erro no Upload"
          description={error}
          type="error"
          showIcon
          closable
          className="mt-4"
          onClose={() => setError(null)}
        />
      )}

      {!uploadedFile ? (
        <Dragger {...uploadProps} className="mt-4">
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            Clique ou arraste o arquivo para esta área
          </p>
          <p className="ant-upload-hint">
            Suporte para PDF, DOC, DOCX. Tamanho máximo: 10MB
          </p>
        </Dragger>
      ) : (
        <div className="mt-4">
          <Card size="small">
            <Space direction="vertical" className="w-full">
              <Space>
                <FileTextOutlined />
                <Text strong>{uploadedFile.name}</Text>
                <Tag color="blue">
                  {(uploadedFile.size! / 1024 / 1024).toFixed(2)} MB
                </Tag>
              </Space>
              
              {uploading && (
                <div>
                  <Text type="secondary">
                    {processingStatus?.status === 'processing' 
                      ? 'Processando arquivo...' 
                      : 'Fazendo upload...'}
                  </Text>
                  <Progress 
                    percent={processingStatus?.progress || uploadProgress} 
                    status={processingStatus?.status === 'failed' ? 'exception' : 'active'}
                  />
                </div>
              )}

              {processingStatus?.status === 'completed' && (
                <Alert
                  message="Processamento Concluído"
                  description="Seu currículo foi processado com sucesso!"
                  type="success"
                  showIcon
                />
              )}

              <Space>
                <Button 
                  icon={<EyeOutlined />} 
                  size="small"
                  disabled={processingStatus?.status !== 'completed'}
                >
                  Visualizar Dados
                </Button>
                <Button 
                  icon={<DeleteOutlined />} 
                  size="small" 
                  danger
                  onClick={removeFile}
                >
                  Remover
                </Button>
              </Space>
            </Space>
          </Card>
        </div>
      )}
    </Card>
  )
}
