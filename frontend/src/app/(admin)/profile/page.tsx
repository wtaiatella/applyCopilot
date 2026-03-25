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
        <Breadcrumb.Item>Profile</Breadcrumb.Item>
      </Breadcrumb>

      <Title level={2}>My Profile</Title>
      
      <Card>
        <div className="text-center py-8">
          <Title level={4}>Profile Page</Title>
          <p>Profile content under development...</p>
        </div>
      </Card>
    </div>
  )
}
