'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/auth.context'
import { Card, Typography, Breadcrumb, Space, Divider } from 'antd'
import { CVUpload, ExtractedDataReview } from '@/components/cv-upload'
import { useRouter } from 'next/navigation'
import { HomeOutlined, UserOutlined, UploadOutlined, BookOutlined } from '@ant-design/icons'
import { cvService } from '@/lib/services'
import { antdStatic } from '@/lib/antd-static'

const { Title, Text, Paragraph } = Typography

export default function CVPage() {
  const { isAuthenticated } = useAuth()
  const router = useRouter()
  const [extractedData, setExtractedData] = useState<any>(null)
  const [isSaving, setIsSaving] = useState(false)

  if (!isAuthenticated) {
    return null
  }

  const handleConfirmSave = async (data: any) => {
    setIsSaving(true)
    try {
      const response = await cvService.confirmExtractedData(data)
      if (response.success) {
        antdStatic.notify.success({
          message: 'Profile Updated',
          description: 'Your Master Profile has been successfully updated with the imported data.',
        })
        router.push('/profile')
      } else {
        antdStatic.notify.error({
          message: 'Save Failed',
          description: response.message || 'Error saving extracted data.',
        })
      }
    } catch (error) {
      console.error('Error saving CV data:', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <Breadcrumb
        className="mb-6"
        items={[
          { title: <><HomeOutlined /> Home</>, href: '/' },
          { title: 'Profile', href: '/profile' },
          { title: <span><UploadOutlined /> Import CV</span> },
        ]}
      />

      <div className="mb-8">
        <Title level={2}>
          {extractedData ? 'Review Extracted Data' : 'Import Resume'}
        </Title>
        <Paragraph type="secondary" className="text-lg">
          {extractedData 
            ? 'Verify the classification of your professional experiences and education.' 
            : 'Upload your current resume to automatically populate your Master Profile.'}
        </Paragraph>
        <Divider />
      </div>

      {!extractedData ? (
        <div className="grid grid-cols-1 gap-8">
          <Card className="shadow-sm border-slate-200 rounded-2xl">
            <Space direction="vertical" size="large" className="w-full">
              <div>
                <Title level={4}>1. Upload your file</Title>
                <Text type="secondary">
                  Supported formats: PDF, DOC, DOCX. Maximum file size: 10MB.
                </Text>
              </div>
              
              <CVUpload 
                onProcessingComplete={(data) => {
                  setExtractedData(data)
                }}
              />
            </Space>
          </Card>

          <Card size="small" className="bg-blue-50/50 border-blue-100 rounded-xl">
            <Space align="start">
              <UserOutlined className="text-blue-500 mt-1" />
              <div>
                <Text strong className="text-blue-700">How it works:</Text>
                <Paragraph className="text-blue-600 mb-0 mt-1">
                  Your data will be extracted exactly as it is. No modifications will be made by the AI. 
                  You will be able to review, edit, and professionalize your achievements in the next step.
                </Paragraph>
              </div>
            </Space>
          </Card>
        </div>
      ) : (
        <ExtractedDataReview 
          data={extractedData}
          onConfirm={handleConfirmSave}
          onEdit={(newData) => setExtractedData(newData)}
        />
      )}
    </div>
  )
}
