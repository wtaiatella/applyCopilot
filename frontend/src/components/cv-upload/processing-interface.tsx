'use client'

import { useState, useEffect } from 'react'
import { 
  Card, 
  Typography, 
  Progress, 
  Steps, 
  Alert,
  Space,
  Tag,
  Button
} from 'antd'
import { 
  FileTextOutlined, 
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  SyncOutlined
} from '@ant-design/icons'
import { cvService } from '@/lib/services'

const { Title, Text } = Typography

interface ProcessingInterfaceProps {
  fileId: string
  onComplete?: (data: any) => void
  onError?: (error: string) => void
}

export function ProcessingInterface({ fileId, onComplete, onError }: ProcessingInterfaceProps) {
  const [status, setStatus] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(true)

  useEffect(() => {
    if (!fileId) return

    const pollStatus = async () => {
      try {
        const response = await cvService.getProcessingStatus(fileId)
        
        if (response.success && response.data) {
          setStatus(response.data)
          setError(null)
          
          if (response.data.status === 'completed') {
            setIsPolling(false)
            onComplete?.(response.data.extracted_data)
          } else if (response.data.status === 'failed') {
            setIsPolling(false)
            const errorMsg = response.data.error || 'Falha no processamento'
            setError(errorMsg)
            onError?.(errorMsg)
          }
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao verificar status')
        setIsPolling(false)
        onError?.(err.message)
      }
    }

    // Initial poll
    pollStatus()

    // Set up polling interval
    const interval = setInterval(() => {
      if (isPolling) {
        pollStatus()
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [fileId, isPolling, onComplete, onError])

  const getStepStatus = (step: string) => {
    if (!status) return 'wait'
    
    switch (step) {
      case 'upload':
        return 'finish'
      case 'processing':
        return status.status === 'processing' ? 'process' : 
               status.status === 'completed' ? 'finish' : 
               status.status === 'failed' ? 'error' : 'wait'
      case 'completed':
        return status.status === 'completed' ? 'finish' : 
               status.status === 'failed' ? 'error' : 'wait'
      default:
        return 'wait'
    }
  }

  const getStatusIcon = () => {
    if (!status) return <LoadingOutlined />
    
    switch (status.status) {
      case 'pending':
        return <LoadingOutlined />
      case 'processing':
        return <LoadingOutlined spin />
      case 'completed':
        return <CheckCircleOutlined />
      case 'failed':
        return <ExclamationCircleOutlined />
      default:
        return <LoadingOutlined />
    }
  }

  const getStatusColor = () => {
    if (!status) return 'default'
    
    switch (status.status) {
      case 'pending':
        return 'default'
      case 'processing':
        return 'processing'
      case 'completed':
        return 'success'
      case 'failed':
        return 'error'
      default:
        return 'default'
    }
  }

  const retryProcessing = () => {
    setError(null)
    setIsPolling(true)
  }

  if (error) {
    return (
      <Card>
        <Space direction="vertical" className="w-full">
          <Space>
            <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
            <Title level={4} type="danger">Erro no Processamento</Title>
          </Space>
          
          <Alert
            message="Falha ao processar o currículo"
            description={error}
            type="error"
            showIcon
            action={
              <Button size="small" onClick={retryProcessing}>
                Tentar Novamente
              </Button>
            }
          />
        </Space>
      </Card>
    )
  }

  return (
    <Card>
      <Space direction="vertical" className="w-full">
        <Space>
          {getStatusIcon()}
          <Title level={4}>Processamento de Currículo</Title>
          <Tag color={getStatusColor()}>
            {status ? status.status.toUpperCase() : 'CARREGANDO...'}
          </Tag>
        </Space>

        <Steps 
          current={status?.status === 'processing' ? 1 : status?.status === 'completed' ? 2 : 0}
          items={[
            {
              title: 'Upload',
              description: 'Arquivo enviado com sucesso',
              status: 'finish',
              icon: <FileTextOutlined />
            },
            {
              title: 'Processamento',
              description: 'Analisando conteúdo do currículo',
              status: getStepStatus('processing'),
              icon: <LoadingOutlined />
            },
            {
              title: 'Concluído',
              description: 'Dados extraídos com sucesso',
              status: getStepStatus('completed'),
              icon: <CheckCircleOutlined />
            }
          ]}
        />

        {status?.status === 'processing' && (
          <div>
            <Text type="secondary">Progresso do processamento:</Text>
            <Progress 
              percent={status.progress || 0} 
              status="active"
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#87d068',
              }}
            />
            {status.progress && (
              <Text type="secondary" className="text-sm">
                {status.progress}% concluído
              </Text>
            )}
          </div>
        )}

        {status?.status === 'completed' && (
          <Alert
            message="Processamento Concluído!"
            description="Seu currículo foi processado e os dados foram extraídos com sucesso."
            type="success"
            showIcon
            action={
              <Button type="primary" size="small">
                Visualizar Dados Extraídos
              </Button>
            }
          />
        )}

        {status?.status === 'pending' && (
          <Alert
            message="Aguardando Processamento"
            description="Seu arquivo foi enviado e está na fila para processamento."
            type="info"
            showIcon
          />
        )}
      </Space>
    </Card>
  )
}
