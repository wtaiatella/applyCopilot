"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, Form, Input, Button, DatePicker, Checkbox, Switch, Tooltip, Tabs, Typography, Divider, Select } from "antd";
import { 
  PlusOutlined, 
  DeleteOutlined, 
  MenuOutlined 
} from "@ant-design/icons";
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors, 
  DragEndEvent 
} from "@dnd-kit/core";
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy, 
  useSortable 
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import dayjs from "dayjs";
import { ProjectDTO, BulletDTO } from "../../types/profile";

const { Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

// 1. Editable Tab Label component
interface EditableTabLabelProps {
  value: string;
  onSave: (val: string) => void;
}

function EditableTabLabel({ value, onSave }: EditableTabLabelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  useEffect(() => {
    setTempValue(value);
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
      {value || "New Project"}
    </span>
  );
}

// 2. Sortable Bullet Item component
interface SortableBulletItemProps {
  bullet: BulletDTO;
  onUpdate: (bulletId: string, data: Partial<BulletDTO>) => void;
  onDelete: (bulletId: string) => void;
}

function SortableBulletItem({ bullet, onUpdate, onDelete }: SortableBulletItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bullet.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : undefined,
  };

  const isUsed = bullet.usedInCVs && bullet.usedInCVs.length > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 p-2 bg-zinc-950/40 border border-zinc-800 rounded-md transition-colors ${
        !bullet.isActive ? "opacity-60 border-dashed" : ""
      }`}
    >
      <div {...attributes} {...listeners} className="mt-2 cursor-grab text-zinc-500 hover:text-zinc-300">
        <MenuOutlined />
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <Input
          value={bullet.text}
          onChange={(e) => onUpdate(bullet.id, { text: e.target.value })}
          className="bg-transparent border-none text-white focus:bg-zinc-900 focus:border-zinc-800 text-sm py-1 px-1.5 w-full"
          placeholder="Edit bullet point..."
        />
        {isUsed && (
          <div className="pl-1.5">
            <span className="text-[10px] bg-blue-900/30 text-blue-300 border border-blue-800/40 px-1.5 py-0.5 rounded font-medium">
              Used in: {bullet.usedInCVs.map((c) => c.name).join(", ")}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 self-start pt-1.5">
        <Tooltip title={bullet.isActive ? "Active in CV" : "Inactive"}>
          <Switch
            checked={bullet.isActive}
            onChange={(checked) => onUpdate(bullet.id, { isActive: checked })}
            size="small"
          />
        </Tooltip>
        
        {isUsed ? (
          <Tooltip title="This bullet is used in a CV. Toggle 'Active' to hide/show, or edit it.">
            <Button
              type="text"
              danger
              disabled
              icon={<DeleteOutlined />}
              size="small"
            />
          </Tooltip>
        ) : (
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => onDelete(bullet.id)}
            size="small"
            className="hover:bg-zinc-900"
          />
        )}
      </div>
    </div>
  );
}

// 3. Project Form component
interface ProjectFormProps {
  projects: ProjectDTO[];
  addProject: () => Promise<void>;
  updateProjectState: (id: string, data: Partial<ProjectDTO>) => void;
  deleteProject: (id: string) => Promise<void>;
}

export default function ProjectForm({
  projects = [],
  addProject,
  updateProjectState,
  deleteProject,
}: ProjectFormProps) {
  const [activeTab, setActiveTab] = useState<string>();
  const [newBulletText, setNewBulletText] = useState<{ [projId: string]: string }>({});
  const prevLengthRef = useRef(0);

  // Sync active tab when a new project is created
  useEffect(() => {
    const currentLength = projects.length;
    if (currentLength > prevLengthRef.current) {
      if (projects[0]) {
        setActiveTab(projects[0].id);
      }
    } else if (currentLength < prevLengthRef.current) {
      if (activeTab && !projects.some((e) => e.id === activeTab)) {
        setActiveTab(projects[0]?.id);
      }
    } else if (currentLength > 0 && !activeTab) {
      setActiveTab(projects[0].id);
    }
    prevLengthRef.current = currentLength;
  }, [projects, activeTab]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleEditTabs = (targetKey: any, action: "add" | "remove") => {
    if (action === "add") {
      addProject();
    } else if (action === "remove" && typeof targetKey === "string") {
      deleteProject(targetKey);
    }
  };

  const handleBulletDragEnd = (projId: string, event: DragEndEvent) => {
    const { active, over } = event;
    const proj = projects.find((e) => e.id === projId);
    if (!proj) return;
    
    if (over && active.id !== over.id) {
      const oldIndex = proj.bullets.findIndex((b) => b.id === active.id);
      const newIndex = proj.bullets.findIndex((b) => b.id === over.id);
      const reorderedBullets = arrayMove(proj.bullets, oldIndex, newIndex).map((b, idx) => ({
        ...b,
        sortOrder: idx,
      }));
      updateProjectState(projId, { bullets: reorderedBullets });
    }
  };

  const handleUpdateBullet = (projId: string, bulletId: string, data: Partial<BulletDTO>) => {
    const proj = projects.find((e) => e.id === projId);
    if (!proj) return;
    const updatedBullets = proj.bullets.map((b) => {
      if (b.id === bulletId) {
        return { ...b, ...data };
      }
      return b;
    });
    updateProjectState(projId, { bullets: updatedBullets });
  };

  const handleDeleteBullet = (projId: string, bulletId: string) => {
    const proj = projects.find((e) => e.id === projId);
    if (!proj) return;
    const updatedBullets = proj.bullets.filter((b) => b.id !== bulletId);
    updateProjectState(projId, { bullets: updatedBullets });
  };

  const handleAddBullet = (projId: string) => {
    const text = newBulletText[projId] || "";
    if (!text.trim()) return;

    const proj = projects.find((e) => e.id === projId);
    if (!proj) return;
    
    const newBullet: BulletDTO = {
      id: `temp-${Date.now()}`,
      text: text.trim(),
      isActive: true,
      isArchived: false,
      type: "BULLET",
      sortOrder: proj.bullets.length,
      usedInCVs: [],
    };

    updateProjectState(projId, { bullets: [...proj.bullets, newBullet] });
    setNewBulletText({ ...newBulletText, [projId]: "" });
  };

  if (projects.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Title level={4} className="!text-white !m-0">Projects</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={addProject}>
            Add Project
          </Button>
        </div>
        <div className="text-center text-zinc-500 py-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-lg">
          No projects added yet. Click "Add Project" to start.
        </div>
      </div>
    );
  }

  const tabItems = projects.map((proj) => ({
    key: proj.id,
    label: (
      <EditableTabLabel
        value={proj.name}
        onSave={(val) => updateProjectState(proj.id, { name: val })}
      />
    ),
    children: (
      <Card 
        className="bg-zinc-900/50 border-zinc-800 text-white mt-2"
        title={<span className="text-white font-semibold">Edit Project details</span>}
      >
        <Form layout="vertical" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Form.Item label={<span className="text-zinc-300">Project Name</span>} className="col-span-1 md:col-span-2">
            <Input 
              value={proj.name} 
              onChange={(e) => updateProjectState(proj.id, { name: e.target.value })}
              className="bg-zinc-950 border-zinc-800 text-white"
            />
          </Form.Item>
          
          <Form.Item label={<span className="text-zinc-300">Start Date</span>}>
            <DatePicker 
              value={proj.startDate ? dayjs(proj.startDate) : null}
              onChange={(date) => updateProjectState(proj.id, { startDate: date ? date.toISOString() : null })}
              className="w-full bg-zinc-950 border-zinc-800 text-white"
            />
          </Form.Item>
          
          <Form.Item label={<span className="text-zinc-300">End Date</span>}>
            <DatePicker 
              value={proj.endDate ? dayjs(proj.endDate) : null}
              disabled={proj.current}
              onChange={(date) => updateProjectState(proj.id, { endDate: date ? date.toISOString() : null })}
              className="w-full bg-zinc-950 border-zinc-800 text-white"
            />
          </Form.Item>
          
          <Form.Item className="col-span-1 md:col-span-2">
            <Checkbox 
              checked={proj.current} 
              onChange={(e) => {
                const checked = e.target.checked;
                updateProjectState(proj.id, { 
                  current: checked,
                  endDate: checked ? null : proj.endDate 
                });
              }}
              className="text-zinc-300"
            >
              This project is currently ongoing
            </Checkbox>
          </Form.Item>

          <Form.Item label={<span className="text-zinc-300">Technologies (Tag Selector)</span>} className="col-span-1 md:col-span-2">
            <Select
              mode="tags"
              style={{ width: "100%" }}
              placeholder="Select or type technologies used"
              value={proj.technologies}
              onChange={(techs) => updateProjectState(proj.id, { technologies: techs })}
              className="bg-zinc-950 border-zinc-800 text-white"
              popupClassName="bg-zinc-900 border-zinc-800"
            >
              {proj.technologies.map((t) => (
                <Option key={t} value={t}>{t}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item className="col-span-1 md:col-span-2" label={<span className="text-zinc-300">Context / Description</span>}>
            <TextArea 
              rows={3}
              value={proj.freeFormContext || ""} 
              onChange={(e) => updateProjectState(proj.id, { freeFormContext: e.target.value || null })}
              placeholder="Add optional notes, repository links, or project context..."
              className="bg-zinc-950 border-zinc-800 text-white"
            />
          </Form.Item>
        </Form>

        <Divider className="border-zinc-800 my-6" />

        <div className="space-y-4">
          <span className="text-white font-semibold block text-sm">Project Contributions & Accomplishments</span>
          
          <div className="flex gap-2">
            <Input
              value={newBulletText[proj.id] || ""}
              onChange={(e) => setNewBulletText({ ...newBulletText, [proj.id]: e.target.value })}
              onPressEnter={() => handleAddBullet(proj.id)}
              placeholder="Add a contribution highlight..."
              className="bg-zinc-950 border-zinc-800 text-white"
            />
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={() => handleAddBullet(proj.id)}
              className="bg-blue-600 border-blue-600 hover:bg-blue-500"
            >
              Add
            </Button>
          </div>

          {proj.bullets.length === 0 ? (
            <div className="text-center text-zinc-600 py-4 bg-zinc-950/20 border border-dashed border-zinc-800 rounded text-xs">
              No project highlights added. Type above to add contributions.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(evt) => handleBulletDragEnd(proj.id, evt)}
            >
              <SortableContext
                items={proj.bullets.map((b) => b.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {proj.bullets.map((b) => (
                    <SortableBulletItem
                      key={b.id}
                      bullet={b}
                      onUpdate={(bId, data) => handleUpdateBullet(proj.id, bId, data)}
                      onDelete={(bId) => handleDeleteBullet(proj.id, bId)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </Card>
    ),
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center pr-2">
        <Title level={4} className="!text-white !m-0">Projects</Title>
      </div>

      <Tabs
        type="editable-card"
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key)}
        onEdit={handleEditTabs}
        items={tabItems}
        className="profile-subtabs"
      />
    </div>
  );
}
