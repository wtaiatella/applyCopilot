"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, Form, Input, Button, DatePicker, Checkbox, Switch, Tooltip, Tabs, Typography } from "antd";
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
import { ExperienceDTO, BulletDTO } from "../../types/profile";

const { Title } = Typography;
const { TextArea } = Input;

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
      {value || "New Experience"}
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

// 3. Experience Form component
interface ExperienceFormProps {
  experiences: ExperienceDTO[];
  addExperience: () => Promise<void>;
  updateExperienceState: (id: string, data: Partial<ExperienceDTO>) => void;
  deleteExperience: (id: string) => Promise<void>;
}

export default function ExperienceForm({
  experiences = [],
  addExperience,
  updateExperienceState,
  deleteExperience,
}: ExperienceFormProps) {
  const [activeTab, setActiveTab] = useState<string>();
  const [newBulletText, setNewBulletText] = useState<{ [expId: string]: string }>({});
  const prevLengthRef = useRef(0);

  // Sync active tab when a new experience is created
  useEffect(() => {
    const currentLength = experiences.length;
    if (currentLength > prevLengthRef.current) {
      if (experiences[0]) {
        setActiveTab(experiences[0].id);
      }
    } else if (currentLength < prevLengthRef.current) {
      if (activeTab && !experiences.some((e) => e.id === activeTab)) {
        setActiveTab(experiences[0]?.id);
      }
    } else if (currentLength > 0 && !activeTab) {
      setActiveTab(experiences[0].id);
    }
    prevLengthRef.current = currentLength;
  }, [experiences, activeTab]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleEditTabs = (targetKey: any, action: "add" | "remove") => {
    if (action === "add") {
      addExperience();
    } else if (action === "remove" && typeof targetKey === "string") {
      deleteExperience(targetKey);
    }
  };

  const handleBulletDragEnd = (expId: string, event: DragEndEvent) => {
    const { active, over } = event;
    const exp = experiences.find((e) => e.id === expId);
    if (!exp) return;
    
    if (over && active.id !== over.id) {
      const oldIndex = exp.bullets.findIndex((b) => b.id === active.id);
      const newIndex = exp.bullets.findIndex((b) => b.id === over.id);
      const reorderedBullets = arrayMove(exp.bullets, oldIndex, newIndex).map((b, idx) => ({
        ...b,
        sortOrder: idx,
      }));
      updateExperienceState(expId, { bullets: reorderedBullets });
    }
  };

  const handleUpdateBullet = (expId: string, bulletId: string, data: Partial<BulletDTO>) => {
    const exp = experiences.find((e) => e.id === expId);
    if (!exp) return;
    const updatedBullets = exp.bullets.map((b) => {
      if (b.id === bulletId) {
        return { ...b, ...data };
      }
      return b;
    });
    updateExperienceState(expId, { bullets: updatedBullets });
  };

  const handleDeleteBullet = (expId: string, bulletId: string) => {
    const exp = experiences.find((e) => e.id === expId);
    if (!exp) return;
    const updatedBullets = exp.bullets.filter((b) => b.id !== bulletId);
    updateExperienceState(expId, { bullets: updatedBullets });
  };

  const handleAddBullet = (expId: string) => {
    const text = newBulletText[expId] || "";
    if (!text.trim()) return;

    const exp = experiences.find((e) => e.id === expId);
    if (!exp) return;
    
    const newBullet: BulletDTO = {
      id: `temp-${Date.now()}`,
      text: text.trim(),
      isActive: true,
      isArchived: false,
      type: "BULLET",
      sortOrder: exp.bullets.length,
      usedInCVs: [],
    };

    updateExperienceState(expId, { bullets: [...exp.bullets, newBullet] });
    setNewBulletText({ ...newBulletText, [expId]: "" });
  };

  if (experiences.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Title level={4} className="!text-white !m-0">Work Experience</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={addExperience}>
            Add Experience
          </Button>
        </div>
        <div className="text-center text-zinc-500 py-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-lg">
          No work experiences added yet. Click "Add Experience" to start.
        </div>
      </div>
    );
  }

  const tabItems = experiences.map((exp) => ({
    key: exp.id,
    label: (
      <EditableTabLabel
        value={exp.company}
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
            />
          </Form.Item>
          
          <Form.Item label={<span className="text-zinc-300">End Date</span>}>
            <DatePicker 
              value={exp.endDate ? dayjs(exp.endDate) : null}
              disabled={exp.current}
              onChange={(date) => updateExperienceState(exp.id, { endDate: date ? date.toISOString() : null })}
              className="w-full bg-zinc-950 border-zinc-800 text-white"
            />
          </Form.Item>
          
          <Form.Item className="col-span-1 md:col-span-2">
            <Checkbox 
              checked={exp.current} 
              onChange={(e) => {
                const checked = e.target.checked;
                updateExperienceState(exp.id, { 
                  current: checked,
                  endDate: checked ? null : exp.endDate 
                });
              }}
              className="text-zinc-300"
            >
              I currently work here
            </Checkbox>
          </Form.Item>

          <Form.Item className="col-span-1 md:col-span-2" label={<span className="text-zinc-300">Context / Highlights</span>}>
            <TextArea 
              rows={3}
              value={exp.freeFormContext || ""} 
              onChange={(e) => updateExperienceState(exp.id, { freeFormContext: e.target.value || null })}
              placeholder="Add optional notes, department information, or overall goals..."
              className="bg-zinc-950 border-zinc-800 text-white"
            />
          </Form.Item>
        </Form>

        <Divider className="border-zinc-800 my-6" />

        <div className="space-y-4">
          <span className="text-white font-semibold block text-sm">Key Achievements & Responsibilities</span>
          
          <div className="flex gap-2">
            <Input
              value={newBulletText[exp.id] || ""}
              onChange={(e) => setNewBulletText({ ...newBulletText, [exp.id]: e.target.value })}
              onPressEnter={() => handleAddBullet(exp.id)}
              placeholder="Add a new responsibility or achievement bullet..."
              className="bg-zinc-950 border-zinc-800 text-white"
            />
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={() => handleAddBullet(exp.id)}
              className="bg-blue-600 border-blue-600 hover:bg-blue-500"
            >
              Add
            </Button>
          </div>

          {exp.bullets.length === 0 ? (
            <div className="text-center text-zinc-600 py-4 bg-zinc-950/20 border border-dashed border-zinc-800 rounded text-xs">
              No bullets added. Type above to add achievements.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(evt) => handleBulletDragEnd(exp.id, evt)}
            >
              <SortableContext
                items={exp.bullets.map((b) => b.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {exp.bullets.map((b) => (
                    <SortableBulletItem
                      key={b.id}
                      bullet={b}
                      onUpdate={(bId, data) => handleUpdateBullet(exp.id, bId, data)}
                      onDelete={(bId) => handleDeleteBullet(exp.id, bId)}
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
        <Title level={4} className="!text-white !m-0">Work Experiences</Title>
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
