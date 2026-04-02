'use client'

import React, { useState } from 'react'
import { 
  Typography, 
  Breadcrumb, 
  Button, 
  Row, 
  Col, 
  Empty, 
  Input, 
  Space,
  Modal,
  message,
  Card,
  Spin
} from 'antd'
import { 
  PlusOutlined, 
  AppstoreAddOutlined, 
  SearchOutlined,
  FilterOutlined,
  LoadingOutlined
} from '@ant-design/icons'
import Link from 'next/link'
import ManagedCVCard, { ManagedCV } from './components/ManagedCVCard'
import { 
  useCVs, 
  useCreateCV, 
  useUpdateCV, 
  useDeleteCV, 
  useDuplicateCV 
} from '@/hooks/use-cv-query'

const { Title, Text } = Typography

// Mock data for initial UI testing
export default function CVManagerPage() {
  const { data: cvs = [], isLoading } = useCVs()
  const createMutation = useCreateCV()
  const updateMutation = useUpdateCV()
  const deleteMutation = useDeleteCV()
  const duplicateMutation = useDuplicateCV()

  const [searchQuery, setSearchQuery] = useState('')
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false)
  const [newCvName, setNewCvName] = useState('')

  const handleEdit = (id: string) => {
    message.info(`Redirecting to edit CV: ${id}`)
  }

  const handlePreview = (id: string) => {
    message.info(`Opening preview for CV: ${id}`)
  }

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: 'Are you sure you want to delete this CV?',
      content: 'Any applications linked to this specific CV snapshot will still keep their copies, but this managed template will be removed permanently.',
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'No',
      onOk: () => {
        deleteMutation.mutate(id)
      }
    })
  }

  const handleDuplicate = (id: string) => {
    duplicateMutation.mutate(id)
  }

  const handleSetDefault = (id: string) => {
    updateMutation.mutate({ id, data: { isDefault: true } })
  }

  const handleCreate = () => {
    if (!newCvName.trim()) {
      message.error('Please enter a name for the CV template')
      return
    }
    createMutation.mutate(newCvName, {
      onSuccess: () => {
        setIsCreateModalVisible(false)
        setNewCvName('')
      }
    })
  }

  const filteredCvs = cvs.filter(cv => 
    cv.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Breadcrumb className="mb-2">
            <Breadcrumb.Item><Link href="/dashboard">Dashboard</Link></Breadcrumb.Item>
            <Breadcrumb.Item>CV Manager</Breadcrumb.Item>
          </Breadcrumb>
          <Title level={2} className="m-0">Your CV Templates</Title>
          <Text type="secondary">Manage optimized versions of your profile and track their application performance.</Text>
        </div>
        <Space>
          <Button 
            type="primary" 
            size="large" 
            icon={<PlusOutlined />}
            onClick={() => setIsCreateModalVisible(true)}
            className="bg-blue-600 hover:bg-blue-700 h-11 px-6 font-medium rounded-lg"
            loading={createMutation.isPending}
          >
            Create New
          </Button>
        </Space>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-4 flex flex-wrap gap-4 items-center">
        <Input 
          prefix={<SearchOutlined className="text-gray-400" />} 
          placeholder="Search by CV name..." 
          className="max-w-md h-10 rounded-lg"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <Button icon={<FilterOutlined />} className="h-10 px-4 rounded-lg">Filter</Button>
        <Text type="secondary" className="ml-auto hidden md:block">
            Showing {filteredCvs.length} of {cvs.length} versions
        </Text>
      </div>

      {isLoading ? (
        <div className="py-20 text-center">
            <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
            <div className="mt-4"><Text type="secondary">Loading your CV templates...</Text></div>
        </div>
      ) : filteredCvs.length > 0 ? (
        <Row gutter={[24, 24]}>
          {filteredCvs.map((cv: ManagedCV) => (
            <Col xs={24} sm={12} lg={8} xl={6} key={cv.id}>
              <ManagedCVCard 
                cv={cv}
                onEdit={handleEdit}
                onPreview={handlePreview}
                onDownload={() => message.info('Generating PDF...')}
                onDuplicate={handleDuplicate}
                onSetDefault={handleSetDefault}
                onDelete={handleDelete}
              />
            </Col>
          ))}
          <Col xs={24} sm={12} lg={8} xl={6}>
            <div 
              onClick={() => setIsCreateModalVisible(true)}
              className="h-full min-h-[220px] border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-all group"
            >
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-full mb-3 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-colors">
                <PlusOutlined className="text-2xl text-gray-400 group-hover:text-blue-500" />
              </div>
              <Text className="font-medium group-hover:text-blue-600 transition-colors text-gray-400">Create Another Template</Text>
            </div>
          </Col>
        </Row>
      ) : (
        <Card className="rounded-xl border-gray-100 dark:border-gray-800 py-12">
            <Empty 
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                    <div className="space-y-2">
                        <Text strong className="text-lg">No CV templates found</Text>
                        <br />
                        <Text type="secondary">Translate your master profile into specific CV versions to start tracking.</Text>
                    </div>
                }
            >
                <Button 
                    type="primary" 
                    icon={<PlusOutlined />} 
                    className="h-11 px-8 rounded-lg mt-4"
                    onClick={() => setIsCreateModalVisible(true)}
                >
                    Create Your First Template
                </Button>
            </Empty>
        </Card>
      )}

      {/* Create Modal */}
      <Modal
        title="Create New CV Template"
        open={isCreateModalVisible}
        onOk={handleCreate}
        onCancel={() => setIsCreateModalVisible(false)}
        confirmLoading={createMutation.isPending}
        okText="Create from Profile"
        className="rounded-xl overflow-hidden"
      >
        <div className="py-4">
          <Text type="secondary" className="mb-4 block">
            This will create a new CV template based on your current Master Profile snapshot.
          </Text>
          <div className="space-y-2">
            <Text strong>template Name</Text>
            <Input 
              placeholder="e.g., Senior Fullstack Developer 2024" 
              value={newCvName}
              onChange={e => setNewCvName(e.target.value)}
              className="h-11 rounded-lg mt-1"
              onPressEnter={handleCreate}
              autoFocus
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
