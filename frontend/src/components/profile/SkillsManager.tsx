'use client'

import { useState } from 'react'
import { Card, Typography, Tag, Input, Space, Button, ThemeConfig } from 'antd'
import { PlusOutlined, ThunderboltOutlined, CloseCircleOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

interface SkillsManagerProps {
  skills: string[]
  onUpdate: (skills: string[]) => void
}

export function SkillsManager({ skills, onUpdate }: SkillsManagerProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [inputValue, setInputValue] = useState('')

  const handleRemove = (skillToRemove: string) => {
    onUpdate(skills.filter(skill => skill !== skillToRemove))
  }

  const handleAdd = () => {
    if (inputValue && !skills.includes(inputValue)) {
      onUpdate([...skills, inputValue])
    }
    setInputValue('')
    setIsAdding(false)
  }

  return (
    <Card className="shadow-sm border-slate-200 rounded-2xl mb-8">
      <div className="flex justify-between items-center mb-6">
        <Title level={4} className="m-0 flex items-center gap-2">
          <ThunderboltOutlined className="text-amber-500" />
          Technical Skills
        </Title>
        {!isAdding && (
          <Button 
            type="dashed" 
            icon={<PlusOutlined />} 
            onClick={() => setIsAdding(true)}
            className="rounded-lg border-slate-200"
          >
            Add Skill
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 min-h-12 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
        {(skills || []).length === 0 && !isAdding && (
          <Text type="secondary" className="italic">No skills added yet.</Text>
        )}
        
        {(skills || []).map(skill => (
          <Tag 
            key={skill} 
            closable 
            onClose={() => handleRemove(skill)}
            closeIcon={<CloseCircleOutlined className="text-white/70 hover:text-white" />}
            className="bg-slate-800 text-white border-0 rounded-full px-4 py-1 flex items-center gap-1 text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            {skill}
          </Tag>
        ))}

        {isAdding && (
          <Input
            autoFocus
            type="text"
            size="small"
            className="w-32 rounded-full px-4 border-blue-400"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleAdd}
            onPressEnter={handleAdd}
          />
        )}
      </div>
    </Card>
  )
}
