'use client'

import { useState } from 'react'
import { Card, Typography, Input, Button, Space } from 'antd'
import { EditOutlined, SaveOutlined, CloseOutlined, InfoCircleOutlined } from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

interface ProfileSummaryProps {
  summary: string
  onSave: (newSummary: string) => void
}

export function ProfileSummary({ summary, onSave }: ProfileSummaryProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(summary || '')

  const handleSave = () => {
    onSave(value)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setValue(summary)
    setIsEditing(false)
  }

  return (
    <Card className="shadow-sm border-slate-200 rounded-2xl mb-8">
      <div className="flex justify-between items-start mb-4">
        <Title level={4} className="m-0 flex items-center gap-2">
          <InfoCircleOutlined className="text-blue-500" />
          Professional Summary
        </Title>
        {!isEditing ? (
          <Button 
            type="text" 
            icon={<EditOutlined />} 
            onClick={() => setIsEditing(true)}
            className="text-slate-400 hover:text-blue-500 hover:bg-blue-50"
          >
            Edit
          </Button>
        ) : (
          <Space>
            <Button 
              type="primary" 
              icon={<SaveOutlined />} 
              onClick={handleSave}
              className="rounded-lg shadow-sm"
            >
              Save
            </Button>
            <Button 
              icon={<CloseOutlined />} 
              onClick={handleCancel}
              className="rounded-lg"
            >
              Cancel
            </Button>
          </Space>
        )}
      </div>

      {isEditing ? (
        <TextArea 
          value={value} 
          onChange={(e) => setValue(e.target.value)}
          autoSize={{ minRows: 4, maxRows: 12 }}
          className="rounded-xl border-slate-200 focus:border-blue-400"
          placeholder="Write a compelling summary of your professional journey..."
        />
      ) : (
        <Paragraph className="text-slate-600 text-lg leading-relaxed mb-0 italic">
          {summary || "Add a professional summary to describe your career and main goals."}
        </Paragraph>
      )}
    </Card>
  )
}
