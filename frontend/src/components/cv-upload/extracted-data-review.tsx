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
  Switch
} from 'antd'
import { 
  EditOutlined, 
  SaveOutlined,
  CheckOutlined,
  CloseOutlined,
  WarningOutlined
} from '@ant-design/icons'
import type { CollapseProps } from 'antd'

const { Title, Text } = Typography
const { Panel } = Collapse
const { TextArea } = Input

interface ExtractedData {
  personal_info?: {
    name?: string
    email?: string
    phone?: string
    location?: string
    linkedin?: string
    github?: string
  }
  summary?: string
  experience?: Array<{
    company?: string
    position?: string
    duration?: string
    description?: string
  }>
  education?: Array<{
    institution?: string
    degree?: string
    duration?: string
    description?: string
  }>
  skills?: string[]
  languages?: string[]
  projects?: Array<{
    name?: string
    description?: string
    technologies?: string[]
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
  const [validationWarnings, setValidationWarnings] = useState<string[]>([])

  const validateData = (dataToValidate: ExtractedData) => {
    const warnings: string[] = []
    
    if (!dataToValidate.personal_info?.name) {
      warnings.push('Nome não encontrado')
    }
    if (!dataToValidate.personal_info?.email) {
      warnings.push('Email não encontrado')
    }
    if (!dataToValidate.experience || dataToValidate.experience.length === 0) {
      warnings.push('Nenhuma experiência encontrada')
    }
    if (!dataToValidate.education || dataToValidate.education.length === 0) {
      warnings.push('Nenhuma formação encontrada')
    }
    if (!dataToValidate.skills || dataToValidate.skills.length === 0) {
      warnings.push('Nenhuma habilidade encontrada')
    }
    
    setValidationWarnings(warnings)
    return warnings.length === 0
  }

  const handleEdit = () => {
    setEditMode(true)
    form.setFieldsValue(formData)
  }

  const handleSave = () => {
    form.validateFields().then((values) => {
      setFormData(values)
      setEditMode(false)
      validateData(values)
      onEdit?.(values)
    })
  }

  const handleCancel = () => {
    setEditMode(false)
    form.setFieldsValue(formData)
  }

  const handleConfirm = () => {
    const isValid = validateData(formData)
    if (isValid || window.confirm('Existem avisos de validação. Deseja continuar mesmo assim?')) {
      onConfirm?.(formData)
    }
  }

  const renderPersonalInfo = () => {
    const personalInfo = formData.personal_info || {}
    
    if (editMode) {
      return (
        <Card size="small" title="Informações Pessoais">
          <Form.Item label="Nome" name={['personal_info', 'name']}>
            <Input placeholder="Seu nome completo" />
          </Form.Item>
          <Form.Item label="Email" name={['personal_info', 'email']}>
            <Input placeholder="seu@email.com" />
          </Form.Item>
          <Form.Item label="Telefone" name={['personal_info', 'phone']}>
            <Input placeholder="(00) 00000-0000" />
          </Form.Item>
          <Form.Item label="Localização" name={['personal_info', 'location']}>
            <Input placeholder="Cidade, Estado" />
          </Form.Item>
          <Form.Item label="LinkedIn" name={['personal_info', 'linkedin']}>
            <Input placeholder="linkedin.com/in/seuperfil" />
          </Form.Item>
          <Form.Item label="GitHub" name={['personal_info', 'github']}>
            <Input placeholder="github.com/seuusuario" />
          </Form.Item>
        </Card>
      )
    }
    
    return (
      <Card size="small" title="Informações Pessoais">
        <Space direction="vertical" className="w-full">
          {personalInfo.name && (
            <div><Text strong>Nome:</Text> {personalInfo.name}</div>
          )}
          {personalInfo.email && (
            <div><Text strong>Email:</Text> {personalInfo.email}</div>
          )}
          {personalInfo.phone && (
            <div><Text strong>Telefone:</Text> {personalInfo.phone}</div>
          )}
          {personalInfo.location && (
            <div><Text strong>Localização:</Text> {personalInfo.location}</div>
          )}
          {personalInfo.linkedin && (
            <div><Text strong>LinkedIn:</Text> {personalInfo.linkedin}</div>
          )}
          {personalInfo.github && (
            <div><Text strong>GitHub:</Text> {personalInfo.github}</div>
          )}
        </Space>
      </Card>
    )
  }

  const renderExperience = () => {
    const experiences = formData.experience || []
    
    return (
      <Card size="small" title="Experiência Profissional">
        {experiences.length === 0 ? (
          <Text type="secondary">Nenhuma experiência encontrada</Text>
        ) : (
          experiences.map((exp, index) => (
            <Card key={index} size="small" className="mb-2">
              <Space direction="vertical" className="w-full">
                <div><Text strong>Empresa:</Text> {exp.company}</div>
                <div><Text strong>Cargo:</Text> {exp.position}</div>
                <div><Text strong>Período:</Text> {exp.duration}</div>
                {exp.description && (
                  <div><Text strong>Descrição:</Text> {exp.description}</div>
                )}
              </Space>
            </Card>
          ))
        )}
      </Card>
    )
  }

  const renderEducation = () => {
    const education = formData.education || []
    
    return (
      <Card size="small" title="Formação Acadêmica">
        {education.length === 0 ? (
          <Text type="secondary">Nenhuma formação encontrada</Text>
        ) : (
          education.map((edu, index) => (
            <Card key={index} size="small" className="mb-2">
              <Space direction="vertical" className="w-full">
                <div><Text strong>Instituição:</Text> {edu.institution}</div>
                <div><Text strong>Grau:</Text> {edu.degree}</div>
                <div><Text strong>Período:</Text> {edu.duration}</div>
                {edu.description && (
                  <div><Text strong>Descrição:</Text> {edu.description}</div>
                )}
              </Space>
            </Card>
          ))
        )}
      </Card>
    )
  }

  const renderSkills = () => {
    const skills = formData.skills || []
    
    return (
      <Card size="small" title="Habilidades">
        {skills.length === 0 ? (
          <Text type="secondary">Nenhuma habilidade encontrada</Text>
        ) : (
          <Space wrap>
            {skills.map((skill, index) => (
              <Tag key={index} color="blue">{skill}</Tag>
            ))}
          </Space>
        )}
      </Card>
    )
  }

  const items: CollapseProps['items'] = [
    {
      key: 'personal',
      label: 'Informações Pessoais',
      children: renderPersonalInfo(),
    },
    {
      key: 'experience',
      label: 'Experiência Profissional',
      children: renderExperience(),
    },
    {
      key: 'education',
      label: 'Formação Acadêmica',
      children: renderEducation(),
    },
    {
      key: 'skills',
      label: 'Habilidades',
      children: renderSkills(),
    },
  ]

  return (
    <Card>
      <Space direction="vertical" className="w-full">
        <Space className="w-full justify-between">
          <Title level={4}>Revisão de Dados Extraídos</Title>
          <Space>
            {!editMode ? (
              <Button icon={<EditOutlined />} onClick={handleEdit}>
                Editar
              </Button>
            ) : (
              <>
                <Button icon={<SaveOutlined />} type="primary" onClick={handleSave}>
                  Salvar
                </Button>
                <Button icon={<CloseOutlined />} onClick={handleCancel}>
                  Cancelar
                </Button>
              </>
            )}
          </Space>
        </Space>

        {validationWarnings.length > 0 && (
          <Alert
            message="Avisos de Validação"
            description={
              <ul>
                {validationWarnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            }
            type="warning"
            showIcon
            icon={<WarningOutlined />}
          />
        )}

        <Form
          form={form}
          layout="vertical"
          initialValues={formData}
          onValuesChange={(_, allValues) => setFormData(allValues)}
        >
          <Collapse items={items} defaultActiveKey={['personal']} />
        </Form>

        <Divider />

        <Space className="w-full justify-end">
          <Button size="large">
            Revisar Mais Tarde
          </Button>
          <Button 
            type="primary" 
            size="large" 
            icon={<CheckOutlined />}
            onClick={handleConfirm}
          >
            Confirmar Dados
          </Button>
        </Space>
      </Space>
    </Card>
  )
}
