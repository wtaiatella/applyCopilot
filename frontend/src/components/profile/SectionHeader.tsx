'use client'

import { Space, Typography, Button } from 'antd'
import { PlusOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

interface SectionHeaderProps {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  onAdd?: () => void
  addText?: string
}

export function SectionHeader({ title, subtitle, icon, onAdd, addText }: SectionHeaderProps) {
  return (
    <div className="flex justify-between items-end mb-6">
      <div>
        <Title level={3} className="m-0 flex items-center gap-2">
          {icon && <span className="text-blue-500">{icon}</span>}
          {title}
        </Title>
        {subtitle && <Text type="secondary" className="text-sm">{subtitle}</Text>}
      </div>
      {onAdd && (
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={onAdd}
          className="rounded-lg shadow-sm"
        >
          {addText || 'Add'}
        </Button>
      )}
    </div>
  )
}
