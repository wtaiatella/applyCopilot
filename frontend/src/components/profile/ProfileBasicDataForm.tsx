'use client'

import React from 'react'
import { Form, Input, Row, Col, Typography } from 'antd'
import {
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  EnvironmentOutlined,
  LinkedinOutlined,
  GithubOutlined,
  GlobalOutlined,
  IdcardOutlined
} from '@ant-design/icons'
import { Profile } from '@/types'

const { Text } = Typography

interface ProfileBasicDataFormProps {
  initialValues: Partial<Profile> | null
  onValuesChange: (changedValues: Partial<Profile>, allValues: Partial<Profile>) => void
}

export function ProfileBasicDataForm({ initialValues, onValuesChange }: ProfileBasicDataFormProps) {
  const [form] = Form.useForm()

  const safeInitialValues = initialValues || {}

  const inputClass = "bg-surface-elevated border-border-default text-text-primary rounded-btn h-12 hover:border-primary/50 focus:border-primary transition-all text-sm px-4"

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={safeInitialValues}
      onValuesChange={onValuesChange}
      className="p-4"
      requiredMark={false}
    >
      <Row gutter={[24, 24]}>
        {/* Section Header */}
        <Col span={24}>
           <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-btn bg-primary/10 flex items-center justify-center text-primary">
              <UserOutlined size={16} />
            </div>
            <Text className="text-sm font-black uppercase tracking-widest text-text-primary">Personal Details</Text>
          </div>
          <div className="h-px bg-white/5 w-full mb-4" />
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label="Full Name"
            name="name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input 
              prefix={<UserOutlined size={14} className="text-text-muted mr-2" />} 
              placeholder="e.g. John Doe"
              className={inputClass}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label="Professional Title"
            name="professionalTitle"
          >
            <Input 
              prefix={<IdcardOutlined size={14} className="text-text-muted mr-2" />} 
              placeholder="e.g. Senior Software Engineer"
              className={inputClass}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label="Email (Account)"
            name="email"
          >
            <Input 
              prefix={<MailOutlined size={14} className="text-text-muted mr-2" />} 
              disabled
              className={`${inputClass} !bg-white/5 border-none opacity-60 cursor-not-allowed`}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label="Phone Number"
            name="phone"
          >
            <Input 
              prefix={<PhoneOutlined size={14} className="text-text-muted mr-2" />} 
              placeholder="e.g. +1 (555) 000-0000"
              className={inputClass}
            />
          </Form.Item>
        </Col>

        {/* Location Section */}
        <Col span={24} className="mt-4">
           <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-btn bg-accent/10 flex items-center justify-center text-accent">
              <EnvironmentOutlined size={16} />
            </div>
            <Text className="text-sm font-black uppercase tracking-widest text-text-primary">Location info</Text>
          </div>
          <div className="h-px bg-white/5 w-full mb-4" />
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label="City / Location"
            name="city"
          >
            <Input 
              prefix={<EnvironmentOutlined size={14} className="text-text-muted mr-2" />} 
              placeholder="e.g. San Francisco, CA"
              className={inputClass}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label="Country"
            name="country"
          >
            <Input 
              prefix={<GlobalOutlined size={14} className="text-text-muted mr-2" />} 
              placeholder="e.g. United States"
              className={inputClass}
            />
          </Form.Item>
        </Col>

        {/* Links Section */}
        <Col span={24} className="mt-4">
           <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-btn bg-positive/10 flex items-center justify-center text-positive">
              <LinkedinOutlined size={16} />
            </div>
            <Text className="text-sm font-black uppercase tracking-widest text-text-primary">Professional presence</Text>
          </div>
          <div className="h-px bg-white/5 w-full mb-4" />
        </Col>

        <Col xs={24} md={12} lg={8}>
          <Form.Item
            label="LinkedIn"
            name="linkedinUrl"
          >
            <Input 
              prefix={<LinkedinOutlined size={14} className="text-text-muted mr-2" />} 
              placeholder="linkedin.com/in/username"
              className={inputClass}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12} lg={8}>
          <Form.Item
            label="GitHub"
            name="githubUrl"
          >
            <Input 
              prefix={<GithubOutlined size={14} className="text-text-muted mr-2" />} 
              placeholder="github.com/username"
              className={inputClass}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12} lg={8}>
          <Form.Item
            label="Website"
            name="portfolioUrl"
          >
            <Input 
              prefix={<GlobalOutlined size={14} className="text-text-muted mr-2" />} 
              placeholder="yourwebsite.com"
              className={inputClass}
            />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  )
}
