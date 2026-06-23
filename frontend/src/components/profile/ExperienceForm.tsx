"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, Form, Input, Button, DatePicker, Checkbox, Switch, Tooltip, Tabs, Typography, Divider, Select, Modal } from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  MenuOutlined,
  BulbOutlined,
} from "@ant-design/icons";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import dayjs from "dayjs";
import { ExperienceDTO, BulletDTO } from "../../types/profile";

const { Title } = Typography;
const { TextArea } = Input;

// ── 1. Editable Tab Label ─────────────────────────────────────────────────────
interface EditableTabLabelProps {
  value: string;
  onSave: (val: string) => void;
  fallback: string;  // shown when value is empty (e.g. company name)
}

function EditableTabLabel({ value, onSave, fallback }: EditableTabLabelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  useEffect(() => { setTempValue(value); }, [value]);

  const handleBlur = () => {
    setIsEditing(false);
    const trimmed = tempValue.trim();
    if (trimmed !== value) onSave(trimmed); // save even if empty (clears label → fallback)
    else setTempValue(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Stop ALL key events from bubbling to Ant Design Tabs container.
    // Without this, ArrowLeft/Right navigate tabs and Backspace/Delete close them.
    e.stopPropagation();
    if (e.key === "Enter") handleBlur();
    else if (e.key === "Escape") { setIsEditing(false); setTempValue(value); }
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
        style={{ width: 140, height: 22, fontSize: 12 }}
        onClick={(e) => e.stopPropagation()}
        placeholder={fallback}
      />
    );
  }

  return (
    <span
      onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
      className="cursor-pointer select-none"
      title="Double-click to rename tab (does not change the company name)"
    >
      {value || fallback || "New Experience"}
    </span>
  );
}

// ── 2. Sortable Bullet Item ───────────────────────────────────────────────────
interface SortableBulletItemProps {
  bullet: BulletDTO;
  onUpdate: (bulletId: string, data: Partial<BulletDTO>) => void;
  onDelete: (bulletId: string) => void;
}

