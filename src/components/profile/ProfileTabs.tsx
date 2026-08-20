"use client";

import React, { useState, useEffect, useRef } from "react";
import { Tabs, Form, Button, Tooltip, Badge, notification } from "antd";
import {
  CloudSyncOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { useProfileContext, SaveStatus } from "../../contexts/ProfileContext";
import dayjs from "dayjs";
import BasicDataForm from "./BasicDataForm";
import ExperienceForm from "./ExperienceForm";
import EducationForm from "./EducationForm";
import ProjectForm from "./ProjectForm";
import SkillsForm from "./SkillsForm";
import ReferencesForm from "./ReferencesForm";
import PreferencesForm from "./PreferencesForm";

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
    updateReferencesState,
    syncProfile,
    isSyncOutOfDate,
  } = useProfileContext();

  const [form] = Form.useForm();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncProfile();
      notification.success({
        message: "AI Profile Synced",
        description:
          "Your profile details have been consolidated, cleaned, and vectorized for semantic matching successfully.",
        placement: "topRight",
      });
    } catch (err) {
      notification.error({
        message: "Synchronization Failed",
        description:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred while syncing your profile.",
        placement: "topRight",
      });
    } finally {
      setIsSyncing(false);
    }
  };

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
  }, [profile, form]);

  // Experiences active tab sync
  const [activeExpTab, setActiveExpTab] = useState<string>();
  const prevExpLengthRef = useRef(0);
  useEffect(() => {
    if (profile) {
      const currentLength = profile.experiences.length;
      if (currentLength > prevExpLengthRef.current) {
        if (profile.experiences[0]) {
          Promise.resolve().then(() =>
            setActiveExpTab(profile.experiences[0].id),
          );
        }
      } else if (currentLength < prevExpLengthRef.current) {
        if (
          activeExpTab &&
          !profile.experiences.some((e) => e.id === activeExpTab)
        ) {
          Promise.resolve().then(() =>
            setActiveExpTab(profile.experiences[0]?.id),
          );
        }
      } else if (currentLength > 0 && !activeExpTab) {
        Promise.resolve().then(() =>
          setActiveExpTab(profile.experiences[0].id),
        );
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
          Promise.resolve().then(() =>
            setActiveEduTab(profile.education[0].id),
          );
        }
      } else if (currentLength < prevEduLengthRef.current) {
        if (
          activeEduTab &&
          !profile.education.some((e) => e.id === activeEduTab)
        ) {
          Promise.resolve().then(() =>
            setActiveEduTab(profile.education[0]?.id),
          );
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
          Promise.resolve().then(() =>
            setActiveProjTab(profile.projects[0].id),
          );
        }
      } else if (currentLength < prevProjLengthRef.current) {
        if (
          activeProjTab &&
          !profile.projects.some((p) => p.id === activeProjTab)
        ) {
          Promise.resolve().then(() =>
            setActiveProjTab(profile.projects[0]?.id),
          );
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
    {
      key: "preferences",
      label: "Preferences",
      children: <PreferencesForm />,
    },
  ];

  const getSyncStatus = () => {
    if (!profile.embeddingSyncedAt) {
      return {
        status: "default" as const,
        text: "IA Profile Not Synced",
        tooltip:
          "Your profile has not been vectorized. Sync with AI to enable smart job matching.",
        color: "text-zinc-400 bg-zinc-950/40 border-zinc-800/50",
      };
    }
    if (isSyncOutOfDate) {
      return {
        status: "warning" as const,
        text: "IA Profile Out of Date",
        tooltip:
          "You modified your profile since the last sync. Re-sync recommended to update job rankings.",
        color: "text-amber-400 bg-amber-950/40 border-amber-900/50",
      };
    }
    return {
      status: "success" as const,
      text: "IA Profile Synced",
      tooltip: "Your profile vector embedding is fully up to date.",
      color: "text-emerald-400 bg-emerald-950/40 border-emerald-900/50",
    };
  };

  const syncConfig = getSyncStatus();

  return (
    <div className="space-y-4">
      {/* Top Controls Bar: AI Sync & Auto-save Status */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-900/50 border border-zinc-800/80 p-4 rounded-xl">
        <div className="flex flex-wrap items-center gap-4">
          <Tooltip title={syncConfig.tooltip}>
            <span
              className={`flex items-center gap-2 text-xs font-medium border px-3 py-1.5 rounded-full ${syncConfig.color}`}
            >
              <Badge status={syncConfig.status} />
              <span>{syncConfig.text}</span>
            </span>
          </Tooltip>

          {profile.embeddingSyncedAt && (
            <span className="text-zinc-500 text-xs" suppressHydrationWarning>
              Last Synced:{" "}
              {dayjs(profile.embeddingSyncedAt).format("DD/MM/YYYY HH:mm")}
            </span>
          )}

          <Button
            type="primary"
            icon={<CloudSyncOutlined />}
            onClick={handleSync}
            loading={isSyncing}
            className="bg-blue-600 hover:bg-blue-500 border-none rounded-lg text-xs h-8 flex items-center"
          >
            Sync with AI
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <SaveStatusIndicator status={saveStatus} />
        </div>
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
