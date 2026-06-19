"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, Form, Input, Button, DatePicker, Checkbox, Switch, Tooltip, Tabs, Typography, Divider } from "antd";
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
import { EducationDTO, BulletDTO } from "../../types/profile";

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
      {value || "New Education"}
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
              size="small/>"
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

// 3. Education Form component
interface EducationFormProps {
  education: EducationDTO[];
  addEducation: () => Promise<void>;
  updateEducationState: (id: string, data: Partial<EducationDTO>) => void;
  deleteEducation: (id: string) => Promise<void>;
}

export default function EducationForm({
  education = [],
  addEducation,
  updateEducationState,
  deleteEducation,
}: EducationFormProps) {
  const [activeTab, setActiveTab] = useState<string>();
  const [newBulletText, setNewBulletText] = useState<{ [edId: string]: string }>({});
  const prevLengthRef = useRef(0);

  // Sync active tab when a new education is created
  useEffect(() => {
    const currentLength = education.length;
    if (currentLength > prevLengthRef.current) {
      if (education[0]) {
        setActiveTab(education[0].id);
      }
    } else if (currentLength < prevLengthRef.current) {
      if (activeTab && !education.some((e) => e.id === activeTab)) {
        setActiveTab(education[0]?.id);
      }
    } else if (currentLength > 0 && !activeTab) {
      setActiveTab(education[0].id);
    }
    prevLengthRef.current = currentLength;
  }, [education, activeTab]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleEditTabs = (targetKey: any, action: "add" | "remove") => {
    if (action === "add") {
      addEducation();
    } else if (action === "remove" && typeof targetKey === "string") {
      deleteEducation(targetKey);
    }
  };

  const handleBulletDragEnd = (edId: string, event: DragEndEvent) => {
    const { active, over } = event;
    const ed = education.find((e) => e.id === edId);
    if (!ed) return;
    
    if (over && active.id !== over.id) {
      const oldIndex = ed.bullets.findIndex((b) => b.id === active.id);
      const newIndex = ed.bullets.findIndex((b) => b.id === over.id);
      const reorderedBullets = arrayMove(ed.bullets, oldIndex, newIndex).map((b, idx) => ({
        ...b,
        sortOrder: idx,
      }));
      updateEducationState(edId, { bullets: reorderedBullets });
    }
  };

  const handleUpdateBullet = (edId: string, bulletId: string, data: Partial<BulletDTO>) => {
    const ed = education.find((e) => e.id === edId);
    if (!ed) return;
    const updatedBullets = ed.bullets.map((b) => {
      if (b.id === bulletId) {
        return { ...b, ...data };
      }
      return b;
    });
    updateEducationState(edId, { bullets: updatedBullets });
  };

  const handleDeleteBullet = (edId: string, bulletId: string) => {
    const ed = education.find((e) => e.id === edId);
    if (!ed) return;
    const updatedBullets = ed.bullets.filter((b) => b.id !== bulletId);
    updateEducationState(edId, { bullets: updatedBullets });
  };

  const handleAddBullet = (edId: string) => {
    const text = newBulletText[edId] || "";
    if (!text.trim()) return;

    const ed = education.find((e) => e.id === edId);
    if (!ed) return;
    
    const newBullet: BulletDTO = {
      id: `temp-${Date.now()}`,
      text: text.trim(),
      isActive: true,
      isArchived: false,
      type: "BULLET",
      sortOrder: ed.bullets.length,
      usedInCVs: [],
    };

    updateEducationState(edId, { bullets: [...ed.bullets, newBullet] });
    setNewBulletText({ ...newBulletText, [edId]: "" });
  };

  if (education.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Title level={4} className="!text-white !m-0">Education</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={addEducation}>
            Add Education
          </Button>
        </div>
        <div className="text-center text-zinc-500 py-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-lg">
          No education entries added yet. Click "Add Education" to start.
        </div>
      </div>
    );
  }

  const tabItems = education.map((ed) => ({
    key: ed.id,
    label: (
      <EditableTabLabel
        value={ed.institution}
        onSave={(val) => updateEducationState(ed.id, { institution: val })}
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
              value={ed.institution} 
              onChange={(e) => updateEducationState(ed.id, { institution: e.target.value })}
              className="bg-zinc-950 border-zinc-800 text-white"
            />
          </Form.Item>
          <Form.Item label={<span className="text-zinc-300">Degree</span>}>
            <Input 
              value={ed.degree} 
              onChange={(e) => updateEducationState(ed.id, { degree: e.target.value })}
              className="bg-zinc-950 border-zinc-800 text-white"
            />
          </Form.Item>
          <Form.Item label={<span className="text-zinc-300">Field of Study</span>}>
            <Input 
              value={ed.fieldOfStudy || ""} 
              onChange={(e) => updateEducationState(ed.id, { fieldOfStudy: e.target.value || null })}
              className="bg-zinc-950 border-zinc-800 text-white"
              placeholder="e.g. Computer Science"
            />
          </Form.Item>
          <div className="grid grid-cols-2 gap-2">
            <Form.Item label={<span className="text-zinc-300">Start Date</span>}>
              <DatePicker 
                value={ed.startDate ? dayjs(ed.startDate) : null}
                onChange={(date) => updateEducationState(ed.id, { startDate: date ? date.toISOString() : new Date().toISOString() })}
                className="w-full bg-zinc-950 border-zinc-800 text-white"
              />
            </Form.Item>
            
            <Form.Item label={<span className="text-zinc-300">End Date</span>}>
              <DatePicker 
                value={ed.endDate ? dayjs(ed.endDate) : null}
                disabled={ed.current}
                onChange={(date) => updateEducationState(ed.id, { endDate: date ? date.toISOString() : null })}
                className="w-full bg-zinc-950 border-zinc-800 text-white"
              />
            </Form.Item>
          </div>
          
          <div className="col-span-1 md:col-span-2 flex flex-col sm:flex-row gap-4">
            <Form.Item className="!mb-0">
              <Checkbox 
                checked={ed.current} 
                onChange={(e) => {
                  const checked = e.target.checked;
                  updateEducationState(ed.id, { 
                    current: checked,
                    endDate: checked ? null : ed.endDate 
                  });
                }}
                className="text-zinc-300"
              >
                I am currently studying here
              </Checkbox>
            </Form.Item>

            <Form.Item className="!mb-0">
              <Checkbox 
                checked={ed.hideEndDate} 
                onChange={(e) => updateEducationState(ed.id, { hideEndDate: e.target.checked })}
                className="text-zinc-300"
              >
                Hide end date on generated CVs
              </Checkbox>
            </Form.Item>
          </div>

          <Form.Item className="col-span-1 md:col-span-2" label={<span className="text-zinc-300">Context / Description</span>}>
            <TextArea 
              rows={3}
              value={ed.freeFormContext || ""} 
              onChange={(e) => updateEducationState(ed.id, { freeFormContext: e.target.value || null })}
              placeholder="Add optional notes, relevant courses, or GPA details..."
              className="bg-zinc-950 border-zinc-800 text-white"
            />
          </Form.Item>
        </Form>

        <Divider className="border-zinc-800 my-6" />

        <div className="space-y-4">
          <span className="text-white font-semibold block text-sm">Activities & Highlights</span>
          
          <div className="flex gap-2">
            <Input
              value={newBulletText[ed.id] || ""}
              onChange={(e) => setNewBulletText({ ...newBulletText, [ed.id]: e.target.value })}
              onPressEnter={() => handleAddBullet(ed.id)}
              placeholder="Add an activity, course highlight, or thesis topic..."
              className="bg-zinc-950 border-zinc-800 text-white"
            />
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={() => handleAddBullet(ed.id)}
              className="bg-blue-600 border-blue-600 hover:bg-blue-500"
            >
              Add
            </Button>
          </div>

          {ed.bullets.length === 0 ? (
            <div className="text-center text-zinc-600 py-4 bg-zinc-950/20 border border-dashed border-zinc-800 rounded text-xs">
              No highlights added. Type above to add details.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(evt) => handleBulletDragEnd(ed.id, evt)}
            >
              <SortableContext
                items={ed.bullets.map((b) => b.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {ed.bullets.map((b) => (
                    <SortableBulletItem
                      key={b.id}
                      bullet={b}
                      onUpdate={(bId, data) => handleUpdateBullet(ed.id, bId, data)}
                      onDelete={(bId) => handleDeleteBullet(ed.id, bId)}
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
        <Title level={4} className="!text-white !m-0">Education</Title>
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
