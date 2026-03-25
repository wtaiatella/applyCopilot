'use client'

import { useAuth } from '@/contexts/auth.context'
import { Card, Typography, Alert, Space, Button } from 'antd'
import { CVUpload } from '@/components/cv-upload'
import { useRouter } from 'next/navigation'

const { Title, Text } = Typography

export default function CVPage() {
  const { isAuthenticated, user } = useAuth()
  const router = useRouter()

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <Space direction="vertical" className="w-full">
            <Title level={4}>Acesso Restrito</Title>
            <Text>Você precisa estar logado para acessar esta página.</Text>
            <Button type="primary" onClick={() => router.push('/login')}>
              Fazer Login
            </Button>
          </Space>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Title level={2}>Currículo</Title>
        <Text type="secondary">
          Faça o upload do seu currículo para extração automática de dados
        </Text>
      </div>

      <CVUpload />
    </div>
  )
}
