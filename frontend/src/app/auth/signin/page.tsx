'use client'

import { useState } from 'react'
import { Button, Form, Input, Card, Typography } from 'antd'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const { Title } = Typography

export default function SignIn() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (values: { email: string; password: string }) => {
    setLoading(true)
    setError('')

    try {
      const result = await signIn('credentials', values)
      
      if (result?.error) {
        setError('Credenciais inválidas')
      } else {
        router.push('/dashboard')
      }
    } catch {
      setError('Erro ao fazer login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <div className="p-8">
          <Title level={2} className="text-center mb-8">
            Login - ApplyCopilot
          </Title>
          
          <Form
            name="signin"
            onFinish={handleSubmit}
            layout="vertical"
            size="large"
          >
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
              <Input.Password placeholder="Sua senha" />
            </Form.Item>

            {error && (
              <div className="text-red-500 text-sm mb-4">{error}</div>
            )}

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                className="w-full"
              >
                Entrar
              </Button>
            </Form.Item>
          </Form>
        </div>
      </Card>
    </div>
  )
}
