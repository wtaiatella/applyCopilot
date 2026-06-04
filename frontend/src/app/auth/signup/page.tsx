'use client'

import { useState } from 'react'
import { Button, Form, Input, Card, Typography, Space } from 'antd'
import { useRouter } from 'next/navigation'

const { Title } = Typography

export default function SignUp() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (values: { name: string; email: string; password: string }) => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      })

      const data = await response.json()

      if (response.ok) {
        router.push('/auth/signin')
      } else {
        setError(data.error || 'Erro ao criar conta')
      }
    } catch {
      setError('Erro ao criar conta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <div className="p-8">
          <Title level={2} className="text-center mb-8">
            Criar Conta - ApplyCopilot
          </Title>
          
          <Form
            name="signup"
            onFinish={handleSubmit}
            layout="vertical"
            size="large"
          >
            <Form.Item
              name="name"
              label="Nome"
              rules={[{ required: true, message: 'Por favor, insira seu nome!' }]}
            >
              <Input placeholder="Seu nome" />
            </Form.Item>

            <Form.Item
              name="email"
              label="Email"
              rules={[{ required: true, message: 'Por favor, insira seu email!' }]}
            >
              <Input type="email" placeholder="seu@email.com" />
            </Form.Item>

            <Form.Item
              name="password"
              label="Senha"
              rules={[{ required: true, message: 'Por favor, insira sua senha!' }]}
            >
              <Input.Password placeholder="Crie uma senha forte" />
            </Form.Item>

            {error && (
              <div className="text-red-500 text-sm mb-4">{error}</div>
            )}

            <Form.Item>
              <Space>
                <Button
                  type="default"
                  onClick={() => router.push('/auth/signin')}
                >
                  Já tem conta? Entrar
                </Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  className="w-full"
                >
                  Criar Conta
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </div>
      </Card>
    </div>
  )
}
