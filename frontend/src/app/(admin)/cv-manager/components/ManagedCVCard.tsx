'use client'

import React from 'react'
import { Card, Button, Dropdown, Space, Badge, Tooltip, Typography, Tag } from 'antd'
import { 
  MoreOutlined, 
  EditOutlined, 
  DownloadOutlined, 
  CopyOutlined, 
  StarOutlined, 
  StarFilled,
  DeleteOutlined,
  EyeOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import type { MenuProps } from 'antd'

const { Text, Title } = Typography

export interface ManagedCV {
  id: string
  name: string
  isDefault: boolean
  applicationCount: number
  lastUsedAt?: string | Date
  createdAt: string | Date
  updatedAt: string | Date
}

interface ManagedCVCardProps {
  cv: ManagedCV
  onEdit: (id: string) => void
  onDownload: (id: string) => void
  onDuplicate: (id: string) => void
  onSetDefault: (id: string) => void
  onDelete: (id: string) => void
  onPreview: (id: string) => void
}

const ManagedCVCard: React.FC<ManagedCVCardProps> = ({ 
  cv, 
  onEdit, 
  onDownload, 
  onDuplicate, 
  onSetDefault, 
  onDelete,
  onPreview
}) => {
  const items: MenuProps['items'] = [
    {
      key: 'duplicate',
      label: 'Duplicate',
      icon: <CopyOutlined />,
      onClick: () => onDuplicate(cv.id)
    },
    {
      key: 'default',
      label: cv.isDefault ? 'Standard Version' : 'Set as Default',
      icon: cv.isDefault ? <StarFilled className="text-yellow-500" /> : <StarOutlined />,
      disabled: cv.isDefault,
      onClick: () => onSetDefault(cv.id)
    },
    {
      type: 'divider',
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => onDelete(cv.id)
    },
  ]

  return (
    <Card 
      hoverable
      className="group transition-all duration-300 border-gray-100 hover:shadow-lg dark:bg-gray-900 dark:border-gray-800"
      actions={[
        <Tooltip title="Edit Resume" key="edit">
          <Button 
            type="text" 
            icon={<EditOutlined />} 
            onClick={() => onEdit(cv.id)}
            className="w-full text-gray-500 hover:text-blue-600 dark:text-gray-400"
          >
            Edit
          </Button>
        </Tooltip>,
        <Tooltip title="Download PDF" key="download">
          <Button 
            type="text" 
            icon={<DownloadOutlined />} 
            onClick={() => onDownload(cv.id)}
            className="w-full text-gray-500 hover:text-green-600 dark:text-gray-400"
          >
            Download
          </Button>
        </Tooltip>
      ]}
      title={
        <div className="flex items-center gap-2 py-1">
          <FileTextOutlined className="text-blue-500" />
          <Title 
            level={5} 
            className="m-0 cursor-pointer hover:text-blue-600 transition-colors" 
            onClick={() => onPreview(cv.id)}
          >
            {cv.name}
          </Title>
          {cv.isDefault && (
            <Tag color="gold" className="ml-auto rounded-full text-[10px] uppercase font-bold border-none px-2 py-0.5">
              Default
            </Tag>
          )}
        </div>
      }
      extra={
        <Dropdown menu={{ items }} placement="bottomRight" trigger={['click']}>
          <Button type="text" shape="circle" icon={<MoreOutlined />} className="dark:text-gray-400" />
        </Dropdown>
      }
    >
      <div className="space-y-4 min-h-[80px]">
        <div className="flex flex-col gap-1">
            <Text type="secondary" className="text-xs uppercase tracking-wider font-semibold opacity-70">
                Performance
            </Text>
            <div className="flex items-center gap-1.5">
                <Text className="text-sm font-medium dark:text-gray-300">
                    Used for <span className="text-blue-600 dark:text-blue-400 font-bold">{cv.applicationCount}</span> applications
                </Text>
            </div>
        </div>

        <div className="flex justify-between items-center text-[11px] text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-50 dark:border-gray-800">
          <span>Updated: {new Date(cv.updatedAt).toLocaleDateString()}</span>
          {cv.lastUsedAt && (
            <span className="italic">Last used: {new Date(cv.lastUsedAt).toLocaleDateString()}</span>
          )}
        </div>
      </div>
    </Card>
  )
}

export default ManagedCVCard
