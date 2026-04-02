'use client'

import { useState } from 'react'
import { 
  Typography, 
  Input, 
  Button, 
  Space, 
  List, 
  Tooltip,
  Badge
} from 'antd'
import { 
  DeleteOutlined, 
  DragOutlined, 
  CheckCircleOutlined,
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  PlusOutlined
} from '@ant-design/icons'

const { Text } = Typography
const { TextArea } = Input

export interface Achievement {
  text: string
  isMaster?: boolean
  versions?: string[]
}

interface AchievementListProps {
  achievements: string[] | Achievement[]
  onUpdate: (achievements: Achievement[]) => void
}

export function AchievementList({ achievements, onUpdate }: AchievementListProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  // Normalizar os achievements para o formato rico
  const normalizedItems: Achievement[] = (achievements || []).map(item => 
    typeof item === 'string' ? { text: item, isMaster: true } : item
  )

  const handleRemove = (index: number) => {
    const newItems = [...normalizedItems]
    newItems.splice(index, 1)
    onUpdate(newItems)
  }

  const handleStartEdit = (index: number) => {
    setEditingIdx(index)
    setEditValue(normalizedItems[index].text)
  }

  const handleSaveEdit = () => {
    if (editingIdx === null) return
    const newItems = [...normalizedItems]
    newItems[editingIdx].text = editValue
    onUpdate(newItems)
    setEditingIdx(null)
  }

  const handleAdd = () => {
    const newItems = [...normalizedItems, { text: 'New achievement...', isMaster: true }]
    onUpdate(newItems)
    setEditingIdx(newItems.length - 1)
    setEditValue('New achievement...')
  }

  return (
    <div className="achievement-list">
      <List
        size="small"
        dataSource={normalizedItems}
        renderItem={(item, index) => (
          <List.Item
            className="group hover:bg-slate-50 transition-colors p-3 rounded-xl border-transparent border hover:border-slate-200 mb-2"
            actions={[
              editingIdx === index ? (
                <Space key="edit-actions">
                  <Button 
                    type="text" 
                    icon={<SaveOutlined className="text-green-500" />} 
                    onClick={handleSaveEdit}
                  />
                  <Button 
                    type="text" 
                    icon={<CloseOutlined />} 
                    onClick={() => setEditingIdx(null)}
                  />
                </Space>
              ) : (
                <Space key="view-actions" className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Tooltip title="Edit Achievement">
                    <Button 
                      type="text" 
                      icon={<EditOutlined />} 
                      onClick={() => handleStartEdit(index)}
                    />
                  </Tooltip>
                  <Tooltip title="Delete">
                    <Button 
                      type="text" 
                      danger 
                      icon={<DeleteOutlined />} 
                      onClick={() => handleRemove(index)}
                    />
                  </Tooltip>
                </Space>
              )
            ]}
          >
            <div className="flex gap-3 items-start w-full">
              <div className="mt-1 flex-shrink-0">
                <CheckCircleOutlined className="text-blue-400" />
              </div>
              
              {editingIdx === index ? (
                <TextArea 
                  value={editValue} 
                  onChange={(e) => setEditValue(e.target.value)}
                  autoSize={{ minRows: 2, maxRows: 6 }}
                  className="w-full"
                />
              ) : (
                <div className="flex-grow">
                  <Text className="text-slate-700 leading-relaxed block">{item.text}</Text>
                </div>
              )}
            </div>
          </List.Item>
        )}
      />
      <Button 
        type="dashed" 
        block 
        icon={<PlusOutlined />} 
        onClick={handleAdd}
        className="mt-2 rounded-xl h-10 border-slate-200"
      >
        Add Achievement
      </Button>
    </div>
  )
}
