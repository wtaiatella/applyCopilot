'use client'

import { useProfile, useUpdateProfile, useUpdateExperience, useAddExperience, useDeleteExperience } from '@/hooks/use-profile-query'
import { 
  Card, 
  Typography, 
  Breadcrumb, 
  Space, 
  Button, 
  Divider, 
  Empty, 
  Skeleton,
  Tag,
  Tooltip
} from 'antd'
import { 
  HomeOutlined, 
  UserOutlined, 
  UploadOutlined, 
  RocketOutlined,
  ThunderboltOutlined,
  BookOutlined,
  PlusOutlined,
  HistoryOutlined
} from '@ant-design/icons'
import { 
  SectionHeader, 
  AchievementList, 
  ProfileSummary, 
  SkillsManager,
  Achievement
} from '@/components/profile'
import { useRouter } from 'next/navigation'
import { antdStatic } from '@/lib/antd-static'

const { Title, Text, Paragraph } = Typography

export default function ProfilePage() {
  const router = useRouter()
  const { data: response, isLoading, error } = useProfile()
  const profile = response?.data
  const updateProfileMutation = useUpdateProfile()
  const updateExperienceMutation = useUpdateExperience()
  const addExperienceMutation = useAddExperience()
  const deleteExperienceMutation = useDeleteExperience()

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4 text-center">
        <Empty description="Could not load profile. Please try again later." />
      </div>
    )
  }

  const handleUpdateSummary = (newSummary: string) => {
    updateProfileMutation.mutate({ summary: newSummary }, {
      onSuccess: () => antdStatic.notify.success({ message: 'Summary updated' })
    })
  }

  const handleUpdateSkills = (newSkills: string[]) => {
    updateProfileMutation.mutate({ skills: newSkills as any }, {
      onSuccess: () => antdStatic.notify.success({ message: 'Skills updated' })
    })
  }

  const handleUpdateExperienceAchievements = (index: number, achievements: Achievement[]) => {
    if (!profile) return
    const experiences = [...(profile.experiences || [])] as any[]
    experiences[index].achievements = achievements
    
    updateProfileMutation.mutate({ experiences }, {
      onSuccess: () => antdStatic.notify.success({ message: 'Achievements updated' })
    })
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* Breadcrumb & Header Navigation */}
      <div className="flex justify-between items-center mb-8">
        <Breadcrumb
          items={[
            { title: <><HomeOutlined /> Home</>, href: '/' },
            { title: <span><UserOutlined /> Master Profile</span> },
          ]}
        />
        <Button 
          icon={<UploadOutlined />} 
          onClick={() => router.push('/profile/cv')}
          className="rounded-xl h-10 border-blue-200 text-blue-500 hover:text-blue-600 hover:border-blue-300"
        >
          Import from CV
        </Button>
      </div>

      <div className="mb-10">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center text-3xl font-bold shadow-lg shadow-blue-200">
            {profile.id ? 'T' : 'U'}
          </div>
          <div>
            <Title level={2} className="m-0">Your Achievement Library</Title>
            <Text type="secondary" className="text-lg">This is your career's source of truth. Add everything you've ever accomplished.</Text>
          </div>
        </div>
      </div>

      <Divider className="my-10" />

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        
        {/* Left Column: Summary & Skills */}
        <div className="lg:col-span-1 space-y-8">
          <ProfileSummary 
            summary={profile.summary || ""} 
            onSave={handleUpdateSummary} 
          />
          
          <SkillsManager 
            skills={profile.skills as string[] || []} 
            onUpdate={handleUpdateSkills} 
          />

          <Card className="bg-gradient-to-br from-indigo-600 to-blue-700 text-white border-0 rounded-2xl p-2 shadow-xl shadow-blue-100">
            <Space direction="vertical" size="middle">
              <div className="bg-white/20 w-10 h-10 rounded-lg flex items-center justify-center text-xl">
                <RocketOutlined />
              </div>
              <div>
                <Title level={4} className="text-white m-0">Selective Builder</Title>
                <Paragraph className="text-white/80 mt-2">
                  Maintain your library of achievements refined. When applying, we'll pick the most relevant ones to increase your match score.
                </Paragraph>
              </div>
            </Space>
          </Card>
        </div>

        {/* Right Column: Experiences & Education */}
        <div className="lg:col-span-2 space-y-12">
          
          {/* Experiences Section */}
          <section>
            <SectionHeader 
              title="Work Experience" 
              subtitle="Break your roles into atomic achievements." 
              icon={<HistoryOutlined />}
              onAdd={() => console.log('Add Exp')}
              addText="New Role"
            />
            
            <Space direction="vertical" className="w-full" size="large">
              {(profile.experiences as any[])?.length > 0 ? (
                (profile.experiences as any[]).map((exp, idx) => (
                  <Card 
                    key={idx} 
                    className="shadow-sm border-slate-200 rounded-2xl overflow-hidden hover:border-blue-300 transition-colors"
                    title={
                      <div className="py-2">
                        <Text strong className="text-lg block">{exp.position}</Text>
                        <Text type="secondary" className="text-sm font-medium text-blue-500 uppercase tracking-wider">
                          {exp.company} • {exp.startDate || exp.start_date} — {exp.endDate || exp.end_date || 'Present'}
                        </Text>
                      </div>
                    }
                  >
                    <AchievementList 
                      achievements={exp.achievements || []} 
                      onUpdate={(newAch: Achievement[]) => handleUpdateExperienceAchievements(idx, newAch)} 
                    />
                  </Card>
                ))
              ) : (
                <Empty description="No experience added yet. Import your CV to get started!" />
              )}
            </Space>
          </section>

          {/* Education Section */}
          <section>
            <SectionHeader 
              title="Education" 
              icon={<BookOutlined />}
              onAdd={() => console.log('Add Edu')}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(profile.education as any[])?.map((edu, idx) => (
                <Card key={idx} size="small" className="bg-slate-50/50 border-slate-100 rounded-xl hover:bg-white transition-colors">
                  <Text strong className="block">{edu.institution}</Text>
                  <Text className="text-slate-600 block">{edu.degree} in {edu.field_of_study || edu.field}</Text>
                  <Text type="secondary" className="text-xs mt-2 block">{edu.startDate || edu.start_date} — {edu.endDate || edu.end_date}</Text>
                </Card>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