function SortableBulletItem({ bullet, onUpdate, onDelete }: SortableBulletItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: bullet.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : undefined,
  };

  const isUsed = bullet.usedInCVs && bullet.usedInCVs.length > 0;
  const isBullet = bullet.type === "BULLET";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 p-2 rounded-md transition-colors border ${
        !bullet.isActive
          ? "opacity-60 border-dashed border-zinc-700 bg-zinc-950/20"
          : "border-zinc-800 bg-zinc-950/40"
      }`}
    >
      {/* Drag handle */}
      <div {...attributes} {...listeners} className="mt-2.5 cursor-grab text-zinc-600 hover:text-zinc-400 shrink-0">
        <MenuOutlined style={{ fontSize: 11 }} />
      </div>

      {/* Bullet indicator — visual only, outside the text box */}
      {isBullet ? (
        <span className="mt-2.5 text-zinc-400 shrink-0 select-none font-bold leading-none">•</span>
      ) : (
        <span className="mt-2.5 text-zinc-600 shrink-0 select-none text-xs leading-none">¶</span>
      )}

      {/* Auto-expanding text area */}
      <div className="flex-1 min-w-0 space-y-1">
        <TextArea
          value={bullet.text}
          onChange={(e) => onUpdate(bullet.id, { text: e.target.value })}
          autoSize={{ minRows: 1 }}
          className="bg-transparent border-none text-white focus:bg-zinc-900 focus:border-zinc-800 text-sm px-1.5 w-full resize-none"
          placeholder="Describe an achievement or responsibility..."
        />
        {isUsed && (
          <div className="pl-1.5">
            <span className="text-[10px] bg-blue-900/30 text-blue-300 border border-blue-800/40 px-1.5 py-0.5 rounded font-medium">
              Used in: {bullet.usedInCVs.map((c) => c.name).join(", ")}
            </span>
          </div>
        )}
      </div>

      {/* Type selector */}
      <Tooltip title="How this item renders on the CV">
        <Select
          value={bullet.type}
          onChange={(val) => onUpdate(bullet.id, { type: val })}
          size="small"
          style={{ width: 110 }}
          options={[
            { value: "BULLET", label: "• Bullet" },
            { value: "PARAGRAPH", label: "¶ Paragraph" },
          ]}
          className="shrink-0"
        />
      </Tooltip>

      {/* Active toggle */}
      <Tooltip title={bullet.isActive ? "Active — shows on CV" : "Inactive — hidden from CV"}>
        <Switch
          checked={bullet.isActive}
          onChange={(checked) => onUpdate(bullet.id, { isActive: checked })}
          size="small"
          className="shrink-0 mt-1.5"
        />
      </Tooltip>

      {/* Delete */}
      {isUsed ? (
        <Tooltip title="Used in a CV — toggle Active to hide instead of deleting">
          <Button type="text" danger disabled icon={<DeleteOutlined />} size="small" className="shrink-0" />
        </Tooltip>
      ) : (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => onDelete(bullet.id)}
          size="small"
          className="hover:bg-zinc-900 shrink-0"
        />
      )}
    </div>
  );
}

// ── 3. AI Context Notes list ──────────────────────────────────────────────────
interface ContextNotesProps {
  notes: string[];
  onChange: (notes: string[]) => void;
  placeholder?: string;
}

function ContextNotesList({ notes, onChange, placeholder }: ContextNotesProps) {
  const safeNotes = notes ?? [];
  const handleAdd = () => onChange([...safeNotes, ""]);

  const handleUpdate = (idx: number, value: string) => {
    const updated = [...safeNotes];
    updated[idx] = value;
    onChange(updated);
  };

  const handleDelete = (idx: number) => {
    onChange(safeNotes.filter((_, i) => i !== idx));
  };

  return (
    <div className="rounded-lg border border-zinc-700/60 bg-zinc-950/60 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BulbOutlined className="text-amber-400 text-base" />
          <span className="text-amber-300 font-semibold text-sm">AI Context Notes</span>
          <span className="text-zinc-500 text-xs">— not displayed on the CV</span>
        </div>
        <Button
          size="small"
          type="dashed"
          icon={<PlusOutlined />}
          onClick={handleAdd}
          className="border-amber-700/60 text-amber-400 hover:border-amber-500 hover:text-amber-300"
        >
          Add Note
        </Button>
      </div>

      <p className="text-zinc-500 text-xs leading-relaxed">
        Write freely — stories, context, achievements, challenges, impact. This text feeds the AI when generating
        new bullet points, summaries, or cover letters, giving it richer context about this entry.
      </p>

      {/* Notes list */}
      {safeNotes.length === 0 ? (
        <div className="text-center text-zinc-600 py-3 border border-dashed border-zinc-800 rounded text-xs">
          No notes yet. Click &quot;Add Note&quot; to write free-form AI context.
        </div>
      ) : (
        <div className="space-y-2">
          {safeNotes.map((note, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <TextArea
                value={note}
                onChange={(e) => handleUpdate(idx, e.target.value)}
                autoSize={{ minRows: 2 }}
                placeholder={placeholder || "Write context, stories, or achievements freely..."}
                className="bg-zinc-900 border-zinc-700 text-white text-sm flex-1 resize-none"
              />
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleDelete(idx)}
                size="small"
                className="hover:bg-zinc-900 mt-1 shrink-0"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 4. Experience Form ────────────────────────────────────────────────────────
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
  const [newBulletType, setNewBulletType] = useState<{ [expId: string]: "BULLET" | "PARAGRAPH" }>({});
  const prevLengthRef = useRef(0);

  useEffect(() => {
    const n = experiences.length;
    if (n > prevLengthRef.current) { if (experiences[0]) setActiveTab(experiences[0].id); }
    else if (n < prevLengthRef.current) { if (activeTab && !experiences.some((e) => e.id === activeTab)) setActiveTab(experiences[0]?.id); }
    else if (n > 0 && !activeTab) setActiveTab(experiences[0].id);
    prevLengthRef.current = n;
  }, [experiences, activeTab]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleEditTabs = (targetKey: unknown, action: "add" | "remove") => {
    if (action === "add") addExperience();
    else if (action === "remove" && typeof targetKey === "string") {
      const exp = experiences.find((e) => e.id === targetKey);
      Modal.confirm({
        title: "Delete experience?",
        content: `This will permanently delete "${exp?.tabLabel || exp?.company || "this experience"}" and all its bullets.`,
        okText: "Delete",
        okButtonProps: { danger: true },
        cancelText: "Cancel",
        onOk: () => deleteExperience(targetKey),
      });
    }
  };

  const handleBulletDragEnd = (expId: string, event: DragEndEvent) => {
    const { active, over } = event;
    const exp = experiences.find((e) => e.id === expId);
    if (!exp || !over || active.id === over.id) return;
    const oldIndex = exp.bullets.findIndex((b) => b.id === active.id);
    const newIndex = exp.bullets.findIndex((b) => b.id === over.id);
    updateExperienceState(expId, {
      bullets: arrayMove(exp.bullets, oldIndex, newIndex).map((b, i) => ({ ...b, sortOrder: i })),
    });
  };

  const handleUpdateBullet = (expId: string, bulletId: string, data: Partial<BulletDTO>) => {
    const exp = experiences.find((e) => e.id === expId);
    if (!exp) return;
    updateExperienceState(expId, {
      bullets: exp.bullets.map((b) => (b.id === bulletId ? { ...b, ...data } : b)),
    });
  };

  const handleDeleteBullet = (expId: string, bulletId: string) => {
    const exp = experiences.find((e) => e.id === expId);
    if (!exp) return;
    updateExperienceState(expId, { bullets: exp.bullets.filter((b) => b.id !== bulletId) });
  };

  const handleAddBullet = (expId: string) => {
    const text = newBulletText[expId] || "";
    if (!text.trim()) return;
    const exp = experiences.find((e) => e.id === expId);
    if (!exp) return;
    const type = newBulletType[expId] || "BULLET";
    updateExperienceState(expId, {
      bullets: [
        ...exp.bullets,
        { id: `temp-${Date.now()}`, text: text.trim(), isActive: true, isArchived: false, type, sortOrder: exp.bullets.length, usedInCVs: [] },
      ],
    });
    setNewBulletText({ ...newBulletText, [expId]: "" });
  };

  if (experiences.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Title level={4} className="!text-white !m-0">Work Experience</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={addExperience}>Add Experience</Button>
        </div>
        <div className="text-center text-zinc-500 py-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-lg">
          No work experiences added yet. Click &quot;Add Experience&quot; to start.
        </div>
      </div>
    );
  }

  const tabItems = experiences.map((exp) => ({
    key: exp.id,
    label: (
      <EditableTabLabel
        value={exp.tabLabel || ""}
        fallback={exp.company}
        onSave={(val) => updateExperienceState(exp.id, { tabLabel: val || null })}
      />
    ),
    children: (
      <Card
        className="bg-zinc-900/50 border-zinc-800 text-white mt-2"
        title={<span className="text-white font-semibold">Edit Work Experience</span>}
      >
        {/* ── Fields ── */}
        <Form layout="vertical" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Form.Item label={<span className="text-zinc-300">Company</span>}>
            <Input value={exp.company} onChange={(e) => updateExperienceState(exp.id, { company: e.target.value })} className="bg-zinc-950 border-zinc-800 text-white" />
          </Form.Item>
          <Form.Item label={<span className="text-zinc-300">Position</span>}>
            <Input value={exp.position} onChange={(e) => updateExperienceState(exp.id, { position: e.target.value })} className="bg-zinc-950 border-zinc-800 text-white" />
          </Form.Item>
          <Form.Item label={<span className="text-zinc-300">Start Date</span>}>
            <DatePicker value={exp.startDate ? dayjs(exp.startDate) : null} onChange={(date) => updateExperienceState(exp.id, { startDate: date ? date.toISOString() : new Date().toISOString() })} className="w-full bg-zinc-950 border-zinc-800 text-white" />
          </Form.Item>
          <Form.Item label={<span className="text-zinc-300">End Date</span>}>
            <DatePicker value={exp.endDate ? dayjs(exp.endDate) : null} disabled={exp.current} onChange={(date) => updateExperienceState(exp.id, { endDate: date ? date.toISOString() : null })} className="w-full bg-zinc-950 border-zinc-800 text-white" />
          </Form.Item>
          <Form.Item className="col-span-1 md:col-span-2">
            <Checkbox checked={exp.current} onChange={(e) => { const checked = e.target.checked; updateExperienceState(exp.id, { current: checked, endDate: checked ? null : exp.endDate }); }} className="text-zinc-300">
              I currently work here
            </Checkbox>
          </Form.Item>
        </Form>

        {/* ── Key Achievements & Responsibilities ── */}
        <Divider className="border-zinc-800 my-6" />
        <div className="space-y-4">
          <div>
            <span className="text-white font-semibold block text-sm">Key Achievements &amp; Responsibilities</span>
            <span className="text-zinc-500 text-xs">
              Each item renders as a bullet (•) or paragraph (¶) on the final CV. Toggle Active to include/exclude.
            </span>
          </div>

          {/* Add row */}
          <div className="flex gap-2">
            <Input
              value={newBulletText[exp.id] || ""}
              onChange={(e) => setNewBulletText({ ...newBulletText, [exp.id]: e.target.value })}
              onPressEnter={() => handleAddBullet(exp.id)}
              placeholder="Describe an achievement or responsibility..."
              className="bg-zinc-950 border-zinc-800 text-white"
            />
            <Select
              value={newBulletType[exp.id] || "BULLET"}
              onChange={(val) => setNewBulletType({ ...newBulletType, [exp.id]: val })}
              size="middle"
              style={{ width: 120 }}
              options={[
                { value: "BULLET", label: "• Bullet" },
                { value: "PARAGRAPH", label: "¶ Paragraph" },
              ]}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAddBullet(exp.id)} className="bg-blue-600 border-blue-600 hover:bg-blue-500">Add</Button>
          </div>

          {exp.bullets.length === 0 ? (
            <div className="text-center text-zinc-600 py-4 bg-zinc-950/20 border border-dashed border-zinc-800 rounded text-xs">
              No bullets yet. Type above and press Add or Enter.
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(evt) => handleBulletDragEnd(exp.id, evt)}>
              <SortableContext items={exp.bullets.map((b) => b.id)} strategy={verticalListSortingStrategy}>
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

        {/* ── AI Context Notes ── */}
        <Divider className="border-zinc-700 my-6" />
        <ContextNotesList
          notes={exp.freeFormContext}
          onChange={(notes) => updateExperienceState(exp.id, { freeFormContext: notes })}
          placeholder="e.g. Led a cross-functional migration from monolith to microservices, reduced deploy time from 2h to 12min..."
        />
      </Card>
    ),
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center pr-2">
        <Title level={4} className="!text-white !m-0">Work Experiences</Title>
      </div>
      <Tabs type="editable-card" activeKey={activeTab} onChange={setActiveTab} onEdit={handleEditTabs} items={tabItems} className="profile-subtabs" />
    </div>
  );
}
