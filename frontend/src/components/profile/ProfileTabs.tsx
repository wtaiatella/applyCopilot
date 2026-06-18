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

  // 1. Basic Data Form component
  const renderBasicDataForm = () => {
    return (
      <Card className="bg-zinc-900/50 border-zinc-800 text-white" title="Basic Information">
        <Form 
          form={form}
          layout="vertical" 
          onValuesChange={(changedValues) => {
            const cleanedValues: any = {};
            for (const key of Object.keys(changedValues)) {
              cleanedValues[key] = changedValues[key] === "" ? null : changedValues[key];
            }
            updateBasicDataState(cleanedValues);
          }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <Form.Item name="firstName" label={<span className="text-zinc-300">First Name</span>}>
            <Input 
              className="bg-zinc-950 border-zinc-800 text-white hover:border-zinc-700 focus:border-blue-500"
            />
          </Form.Item>
          <Form.Item name="lastName" label={<span className="text-zinc-300">Last Name</span>}>
            <Input 
              className="bg-zinc-950 border-zinc-800 text-white hover:border-zinc-700 focus:border-blue-500"
            />
          </Form.Item>
          <Form.Item name="phone" label={<span className="text-zinc-300">Phone Number</span>}>
            <Input 
              className="bg-zinc-950 border-zinc-800 text-white hover:border-zinc-700"
            />
          </Form.Item>
          <Form.Item name="location" label={<span className="text-zinc-300">Location</span>}>
            <Input 
              className="bg-zinc-950 border-zinc-800 text-white hover:border-zinc-700"
              placeholder="City, Country"
            />
          </Form.Item>
          <Form.Item 
            name="linkedin" 
            label={<span className="text-zinc-300">LinkedIn URL</span>}
            rules={[{ type: "url", warningOnly: true, message: "Invalid URL format" }]}
          >
            <Input 
              className="bg-zinc-950 border-zinc-800 text-white hover:border-zinc-700"
            />
          </Form.Item>
          <Form.Item 
            name="github" 
            label={<span className="text-zinc-300">GitHub URL</span>}
            rules={[{ type: "url", warningOnly: true, message: "Invalid URL format" }]}
          >
            <Input 
              className="bg-zinc-950 border-zinc-800 text-white hover:border-zinc-700"
            />
          </Form.Item>
          <Form.Item 
            name="website" 
            label={<span className="text-zinc-300">Website URL</span>}
            rules={[{ type: "url", warningOnly: true, message: "Invalid URL format" }]}
          >
            <Input 
              className="bg-zinc-950 border-zinc-800 text-white hover:border-zinc-700"
            />
          </Form.Item>
          <Form.Item name="title" label={<span className="text-zinc-300">Professional Title</span>}>
            <Input 
              className="bg-zinc-950 border-zinc-800 text-white hover:border-zinc-700"
              placeholder="e.g. Senior Software Engineer"
            />
          </Form.Item>
          <Form.Item name="summary" className="col-span-1 md:col-span-2" label={<span className="text-zinc-300">Professional Summary</span>}>
            <TextArea 
              rows={4}
              className="bg-zinc-950 border-zinc-800 text-white hover:border-zinc-700"
            />
          </Form.Item>
        </Form>
      </Card>
    );
  };

  // 2. Experiences component
  const renderExperiencesTab = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleEditExp = (targetKey: any, action: "add" | "remove") => {
      if (action === "add") {
        addExperience();
      } else if (action === "remove" && typeof targetKey === "string") {
        deleteExperience(targetKey);
      }
    };

    if (profile.experiences.length === 0) {
      return (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <Title level={4} className="!text-white !m-0">Work Experiences</Title>
            <Button type="primary" icon={<PlusOutlined />} onClick={addExperience}>
              Add Experience
            </Button>
          </div>
          <div className="text-center text-zinc-500 py-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-lg">
            No work experiences added yet. Click {"Add Experience"} to start.
          </div>
        </div>
      );
    }

    const subTabItems = profile.experiences.map((exp) => ({
      key: exp.id,
      label: (
        <EditableTabLabel
          value={exp.company || "New Experience"}
          onSave={(val) => updateExperienceState(exp.id, { company: val })}
        />
      ),
      children: (
        <Card 
          className="bg-zinc-900/50 border-zinc-800 text-white mt-2"
          title={<span className="text-white font-semibold">Edit Work Experience details</span>}
        >
          <Form layout="vertical" className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Item label={<span className="text-zinc-300">Company</span>}>
              <Input 
                value={exp.company} 
                onChange={(e) => updateExperienceState(exp.id, { company: e.target.value })}
                className="bg-zinc-950 border-zinc-800 text-white"
              />
            </Form.Item>
            <Form.Item label={<span className="text-zinc-300">Position</span>}>
              <Input 
                value={exp.position} 
                onChange={(e) => updateExperienceState(exp.id, { position: e.target.value })}
                className="bg-zinc-950 border-zinc-800 text-white"
              />
            </Form.Item>
            <Form.Item label={<span className="text-zinc-300">Start Date</span>}>
              <DatePicker 
                value={exp.startDate ? dayjs(exp.startDate) : null}
                onChange={(date) => updateExperienceState(exp.id, { startDate: date ? date.toISOString() : new Date().toISOString() })}
                className="w-full bg-zinc-950 border-zinc-800 text-white"
                picker="month"
              />
            </Form.Item>
            <Form.Item label={<span className="text-zinc-300">End Date</span>}>
              <DatePicker 
                value={exp.endDate ? dayjs(exp.endDate) : null}
                onChange={(date) => updateExperienceState(exp.id, { endDate: date ? date.toISOString() : null })}
                disabled={exp.current}
                className="w-full bg-zinc-950 border-zinc-800 text-white"
                picker="month"
              />
            </Form.Item>
            <Form.Item className="col-span-1 md:col-span-2">
              <Checkbox 
                checked={exp.current}
                onChange={(e) => updateExperienceState(exp.id, { current: e.target.checked, endDate: e.target.checked ? null : exp.endDate })}
                className="text-zinc-300"
              >
                I currently work here
              </Checkbox>
            </Form.Item>
            <Form.Item className="col-span-1 md:col-span-2" label={<span className="text-zinc-300">Freeform Context / Notes</span>}>
              <TextArea 
                rows={2}
                value={exp.freeFormContext || ""} 
                onChange={(e) => updateExperienceState(exp.id, { freeFormContext: e.target.value || null })}
                className="bg-zinc-950 border-zinc-800 text-white"
                placeholder="Enter any additional background notes or descriptions of this job."
              />
            </Form.Item>
          </Form>

          <Divider className="border-zinc-800" />
          <Title level={5} className="!text-zinc-300 mb-4">Highlights / Bullets</Title>
          
          <div className="space-y-3">
            {exp.bullets.map((b, bIdx) => (
              <div key={b.id} className="flex gap-2 items-center">
                <Input 
                  value={b.text}
                  onChange={(e) => {
                    const updatedBullets = [...exp.bullets];
                    updatedBullets[bIdx] = { ...b, text: e.target.value };
                    updateExperienceState(exp.id, { bullets: updatedBullets });
                  }}
                  className="bg-zinc-950 border-zinc-800 text-white flex-1"
                />
                
                {b.usedInCVs && b.usedInCVs.length > 0 && (
                  <Tooltip title={`Used in: ${b.usedInCVs.map(cv => cv.name).join(", ")}`}>
                    <Badge count={b.usedInCVs.length} style={{ backgroundColor: "#2563eb" }} />
                  </Tooltip>
                )}

                <Button 
                  type="text" 
                  danger 
                  icon={<MinusCircleOutlined />} 
                  onClick={() => {
                    const updatedBullets = exp.bullets.filter((bullet) => bullet.id !== b.id);
                    updateExperienceState(exp.id, { bullets: updatedBullets });
                  }}
                />
              </div>
            ))}
            
            <Button 
              type="dashed" 
              onClick={() => {
                const newBullet = {
                  id: "",
                  text: "New bullet point highlight",
                  isActive: true,
                  isArchived: false,
                  type: "BULLET" as const,
                  sortOrder: exp.bullets.length,
                  usedInCVs: []
                };
                updateExperienceState(exp.id, { bullets: [...exp.bullets, newBullet] });
              }} 
              icon={<PlusOutlined />}
              className="w-full text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700"
            >
              Add Bullet Point
            </Button>
          </div>
        </Card>
      )
    }));

    return (
      <div className="space-y-4">
        <Tabs
          type="editable-card"
          activeKey={activeExpTab}
          onChange={setActiveExpTab}
          onEdit={handleEditExp}
          items={subTabItems}
          className="profile-subtabs text-white"
        />
      </div>
    );
  };

  // 3. Education component
  const renderEducationTab = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleEditEdu = (targetKey: any, action: "add" | "remove") => {
      if (action === "add") {
        addEducation();
      } else if (action === "remove" && typeof targetKey === "string") {
        deleteEducation(targetKey);
      }
    };

    if (profile.education.length === 0) {
      return (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <Title level={4} className="!text-white !m-0">Education</Title>
            <Button type="primary" icon={<PlusOutlined />} onClick={addEducation}>
              Add Education
            </Button>
          </div>
          <div className="text-center text-zinc-500 py-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-lg">
            No education entries added yet. Click {"Add Education"} to start.
          </div>
        </div>
      );
    }

    const subTabItems = profile.education.map((edu) => ({
      key: edu.id,
      label: (
        <EditableTabLabel
          value={edu.institution || "New Institution"}
          onSave={(val) => updateEducationState(edu.id, { institution: val })}
        />
      ),
      children: (
        <Card 
          className="bg-zinc-900/50 border-zinc-800 text-white mt-2"
          title={<span className="text-white font-semibold">Edit Education details</span>}
        >
          <Form layout="vertical" className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Item label={<span className="text-zinc-300">Institution</span>}>
              <Input 
                value={edu.institution} 
                onChange={(e) => updateEducationState(edu.id, { institution: e.target.value })}
                className="bg-zinc-950 border-zinc-800 text-white"
              />
            </Form.Item>
            <Form.Item label={<span className="text-zinc-300">Degree</span>}>
              <Input 
                value={edu.degree} 
                onChange={(e) => updateEducationState(edu.id, { degree: e.target.value })}
                className="bg-zinc-950 border-zinc-800 text-white"
              />
            </Form.Item>
            <Form.Item label={<span className="text-zinc-300">Field of Study</span>}>
              <Input 
                value={edu.fieldOfStudy || ""} 
                onChange={(e) => updateEducationState(edu.id, { fieldOfStudy: e.target.value || null })}
                className="bg-zinc-950 border-zinc-800 text-white"
              />
            </Form.Item>
            <Form.Item label={<span className="text-zinc-300">Start Date</span>}>
              <DatePicker 
                value={edu.startDate ? dayjs(edu.startDate) : null}
                onChange={(date) => updateEducationState(edu.id, { startDate: date ? date.toISOString() : new Date().toISOString() })}
                className="w-full bg-zinc-950 border-zinc-800 text-white"
                picker="year"
              />
            </Form.Item>
            <Form.Item label={<span className="text-zinc-300">End Date</span>}>
              <DatePicker 
                value={edu.endDate ? dayjs(edu.endDate) : null}
                onChange={(date) => updateEducationState(edu.id, { endDate: date ? date.toISOString() : null })}
                disabled={edu.current || edu.hideEndDate}
                className="w-full bg-zinc-950 border-zinc-800 text-white"
                picker="year"
              />
            </Form.Item>
            <Form.Item className="col-span-1 md:col-span-2 flex gap-4">
              <Checkbox 
                checked={edu.current}
                onChange={(e) => updateEducationState(edu.id, { current: e.target.checked, endDate: e.target.checked ? null : edu.endDate })}
                className="text-zinc-300"
              >
                I currently study here
              </Checkbox>
              <Checkbox 
                checked={edu.hideEndDate}
                onChange={(e) => updateEducationState(edu.id, { hideEndDate: e.target.checked, endDate: e.target.checked ? null : edu.endDate })}
                className="text-zinc-300 ml-4"
              >
                Hide end date
              </Checkbox>
            </Form.Item>
            <Form.Item className="col-span-1 md:col-span-2" label={<span className="text-zinc-300">Freeform Context / Notes</span>}>
              <TextArea 
                rows={2}
                value={edu.freeFormContext || ""} 
                onChange={(e) => updateEducationState(edu.id, { freeFormContext: e.target.value || null })}
                className="bg-zinc-950 border-zinc-800 text-white"
              />
            </Form.Item>
          </Form>

          <Divider className="border-zinc-800" />
          <Title level={5} className="!text-zinc-300 mb-4">Highlights / Academic Bullets</Title>
          
          <div className="space-y-3">
            {edu.bullets.map((b, bIdx) => (
              <div key={b.id} className="flex gap-2 items-center">
                <Input 
                  value={b.text}
                  onChange={(e) => {
                    const updatedBullets = [...edu.bullets];
                    updatedBullets[bIdx] = { ...b, text: e.target.value };
                    updateEducationState(edu.id, { bullets: updatedBullets });
                  }}
                  className="bg-zinc-950 border-zinc-800 text-white flex-1"
                />
                <Button 
                  type="text" 
                  danger 
                  icon={<MinusCircleOutlined />} 
                  onClick={() => {
                    const updatedBullets = edu.bullets.filter((bullet) => bullet.id !== b.id);
                    updateEducationState(edu.id, { bullets: updatedBullets });
                  }}
                />
              </div>
            ))}
            
            <Button 
              type="dashed" 
              onClick={() => {
                const newBullet = {
                  id: "",
                  text: "New bullet point details",
                  isActive: true,
                  isArchived: false,
                  type: "BULLET" as const,
                  sortOrder: edu.bullets.length,
                  usedInCVs: []
                };
                updateEducationState(edu.id, { bullets: [...edu.bullets, newBullet] });
              }} 
              icon={<PlusOutlined />}
              className="w-full text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700"
            >
              Add Bullet Point
            </Button>
          </div>
        </Card>
      )
    }));

    return (
      <div className="space-y-4">
        <Tabs
          type="editable-card"
          activeKey={activeEduTab}
          onChange={setActiveEduTab}
          onEdit={handleEditEdu}
          items={subTabItems}
          className="profile-subtabs text-white"
        />
      </div>
    );
  };

  // 4. Projects component
  const renderProjectsTab = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleEditProj = (targetKey: any, action: "add" | "remove") => {
      if (action === "add") {
        addProject();
      } else if (action === "remove" && typeof targetKey === "string") {
        deleteProject(targetKey);
      }
    };

    if (profile.projects.length === 0) {
      return (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <Title level={4} className="!text-white !m-0">Projects</Title>
            <Button type="primary" icon={<PlusOutlined />} onClick={addProject}>
              Add Project
            </Button>
          </div>
          <div className="text-center text-zinc-500 py-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-lg">
            No projects added yet. Click {"Add Project"} to start.
          </div>
        </div>
      );
    }

    const subTabItems = profile.projects.map((proj) => ({
      key: proj.id,
      label: (
        <EditableTabLabel
          value={proj.name || "New Project"}
          onSave={(val) => updateProjectState(proj.id, { name: val })}
        />
      ),
      children: (
        <Card 
          className="bg-zinc-900/50 border-zinc-800 text-white mt-2"
          title={<span className="text-white font-semibold">Edit Project details</span>}
        >
          <Form layout="vertical" className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Item label={<span className="text-zinc-300">Project Name</span>}>
              <Input 
                value={proj.name} 
                onChange={(e) => updateProjectState(proj.id, { name: e.target.value })}
                className="bg-zinc-950 border-zinc-800 text-white"
              />
            </Form.Item>
            <Form.Item label={<span className="text-zinc-300">Technologies (comma separated)</span>}>
              <Select
                mode="tags"
                value={proj.technologies}
                onChange={(tags) => updateProjectState(proj.id, { technologies: tags })}
                className="w-full bg-zinc-950 border-zinc-800 text-white"
                placeholder="e.g. Next.js, Rust, Docker"
              />
            </Form.Item>
            <Form.Item label={<span className="text-zinc-300">Start Date</span>}>
              <DatePicker 
                value={proj.startDate ? dayjs(proj.startDate) : null}
                onChange={(date) => updateProjectState(proj.id, { startDate: date ? date.toISOString() : null })}
                className="w-full bg-zinc-950 border-zinc-800 text-white"
                picker="month"
              />
            </Form.Item>
            <Form.Item label={<span className="text-zinc-300">End Date</span>}>
              <DatePicker 
                value={proj.endDate ? dayjs(proj.endDate) : null}
                onChange={(date) => updateProjectState(proj.id, { endDate: date ? date.toISOString() : null })}
                disabled={proj.current}
                className="w-full bg-zinc-950 border-zinc-800 text-white"
                picker="month"
              />
            </Form.Item>
            <Form.Item className="col-span-1 md:col-span-2">
              <Checkbox 
                checked={proj.current}
                onChange={(e) => updateProjectState(proj.id, { current: e.target.checked, endDate: e.target.checked ? null : proj.endDate })}
                className="text-zinc-300"
              >
                I currently work on this project
              </Checkbox>
            </Form.Item>
            <Form.Item className="col-span-1 md:col-span-2" label={<span className="text-zinc-300">Freeform Context / Notes</span>}>
              <TextArea 
                rows={2}
                value={proj.freeFormContext || ""} 
                onChange={(e) => updateProjectState(proj.id, { freeFormContext: e.target.value || null })}
                className="bg-zinc-950 border-zinc-800 text-white"
              />
            </Form.Item>
          </Form>

          <Divider className="border-zinc-800" />
          <Title level={5} className="!text-zinc-300 mb-4">Highlights / Details</Title>
          
          <div className="space-y-3">
            {proj.bullets.map((b, bIdx) => (
              <div key={b.id} className="flex gap-2 items-center">
                <Input 
                  value={b.text}
                  onChange={(e) => {
                    const updatedBullets = [...proj.bullets];
                    updatedBullets[bIdx] = { ...b, text: e.target.value };
                    updateProjectState(proj.id, { bullets: updatedBullets });
                  }}
                  className="bg-zinc-950 border-zinc-800 text-white flex-1"
                />
                <Button 
                  type="text" 
                  danger 
                  icon={<MinusCircleOutlined />} 
                  onClick={() => {
                    const updatedBullets = proj.bullets.filter((bullet) => bullet.id !== b.id);
                    updateProjectState(proj.id, { bullets: updatedBullets });
                  }}
                />
              </div>
            ))}
            
            <Button 
              type="dashed" 
              onClick={() => {
                const newBullet = {
                  id: "",
                  text: "New project detail bullet",
                  isActive: true,
                  isArchived: false,
                  type: "BULLET" as const,
                  sortOrder: proj.bullets.length,
                  usedInCVs: []
                };
                updateProjectState(proj.id, { bullets: [...proj.bullets, newBullet] });
              }} 
              icon={<PlusOutlined />}
              className="w-full text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700"
            >
              Add Bullet Point
            </Button>
          </div>
        </Card>
      )
    }));

    return (
      <div className="space-y-4">
        <Tabs
          type="editable-card"
          activeKey={activeProjTab}
          onChange={setActiveProjTab}
          onEdit={handleEditProj}
          items={subTabItems}
          className="profile-subtabs text-white"
        />
      </div>
    );
  };

  // 5. Skills component
  const renderSkillsTab = () => {
    const { skills } = profile;

    const handleAddSkill = () => {
      const newSkill: SkillDTO = {
        id: `temp_${Date.now()}`,
        name: "New Skill",
        proficiency: "INTERMEDIATE",
        yearsExperience: null,
      };
      updateSkillsState([...skills, newSkill]);
    };

    const handleRemoveSkill = (id: string) => {
      updateSkillsState(skills.filter((s) => s.id !== id));
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleUpdateSkill = (id: string, field: keyof SkillDTO, val: any) => {
      const updated = skills.map((s) => {
        if (s.id === id) {
          return { ...s, [field]: val };
        }
        return s;
      });
      updateSkillsState(updated);
    };

    return (
      <Card className="bg-zinc-900/50 border-zinc-800 text-white" title="Technical Skills">
        <div className="space-y-4">
          {skills.length === 0 ? (
            <div className="text-zinc-500 py-6 text-center">No skills added yet.</div>
          ) : (
            skills.map((s) => (
              <div key={s.id} className="flex flex-wrap md:flex-nowrap gap-3 items-center bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                <Input 
                  value={s.name} 
                  onChange={(e) => handleUpdateSkill(s.id, "name", e.target.value)}
                  placeholder="Skill Name (e.g. JavaScript)"
                  className="bg-zinc-900 border-zinc-800 text-white flex-1"
                />
                <Select
                  value={s.proficiency}
                  onChange={(val) => handleUpdateSkill(s.id, "proficiency", val)}
                  className="w-40 bg-zinc-900 border-zinc-800 text-white"
                >
                  <Option value="BEGINNER">Beginner</Option>
                  <Option value="INTERMEDIATE">Intermediate</Option>
                  <Option value="ADVANCED">Advanced</Option>
                  <Option value="EXPERT">Expert</Option>
                </Select>
                <InputNumber
                  min={0}
                  max={50}
                  value={s.yearsExperience ?? undefined}
                  onChange={(val) => handleUpdateSkill(s.id, "yearsExperience", val)}
                  placeholder="Years Exp"
                  className="w-32 bg-zinc-900 border-zinc-800 text-white"
                />
                <Button 
                  type="text" 
                  danger 
                  icon={<DeleteOutlined />} 
                  onClick={() => handleRemoveSkill(s.id)}
                />
              </div>
            ))
          )}
          <Button type="dashed" onClick={handleAddSkill} icon={<PlusOutlined />} className="w-full text-zinc-400 border-zinc-800 hover:text-white">
            Add Skill Row
          </Button>
        </div>
      </Card>
    );
  };

  // 6. References component
  const renderReferencesTab = () => {
    const { references } = profile;

    const handleAddRef = () => {
      const newRef: ReferenceDTO = {
        id: `temp_${Date.now()}`,
        name: "Reference Name",
        company: "",
        relationship: "",
        email: "",
        phone: "",
        canContact: false,
      };
      updateReferencesState([...references, newRef]);
    };

    const handleRemoveRef = (id: string) => {
      updateReferencesState(references.filter((r) => r.id !== id));
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleUpdateRef = (id: string, field: keyof ReferenceDTO, val: any) => {
      const updated = references.map((r) => {
        if (r.id === id) {
          return { ...r, [field]: val };
        }
        return r;
      });
      updateReferencesState(updated);
    };

    return (
      <Card className="bg-zinc-900/50 border-zinc-800 text-white" title="References">
        <div className="space-y-6">
          {references.length === 0 ? (
            <div className="text-zinc-500 py-6 text-center">No references added yet.</div>
          ) : (
            references.map((r) => (
              <Card key={r.id} className="bg-zinc-950 border-zinc-800 text-white" size="small">
                <Form layout="vertical" className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Form.Item label={<span className="text-zinc-400">Name</span>}>
                    <Input 
                      value={r.name} 
                      onChange={(e) => handleUpdateRef(r.id, "name", e.target.value)}
                      className="bg-zinc-900 border-zinc-800 text-white"
                    />
                  </Form.Item>
                  <Form.Item label={<span className="text-zinc-400">Company</span>}>
                    <Input 
                      value={r.company || ""} 
                      onChange={(e) => handleUpdateRef(r.id, "company", e.target.value || null)}
                      className="bg-zinc-900 border-zinc-800 text-white"
                    />
                  </Form.Item>
                  <Form.Item label={<span className="text-zinc-400">Relationship</span>}>
                    <Input 
                      value={r.relationship || ""} 
                      onChange={(e) => handleUpdateRef(r.id, "relationship", e.target.value || null)}
                      className="bg-zinc-900 border-zinc-800 text-white"
                    />
                  </Form.Item>
                  <Form.Item label={<span className="text-zinc-400">Email</span>}>
                    <Input 
                      value={r.email || ""} 
                      onChange={(e) => handleUpdateRef(r.id, "email", e.target.value || null)}
                      className="bg-zinc-900 border-zinc-800 text-white"
                    />
                  </Form.Item>
                  <Form.Item label={<span className="text-zinc-400">Phone</span>}>
                    <Input 
                      value={r.phone || ""} 
                      onChange={(e) => handleUpdateRef(r.id, "phone", e.target.value || null)}
                      className="bg-zinc-900 border-zinc-800 text-white"
                    />
                  </Form.Item>
                  <Form.Item className="md:col-span-2">
                    <div className="flex justify-between items-center">
                      <Checkbox 
                        checked={r.canContact}
                        onChange={(e) => handleUpdateRef(r.id, "canContact", e.target.checked)}
                        className="text-zinc-300"
                      >
                        Employers may contact this reference directly
                      </Checkbox>
                      <Button 
                        type="text" 
                        danger 
                        icon={<DeleteOutlined />} 
                        onClick={() => handleRemoveRef(r.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </Form.Item>
                </Form>
              </Card>
            ))
          )}
          <Button type="dashed" onClick={handleAddRef} icon={<PlusOutlined />} className="w-full text-zinc-400 border-zinc-800 hover:text-white">
            Add Reference
          </Button>
        </div>
      </Card>
    );
  };

  const tabItems = [
    {
      key: "basic",
      label: "Basic Data",
      children: renderBasicDataForm(),
    },
    {
      key: "experience",
      label: "Experience",
      children: renderExperiencesTab(),
    },
    {
      key: "education",
      label: "Education",
      children: renderEducationTab(),
    },
    {
      key: "projects",
      label: "Projects",
      children: renderProjectsTab(),
    },
    {
      key: "skills",
      label: "Skills",
      children: renderSkillsTab(),
    },
    {
      key: "references",
      label: "References",
      children: renderReferencesTab(),
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
