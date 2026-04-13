'use client'

import React, { useState } from 'react'
import { Typography, Button, Input, List, Space, Tag, Modal, message, Empty } from 'antd'
import { 
  PlusOutlined, 
  ThunderboltOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  CheckCircleOutlined
} from '@ant-design/icons'
import { motion, AnimatePresence } from 'framer-motion'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

export interface SummaryVersion {
  id: string
  title: string
  content: string
  isDefault: boolean
  createdAt: string
}

interface SummaryManagerProps {
  summaries: SummaryVersion[]
  onUpdate: (summaries: SummaryVersion[]) => void
  onGenerateAI?: () => Promise<string>
}

export function SummaryManager({ summaries = [], onUpdate, onGenerateAI }: SummaryManagerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSummary, setEditingSummary] = useState<SummaryVersion | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const handleOpenModal = (summary?: SummaryVersion) => {
    if (summary) {
      setEditingSummary(summary)
      setFormTitle(summary.title)
      setFormContent(summary.content)
    } else {
      setEditingSummary(null)
      setFormTitle(`Version ${summaries.length + 1}`)
      setFormContent('')
    }
    setIsModalOpen(true)
  }

  const handleSave = () => {
    if (!formContent.trim()) {
      message.error('Summary content cannot be empty')
      return
    }

    let newSummaries = [...summaries]
    if (editingSummary) {
      newSummaries = newSummaries.map(s => 
        s.id === editingSummary.id 
          ? { ...s, title: formTitle, content: formContent } 
          : s
      )
    } else {
      const newSummary: SummaryVersion = {
        id: Math.random().toString(36).substr(2, 9),
        title: formTitle || `Version ${summaries.length + 1}`,
        content: formContent,
        isDefault: summaries.length === 0,
        createdAt: new Date().toISOString()
      }
      newSummaries.push(newSummary)
    }

    onUpdate(newSummaries)
    setIsModalOpen(false)
    message.success('Summary version saved')
  }

  const handleDelete = (id: string) => {
    const newSummaries = summaries.filter(s => s.id !== id)
    if (summaries.find(s => s.id === id)?.isDefault && newSummaries.length > 0) {
      newSummaries[0].isDefault = true
    }
    onUpdate(newSummaries)
    message.success('Deleted')
  }

  const handleSetDefault = (id: string) => {
    const newSummaries = summaries.map(s => ({
      ...s,
      isDefault: s.id === id
    }))
    onUpdate(newSummaries)
    message.success('Primary summary updated')
  }

  const handleGenerateAI = async () => {
    if (!onGenerateAI) return
    setIsGenerating(true)
    try {
      const aiContent = await onGenerateAI()
      setFormContent(aiContent)
      message.success('AI refinement complete')
    } catch (error) {
      message.error('AI error')
    } finally {
      setIsGenerating(false)
    }
  }

  const inputClass = "bg-white/5 border-white/10 text-text-primary rounded-btn h-12 hover:border-primary/50 focus:border-primary transition-all text-sm px-4"

  return (
    <div className="space-y-6 p-2">
      <div className="flex justify-between items-center bg-surface-elevated p-4 rounded-btn border border-border-default shadow-sm mb-2">
        <div>
          <Title level={4} className="!text-text-primary !m-0 uppercase tracking-widest text-[11px] font-black">
            Summaries <span className="text-primary italic opacity-70">Versions</span>
          </Title>
          <Text className="text-text-muted text-[10px] font-medium leading-none">Tailor for specific job roles.</Text>
        </div>
        <Space size="small">
          <Button 
            type="primary" 
            ghost
            icon={<ThunderboltOutlined size={14} />} 
            onClick={handleGenerateAI}
            loading={isGenerating}
            className="border-primary/20 text-primary hover:border-primary hover:bg-primary/5 rounded-btn h-9 text-[10px] font-black uppercase tracking-widest px-4 flex items-center gap-1.5"
          >
            AI Gen
          </Button>
          <Button 
            type="primary" 
            icon={<PlusOutlined size={14} />} 
            onClick={() => handleOpenModal()}
            className="rounded-btn h-9 text-[10px] font-black uppercase tracking-widest bg-primary shadow-lg shadow-primary/20 px-4 flex items-center gap-1.5 border-none"
          >
            New
          </Button>
        </Space>
      </div>

      <AnimatePresence mode="popLayout">
        {summaries.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-12 border border-dashed border-white/5 rounded-card text-center">
            <Empty description={<Text className="text-text-muted text-xs">Create your first summary or use AI.</Text>} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </motion.div>
        ) : (
          <List
            grid={{ gutter: 16, column: 1 }}
            dataSource={summaries}
            renderItem={(item) => (
              <List.Item className="!mb-4">
                <motion.div layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                  <div className={`relative bg-surface-elevated border rounded-card p-5 transition-all group ${item.isDefault ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/10' : 'border-border-default hover:border-primary/20'}`}>
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Text className="text-text-primary font-bold text-sm tracking-tight">{item.title}</Text>
                          {item.isDefault && (
                            <Tag color="blue" className="bg-primary/20 border-primary/30 text-primary text-[9px] font-black uppercase tracking-widest m-0 px-2 rounded-full border-none">
                              Active
                            </Tag>
                          )}
                        </div>
                        <Paragraph className="text-text-secondary text-xs leading-relaxed line-clamp-3 mb-0 italic opacity-80">
                          {item.content}
                        </Paragraph>
                      </div>
                      
                      <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0">
                        <Button 
                          type="text" 
                          icon={<CheckCircleOutlined size={14} />} 
                          disabled={item.isDefault}
                          onClick={() => handleSetDefault(item.id)}
                          className="text-positive hover:bg-positive/10 rounded-btn h-8 w-8 flex items-center justify-center p-0"
                          title="Set as active"
                        />
                        <Button 
                          type="text" 
                          icon={<EditOutlined size={14} />} 
                          onClick={() => handleOpenModal(item)}
                          className="text-text-muted hover:text-white hover:bg-white/5 rounded-btn h-8 w-8 flex items-center justify-center p-0"
                        />
                        <Button 
                          type="text" 
                          danger
                          icon={<DeleteOutlined size={14} />} 
                          onClick={() => handleDelete(item.id)}
                          className="hover:bg-negative/10 rounded-btn h-8 w-8 flex items-center justify-center p-0"
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              </List.Item>
            )}
          />
        )}
      </AnimatePresence>

      <Modal
        title={
          <div className="flex items-center gap-3">
             <div className="w-9 h-9 rounded-btn bg-primary/10 flex items-center justify-center text-primary">
              <ThunderboltOutlined size={18} />
            </div>
            <span className="text-text-primary font-black uppercase tracking-widest text-xs">
              {editingSummary ? 'Edit Summary' : 'AI Powered Summary'}
            </span>
          </div>
        }
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText="Confirm Version"
        cancelText="Discard"
        width={700}
        centered
        destroyOnClose
        styles={{ 
            body: { paddingTop: '20px', backgroundColor: '#0f172a' },
            header: { backgroundColor: 'transparent', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '16px' },
            mask: { backdropFilter: 'blur(4px)' }
        }}
        style={{ backgroundColor: '#0f172a', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '1.5rem', overflow: 'hidden' }}
        okButtonProps={{ className: 'bg-primary hover:bg-primary/90 text-white rounded-btn h-11 font-black uppercase tracking-widest px-8 border-none shadow-lg shadow-primary/20' }}
        cancelButtonProps={{ className: 'bg-white/5 border-white/5 text-text-secondary hover:text-white hover:bg-white/10 rounded-btn h-11 uppercase font-bold tracking-widest px-6' }}
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <Text className="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">Contextual Headline</Text>
            <Input 
              value={formTitle} 
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="e.g. Lead Architect, Global Recruiter"
              className={inputClass}
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center ml-1">
              <Text className="text-[10px] font-black uppercase tracking-widest text-text-muted">Narrative Content</Text>
              <Button 
                type="text" 
                icon={<ThunderboltOutlined size={12} />} 
                onClick={handleGenerateAI}
                loading={isGenerating}
                className="text-primary hover:bg-primary/5 text-[10px] font-black uppercase tracking-widest p-0 h-auto"
              >
                Spark with AI
              </Button>
            </div>
            <TextArea 
              value={formContent} 
              onChange={(e) => setFormContent(e.target.value)}
              placeholder="Start your story here..."
              autoSize={{ minRows: 6, maxRows: 12 }}
              className={`${inputClass} h-auto py-4 leading-relaxed italic opacity-90`}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
