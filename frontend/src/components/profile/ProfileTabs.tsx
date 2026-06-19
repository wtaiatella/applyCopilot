"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Tabs, 
  Form, 
  Input, 
  Button, 
  Card, 
  DatePicker, 
  Checkbox, 
  Select, 
  InputNumber, 
  Tooltip,
  Typography,
  Divider,
  Badge
} from "antd";
import { 
  PlusOutlined, 
  DeleteOutlined, 
  CloudSyncOutlined, 
  CheckCircleOutlined, 
  ExclamationCircleOutlined,
  MinusCircleOutlined
} from "@ant-design/icons";
import { useProfileContext, SaveStatus } from "../../contexts/ProfileContext";
import dayjs from "dayjs";
import { SkillDTO, ReferenceDTO } from "../../types/profile";
import BasicDataForm from "./BasicDataForm";
import ExperienceForm from "./ExperienceForm";
import EducationForm from "./EducationForm";
import ProjectForm from "./ProjectForm";
import SkillsForm from "./SkillsForm";
import ReferencesForm from "./ReferencesForm";

const { Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

// Inline Editable Tab Label Component
interface EditableTabLabelProps {
  value: string;
  onSave: (val: string) => void;
  placeholder?: string;
}

function EditableTabLabel({ value, onSave, placeholder }: EditableTabLabelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  useEffect(() => {
    Promise.resolve().then(() => setTempValue(value));
  }, [value]);

  const handleBlur = () => {
    setIsEditing(false);
    if (tempValue.trim() && tempValue !== value) {
      onSave(tempValue.trim());
    } else {
      setTempValue(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleBlur();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setTempValue(value);
    }
  };

  if (isEditing) {
    return (
      <Input
        size="small"
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoFocus
        style={{ width: 120, height: 22, fontSize: 12 }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span 
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
      className="cursor-pointer select-none"
      title="Double-click to rename"
    >
      {value || placeholder || "Unnamed"}
    </span>
  );
}

// Save Status Badge Component
function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  if (status === "saving") {
    return (
      <span className="flex items-center gap-2 text-blue-400 text-xs font-medium bg-blue-950/40 border border-blue-900/50 px-2.5 py-1 rounded-full animate-pulse">
        <Badge status="processing" />
        <span>Saving changes...</span>
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="flex items-center gap-2 text-emerald-400 text-xs font-medium bg-emerald-950/40 border border-emerald-900/50 px-2.5 py-1 rounded-full">
        <CheckCircleOutlined className="text-emerald-400" />
        <span>Saved to cloud</span>
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-2 text-rose-400 text-xs font-medium bg-rose-950/40 border border-rose-900/50 px-2.5 py-1 rounded-full">
        <ExclamationCircleOutlined className="text-rose-400" />
        <span>Save failed</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-zinc-500 text-xs font-medium bg-zinc-900/40 border border-zinc-800/50 px-2.5 py-1 rounded-full">
      <CloudSyncOutlined />
      <span>Auto-saves active</span>
    </span>
  );
}

export default function ProfileTabs() {
  const {
    profile,
    loading,
    saveStatus,
    updateBasicDataState,
    addExperience,
    updateExperienceState,
    deleteExperience,
    addEducation,
    updateEducationState,
    deleteEducation,
    addProject,
    updateProjectState,
    deleteProject,
    updateSkillsState,
    updateReferencesState
  } = useProfileContext();

  const [form] = Form.useForm();

  useEffect(() => {
    if (profile?.basicData) {
      const formValues = form.getFieldsValue();
      const hasDiff = Object.keys(profile.basicData).some((key) => {
        const k = key as keyof typeof profile.basicData;
        if (k === "email") return false;
        return formValues[k] !== profile.basicData[k];
      });

      if (hasDiff) {
        form.setFieldsValue({
          firstName: profile.basicData.firstName,
          lastName: profile.basicData.lastName,
          phone: profile.basicData.phone,
          location: profile.basicData.location,
          linkedin: profile.basicData.linkedin,
          github: profile.basicData.github,
          website: profile.basicData.website,
          title: profile.basicData.title,
          summary: profile.basicData.summary,
        });
        form.validateFields().catch(() => {});
      }
    }
  }, [profile?.basicData, form]);

  // Experiences active tab sync
  const [activeExpTab, setActiveExpTab] = useState<string>();
  const prevExpLengthRef = useRef(0);
  useEffect(() => {
    if (profile) {
      const currentLength = profile.experiences.length;
      if (currentLength > prevExpLengthRef.current) {
        if (profile.experiences[0]) {
          Promise.resolve().then(() => setActiveExpTab(profile.experiences[0].id));
        }
      } else if (currentLength < prevExpLengthRef.current) {
        if (activeExpTab && !profile.experiences.some((e) => e.id === activeExpTab)) {
          Promise.resolve().then(() => setActiveExpTab(profile.experiences[0]?.id));
        }
      } else if (currentLength > 0 && !activeExpTab) {
        Promise.resolve().then(() => setActiveExpTab(profile.experiences[0].id));
      }
      prevExpLengthRef.current = currentLength;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.experiences, activeExpTab]);

  // Education active tab sync
  const [activeEduTab, setActiveEduTab] = useState<string>();
  const prevEduLengthRef = useRef(0);
  useEffect(() => {
    if (profile) {
      const currentLength = profile.education.length;
      if (currentLength > prevEduLengthRef.current) {
        if (profile.education[0]) {
          Promise.resolve().then(() => setActiveEduTab(profile.education[0].id));
        }
      } else if (currentLength < prevEduLengthRef.current) {
        if (activeEduTab && !profile.education.some((e) => e.id === activeEduTab)) {
          Promise.resolve().then(() => setActiveEduTab(profile.education[0]?.id));
        }
      } else if (currentLength > 0 && !activeEduTab) {
        Promise.resolve().then(() => setActiveEduTab(profile.education[0].id));
      }
      prevEduLengthRef.current = currentLength;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.education, activeEduTab]);

  // Projects active tab sync
  const [activeProjTab, setActiveProjTab] = useState<string>();
  const prevProjLengthRef = useRef(0);
  useEffect(() => {
    if (profile) {
      const currentLength = profile.projects.length;
      if (currentLength > prevProjLengthRef.current) {
        if (profile.projects[0]) {
          Promise.resolve().then(() => setActiveProjTab(profile.projects[0].id));
        }
      } else if (currentLength < prevProjLengthRef.current) {
        if (activeProjTab && !profile.projects.some((p) => p.id === activeProjTab)) {
          Promise.resolve().then(() => setActiveProjTab(profile.projects[0]?.id));
        }
      } else if (currentLength > 0 && !activeProjTab) {
        Promise.resolve().then(() => setActiveProjTab(profile.projects[0].id));
      }
      prevProjLengthRef.current = currentLength;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.projects, activeProjTab]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-zinc-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
        Loading profile data...
      </div>
    );
  }

  if (!profile) {
    return <div className="text-rose-400">No profile loaded.</div>;
  }

  const tabItems = [
    {
      key: "basic",
      label: "Basic Data",
      children: (
        <BasicDataForm
          basicData={profile.basicData}
          summaries={profile.summaries}
          updateBasicDataState={updateBasicDataState}
          form={form}
        />
      ),
    },
    {
      key: "experience",
      label: "Experience",
      children: (
        <ExperienceForm
          experiences={profile.experiences}
          addExperience={addExperience}
          updateExperienceState={updateExperienceState}
          deleteExperience={deleteExperience}
        />
      ),
    },
    {
      key: "education",
      label: "Education",
      children: (
        <EducationForm
          education={profile.education}
          addEducation={addEducation}
          updateEducationState={updateEducationState}
          deleteEducation={deleteEducation}
        />
      ),
    },
    {
      key: "projects",
      label: "Projects",
      children: (
        <ProjectForm
          projects={profile.projects}
          addProject={addProject}
          updateProjectState={updateProjectState}
          deleteProject={deleteProject}
        />
      ),
    },
    {
      key: "skills",
      label: "Skills",
      children: (
        <SkillsForm
          skills={profile.skills}
          updateSkillsState={updateSkillsState}
        />
      ),
    },
    {
      key: "references",
      label: "References",
      children: (
        <ReferencesForm
          references={profile.references}
          updateReferencesState={updateReferencesState}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Auto-save Status indicator */}
      <div className="flex justify-end pr-2">
        <SaveStatusIndicator status={saveStatus} />
      </div>

      <Tabs 
        defaultActiveKey="basic" 
        items={tabItems} 
        type="card"
        className="profile-tabs text-white"
      />
    </div>
  );
}
