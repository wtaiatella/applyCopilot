'use client'

import React, { useState, useEffect } from 'react'
import { Typography, Button, Space, Card, message, Skeleton, Breadcrumb } from 'antd'
import { 
  SaveOutlined, 
  ArrowLeftOutlined, 
  UserOutlined,
  HomeOutlined
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { useProfile, useUpdateProfile } from '@/hooks/use-profile-query'
import { ProfileBasicDataForm } from '@/components/profile/ProfileBasicDataForm'
import { SummaryManager, SummaryVersion } from '@/components/profile/SummaryManager'
import { Profile } from '@/types'
import { motion, AnimatePresence } from 'framer-motion'

const { Title, Text } = Typography

export default function BasicDataPage() {
  const router = useRouter()
  const { data: response, isLoading, error } = useProfile()
  const profile = response?.data
  const updateProfileMutation = useUpdateProfile()
  
  const [formValues, setFormValues] = useState<Partial<Profile> | null>(null)
  const [summaries, setSummaries] = useState<SummaryVersion[]>([])
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    if (profile) {
      setFormValues({
        name: profile.user?.name || '',
        email: profile.user?.email || '',
        professionalTitle: profile.professionalTitle || profile.currentPosition || '',
        phone: profile.phone || '',
        city: profile.city || '',
        country: profile.country || '',
        linkedinUrl: profile.linkedinUrl || '',
        githubUrl: profile.githubUrl || '',
        portfolioUrl: profile.portfolioUrl || '',
      })
      setSummaries(profile.summaries || [])
    }
  }, [profile])

  const handleValuesChange = (changed: Partial<Profile>, all: Partial<Profile>) => {
    setFormValues(all)
    setIsDirty(true)
  }

  const handleSummariesUpdate = (newSummaries: SummaryVersion[]) => {
    setSummaries(newSummaries)
    setIsDirty(true)
  }

  const handleSave = () => {
    if (!formValues) return

    const defaultSummary = summaries.find(s => s.isDefault)?.content || ''

    updateProfileMutation.mutate({
      ...formValues,
      summaries,
      summary: defaultSummary,
    }, {
      onSuccess: () => {
        message.success('Profile updated successfully')
        setIsDirty(false)
      },
      onError: (err: any) => {
        message.error('Failed to update profile: ' + err.message)
      }
    })
  }

  const handleGenerateAI = async () => {
    try {
      const resp = await fetch('/api/profile/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            name: formValues?.name,
            professionalTitle: formValues?.professionalTitle,
        })
      })
      const data = await resp.json()
      if (data.success) {
        return data.summary
      }
      throw new Error(data.message)
    } catch (err: any) {
      message.error('AI Generation error: ' + err.message)
      throw err
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton active paragraph={{ rows: 12 }} />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="py-20 text-center">
        <Text type="danger">Error loading profile data. Please try again.</Text>
        <Button onClick={() => window.location.reload()} className="mt-4">Retry</Button>
      </div>
    )
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 pb-20 relative"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2">
        <div>
          <Breadcrumb
            items={[
              { title: <><HomeOutlined /> </>, href: '/' },
              { title: <span><UserOutlined /> Profile</span> },
              { title: <span className="text-white">Basic Data</span> },
            ]}
            className="mb-2"
          />
          <Title level={2} className="!text-white !m-0 uppercase font-black tracking-widest text-2xl">
            Basic <span className="text-primary italic">Data</span>
          </Title>
          <Text className="text-text-muted text-xs font-medium flex items-center gap-2">
             <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
             Master Information · Synchronized with account
          </Text>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            disabled={!isDirty}
            onClick={() => router.back()}
            className="bg-surface-elevated border-border-default text-text-secondary hover:text-white rounded-btn h-11 px-6 uppercase font-bold tracking-widest text-[10px]"
          >
            Cancel Changes
          </Button>
          <Button 
            type="primary" 
            icon={<SaveOutlined size={14} />} 
            onClick={handleSave}
            loading={updateProfileMutation.isPending}
            disabled={!isDirty}
            className="bg-primary hover:bg-primary/90 text-white rounded-btn h-11 px-8 uppercase font-bold tracking-widest text-[10px] shadow-lg shadow-primary/20 border-none flex items-center gap-2"
          >
            Save Profile
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main Form Section */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-surface border-border-default rounded-card overflow-hidden shadow-2xl relative p-2">
            <ProfileBasicDataForm 
              initialValues={formValues} 
              onValuesChange={handleValuesChange} 
            />
          </Card>
        </div>

        {/* Summaries Section */}
        <div className="lg:col-span-1">
          <Card className="bg-surface border-border-default rounded-card overflow-hidden shadow-2xl relative p-2">
            <SummaryManager 
              summaries={summaries} 
              onUpdate={handleSummariesUpdate}
              onGenerateAI={handleGenerateAI}
            />
          </Card>
        </div>
      </div>

      {/* Decorative BG element matching Dashboard */}
      <div className="fixed -bottom-24 -right-24 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none -z-10" />

      {/* Unsaved changes float bar */}
      <AnimatePresence>
        {isDirty && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-8 left-1/2 z-50 bg-surface-elevated border border-primary/20 backdrop-blur-md px-6 py-4 rounded-card shadow-2xl flex items-center gap-6 min-w-[320px]"
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <div>
                <Text className="text-white text-[10px] font-black uppercase tracking-widest block">Unsaved Changes</Text>
                <Text className="text-text-muted text-[10px]">Your profile modifications are not live yet.</Text>
              </div>
            </div>
            <Button 
                type="primary" 
                onClick={handleSave}
                loading={updateProfileMutation.isPending}
                className="bg-primary border-none text-white text-[10px] h-9 px-6 rounded-btn font-black uppercase tracking-widest"
              >
                Save Now
              </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .ant-form-item-label label {
          color: #64748b !important; /* text-text-muted */
          font-size: 10px !important;
          font-weight: 900 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.1em !important;
        }
        .ant-breadcrumb .ant-breadcrumb-link {
          color: #64748b !important;
          font-size: 11px !important;
          font-weight: 500 !important;
        }
        .ant-breadcrumb .ant-breadcrumb-separator {
          color: rgba(255, 255, 255, 0.1) !important;
        }
      `}</style>
    </motion.div>
  )
}