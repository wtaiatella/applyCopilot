'use client'

import { Card, Typography, Breadcrumb } from 'antd'
import Link from 'next/link'

const { Title } = Typography

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <Breadcrumb>
        <Breadcrumb.Item>
          <Link href="/dashboard">Dashboard</Link>
        </Breadcrumb.Item>
        <Breadcrumb.Item>Perfil</Breadcrumb.Item>
      </Breadcrumb>

      <Title level={2}>Meu Perfil</Title>
      
      <Card>
        <div className="text-center py-8">
          <Title level={4}>Página de Perfil</Title>
          <p>Conteúdo do perfil em desenvolvimento...</p>
        </div>
      </Card>
    </div>
  )
}
