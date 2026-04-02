'use client'

import { useState } from 'react'
import { 
  Card, 
  Typography, 
  Form, 
  Input, 
  Button, 
  Space, 
  Alert, 
  Divider, 
  Tag, 
  Collapse,
  Badge
} from 'antd'
import { 
  EditOutlined, 
  SaveOutlined, 
  CheckOutlined, 
  CloseOutlined, 
  WarningOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
  BookOutlined,
  HistoryOutlined
} from '@ant-design/icons'
import type { CollapseProps } from 'antd'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

interface ExtractedData {
  summary?: string
  skills?: string[]
  experiences?: Array<{
    company?: string
    position?: string
    startDate?: string
    endDate?: string | null
    description?: string
    achievements?: string[]
    technologies?: string[]
  }>
  education?: Array<{
    institution?: string
    degree?: string
    field?: string
    startDate?: string
    endDate?: string | null
    description?: string
  }>
}

interface ExtractedDataReviewProps {
  data: ExtractedData
  onConfirm?: (confirmedData: ExtractedData) => void
  onEdit?: (data: ExtractedData) => void
}

export function ExtractedDataReview({ data, onConfirm, onEdit }: ExtractedDataReviewProps) {
  const [editMode, setEditMode] = useState(false)
  const [formData, setFormData] = useState<ExtractedData>(data)
  const [form] = Form.useForm()

  const handleEdit = () => {
    setEditMode(true)
    form.setFieldsValue(formData)
  }

  const handleSave = () => {
    form.validateFields().then((values) => {
      setFormData(values)
      setEditMode(false)
      onEdit?.(values)
    })
  }

  const handleCancel = () => {
    setEditMode(false)
    form.setFieldsValue(formData)
  }

  const handleConfirm = () => {
    onConfirm?.(formData)
  }

  const renderSummary = () => (
    <div className="py-2">
      <Title level={5} className="mb-2"><InfoCircleOutlined /> Professional Summary</Title>
      {editMode ? (
        <Form.Item name="summary">
          <TextArea rows={4} className="rounded-lg" />
        </Form.Item>
      ) : (
        <Paragraph className="bg-slate-50 p-4 rounded-xl border border-slate-100 italic text-slate-600">
          "{formData.summary || 'No summary extracted.'}"
        </Paragraph>
      )}
    </div>
  )

  const renderExperiences = () => (
    <div className="py-2">
      <Title level={5} className="mb-4"><HistoryOutlined /> Professional Experience</Title>
      <Space direction="vertical" className="w-full" size="middle">
        {formData.experiences?.map((exp, idx) => (
          <Badge.Ribbon text={exp.company} key={idx} color="blue">
            <Card size="small" className="border-slate-100 shadow-sm pt-4">
              <Space direction="vertical" className="w-full">
                <div className="flex justify-between items-start">
                  <div>
                    <Text strong className="text-lg block">{exp.position}</Text>
                    <Text type="secondary" className="text-xs text-blue-500 font-medium uppercase tracking-wider">
                      {exp.startDate} — {exp.endDate || 'Present'}
                    </Text>
                  </div>
                </div>
                
                <Divider className="my-2" />
                
                <div>
                  <Text type="secondary" className="text-xs font-bold uppercase mb-2 block tracking-tight">Achievements (Atomic Data)</Text>
                  <ul className="list-disc pl-5 space-y-1">
                    {exp.achievements?.map((ach, aidx) => (
                      <li key={aidx} className="text-slate-700 leading-relaxed">{ach}</li>
                    ))}
                  </ul>
                </div>

                {exp.technologies && exp.technologies.length > 0 && (
                  <div className="mt-2">
                    <Space wrap size={[4, 4]}>
                      {exp.technologies.map((tech, tidx) => (
                        <Tag key={tidx} className="bg-slate-50 border-slate-200 text-slate-500 text-[10px] uppercase font-bold m-0 p-0 px-2 rounded-full">
                          {tech}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                )}
              </Space>
            </Card>
          </Badge.Ribbon>
        ))}
      </Space>
    </div>
  )

  const renderEducation = () => (
    <div className="py-2">
      <Title level={5} className="mb-4"><BookOutlined /> Education</Title>
      <Space direction="vertical" className="w-full">
        {formData.education?.map((edu, idx) => (
          <Card key={idx} size="small" className="bg-slate-50/50 border-slate-100">
            <Text strong className="block">{edu.institution}</Text>
            <Text className="text-slate-600">{edu.degree} in {edu.field}</Text>
            <Text type="secondary" className="block text-xs mt-1">{edu.startDate} — {edu.endDate}</Text>
          </Card>
        ))}
      </Space>
    </div>
  )

  const renderSkills = () => (
    <div className="py-2">
      <Title level={5} className="mb-2"><ThunderboltOutlined /> Extracted Skills</Title>
      <Space wrap>
        {formData.skills?.map((skill, idx) => (
          <Tag key={idx} color="processing" className="rounded-full px-3">{skill}</Tag>
        ))}
      </Space>
    </div>
  )

  const collapseItems: CollapseProps['items'] = [
    {
      key: '1',
      label: <Text strong>Professional Summary</Text>,
      children: renderSummary(),
    },
    {
      key: '2',
      label: <Text strong>Experience ({formData.experiences?.length || 0})</Text>,
      children: renderExperiences(),
    },
    {
      key: '3',
      label: <Text strong>Education ({formData.education?.length || 0})</Text>,
      children: renderEducation(),
    },
    {
      key: '4',
      label: <Text strong>Skills ({formData.skills?.length || 0})</Text>,
      children: renderSkills(),
    },
  ]

  return (
    <div className="animate-in fade-in duration-700">
      <Space direction="vertical" className="w-full" size="large">
        <Alert
          message="Faithful Extraction verified"
          description="Data has been classified based on your resume. No changes were made to your original text. Please verify the classification below."
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          className="rounded-xl border-blue-100 bg-blue-50/30"
        />

        <div className="flex justify-between items-center mb-2">
          <div>
            <Title level={4} className="m-0">Data Classification Review</Title>
            <Text type="secondary">Organizing your resume into atomic achievements.</Text>
          </div>
          <Space>
            {!editMode ? (
              <Button icon={<EditOutlined />} onClick={handleEdit} className="rounded-lg">
                Edit Mapping
              </Button>
            ) : (
              <Space>
                <Button icon={<SaveOutlined />} type="primary" onClick={handleSave} className="rounded-lg">
                  Save Changes
                </Button>
                <Button icon={<CloseOutlined />} onClick={handleCancel} className="rounded-lg">
                  Cancel
                </Button>
              </Space>
            )}
          </Space>
        </div>

        <Form
          form={form}
          layout="vertical"
          style={{ width: '100%' }}
        >
          <Collapse 
            defaultActiveKey={['1', '2']} 
            ghost 
            expandIconPosition="end"
            className="bg-white border rounded-2xl overflow-hidden border-slate-200"
            items={collapseItems}
          />
        </Form>

        <Divider className="my-2" />

        <div className="flex justify-between items-center bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <div>
            <Text strong className="block text-lg">Ready to build your library?</Text>
            <Text type="secondary">Confirming will save this data to your Master Profile.</Text>
          </div>
          <Space size="middle">
            <Button size="large" className="rounded-xl px-8 h-12">
              Later
            </Button>
            <Button 
              type="primary" 
              size="large" 
              icon={<CheckOutlined />}
              onClick={handleConfirm}
              className="rounded-xl px-8 h-12 shadow-md shadow-blue-200"
            >
              Confirm and Save
            </Button>
          </Space>
        </div>
      </Space>
    </div>
  )
}
