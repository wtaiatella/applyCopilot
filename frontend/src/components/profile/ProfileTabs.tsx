"use client";

import React from "react";
import { Tabs, Card } from "antd";
import type { TabsProps } from "antd";
import { BasicDataForm } from "./BasicDataForm";
import { ExperiencesForm } from "./ExperiencesForm";
import { EducationForm } from "./EducationForm";
import { ProjectsForm } from "./ProjectsForm";
import { SkillsForm } from "./SkillsForm";
import { ReferencesForm } from "./ReferencesForm";

interface ProfileTabsProps {
  profileData: any; // Ideally typed to ProfileUpdateInput
  loading?: boolean;
  onUpdateBasicData: (data: any) => Promise<void>;
  onUpdateExperiences: (data: any) => Promise<void>;
  onUpdateEducation: (data: any) => Promise<void>;
  onUpdateProjects: (data: any) => Promise<void>;
  onUpdateSkills: (data: any) => Promise<void>;
  onUpdateReferences: (data: any) => Promise<void>;
}

export function ProfileTabs({
  profileData,
  loading,
  onUpdateBasicData,
  onUpdateExperiences,
  onUpdateEducation,
  onUpdateProjects,
  onUpdateSkills,
  onUpdateReferences,
}: ProfileTabsProps) {
  
  const items: TabsProps['items'] = [
    {
      key: '1',
      label: 'Basic Data',
      children: (
        <BasicDataForm 
          initialData={profileData?.basicData} 
          onSubmit={onUpdateBasicData} 
          loading={loading} 
        />
      ),
    },
    {
      key: '2',
      label: 'Experiences',
      children: (
        <ExperiencesForm 
          initialData={profileData?.experiences} 
          cvs={profileData?.cvs}
          onSubmit={onUpdateExperiences} 
          loading={loading} 
        />
      ),
    },
    {
      key: '3',
      label: 'Education',
      children: (
        <EducationForm 
          initialData={profileData?.education} 
          loading={loading} 
          onSubmit={onUpdateEducation} 
        />
      ),
    },
    {
      key: '4',
      label: 'Projects',
      children: (
        <ProjectsForm 
          initialData={profileData?.projects} 
          cvs={profileData?.cvs}
          onSubmit={onUpdateProjects} 
          loading={loading} 
        />
      ),
    },
    {
      key: '5',
      label: 'Skills',
      children: (
        <SkillsForm 
          initialData={profileData?.skills} 
          onSubmit={onUpdateSkills} 
          loading={loading} 
        />
      ),
    },
    {
      key: '6',
      label: 'References',
      children: (
        <ReferencesForm 
          initialData={profileData?.references} 
          onSubmit={onUpdateReferences} 
          loading={loading} 
        />
      ),
    },
  ];

  return (
    <Card className="shadow-sm">
      <Tabs defaultActiveKey="1" items={items} />
    </Card>
  );
}
