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
import { EducationDTO, BulletDTO } from "../../types/profile";

const { Title } = Typography;
const { TextArea } = Input;

function EditableTabLabel({ value, onSave, fallback }: { value: string; onSave: (v: string) => void; fallback: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  useEffect(() => { setTempValue(value); }, [value]);
  const handleBlur = () => {
    setIsEditing(false);
    const trimmed = tempValue.trim();
    if (trimmed !== value) onSave(trimmed);
    else setTempValue(value);
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation(); // prevent Tabs from capturing Arrow/Backspace/Delete
    if (e.key === "Enter") handleBlur();
    else if (e.key === "Escape") { setIsEditing(false); setTempValue(value); }
  };
  if (isEditing) return <Input size="small" value={tempValue} onChange={(e) => setTempValue(e.target.value)} onBlur={handleBlur} onKeyDown={handleKeyDown} autoFocus style={{ width: 140, height: 22, fontSize: 12 }} onClick={(e) => e.stopPropagation()} placeholder={fallback} />;
  return <span onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }} className="cursor-pointer select-none" title="Double-click to rename tab (does not change the institution name)">{value || fallback || "New Education"}</span>;
}

function SortableBulletItem({ bullet, onUpdate, onDelete }: { bullet: BulletDTO; onUpdate: (id: string, d: Partial<BulletDTO>) => void; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bullet.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 100 : undefined };
  const isUsed = bullet.usedInCVs?.length > 0;
  const isBullet = bullet.type === "BULLET";

  return (
    <div ref={setNodeRef} style={style} className={`flex items-start gap-2 p-2 rounded-md border transition-colors ${!bullet.isActive ? "opacity-60 border-dashed border-zinc-700 bg-zinc-950/20" : "border-zinc-800 bg-zinc-950/40"}`}>
      <div {...attributes} {...listeners} className="mt-2.5 cursor-grab text-zinc-600 hover:text-zinc-400 shrink-0"><MenuOutlined style={{ fontSize: 11 }} /></div>
      {isBullet
        ? <span className="mt-2.5 text-zinc-400 shrink-0 select-none font-bold leading-none">•</span>
        : <span className="mt-2.5 text-zinc-600 shrink-0 select-none text-xs leading-none">¶</span>}
      <div className="flex-1 min-w-0 space-y-1">
        <TextArea value={bullet.text} onChange={(e) => onUpdate(bullet.id, { text: e.target.value })} autoSize={{ minRows: 1 }} className="bg-transparent border-none text-white focus:bg-zinc-900 text-sm px-1.5 w-full resize-none" placeholder="Edit bullet text..." />
        {isUsed && <div className="pl-1.5"><span className="text-[10px] bg-blue-900/30 text-blue-300 border border-blue-800/40 px-1.5 py-0.5 rounded font-medium">Used in: {bullet.usedInCVs.map((c) => c.name).join(", ")}</span></div>}
      </div>
      <Tooltip title="How this item renders on the CV">
        <Select value={bullet.type} onChange={(val) => onUpdate(bullet.id, { type: val })} size="small" style={{ width: 110 }} options={[{ value: "BULLET", label: "• Bullet" }, { value: "PARAGRAPH", label: "¶ Paragraph" }]} className="shrink-0" />
      </Tooltip>
      <Tooltip title={bullet.isActive ? "Active — shows on CV" : "Inactive — hidden from CV"}>
        <Switch checked={bullet.isActive} onChange={(checked) => onUpdate(bullet.id, { isActive: checked })} size="small" className="shrink-0 mt-1.5" />
      </Tooltip>
      {isUsed
        ? <Tooltip title="Used in a CV — toggle Active to hide"><Button type="text" danger disabled icon={<DeleteOutlined />} size="small" className="shrink-0" /></Tooltip>
        : <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onDelete(bullet.id)} size="small" className="hover:bg-zinc-900 shrink-0" />}
    </div>
  );
}

function ContextNotesList({ notes, onChange, placeholder }: { notes: string[]; onChange: (n: string[]) => void; placeholder?: string }) {
  const safeNotes = notes ?? [];
  const handleUpdate = (idx: number, value: string) => { const u = [...safeNotes]; u[idx] = value; onChange(u); };
  const handleDelete = (idx: number) => onChange(safeNotes.filter((_, i) => i !== idx));

  return (
    <div className="rounded-lg border border-zinc-700/60 bg-zinc-950/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BulbOutlined className="text-amber-400 text-base" />
          <span className="text-amber-300 font-semibold text-sm">AI Context Notes</span>
          <span className="text-zinc-500 text-xs">— not displayed on the CV</span>
        </div>
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => onChange([...safeNotes, ""])} className="border-amber-700/60 text-amber-400 hover:border-amber-500 hover:text-amber-300">Add Note</Button>
      </div>
      <p className="text-zinc-500 text-xs leading-relaxed">Write freely — stories, context, achievements. The AI uses this when generating bullets, summaries, or cover letters.</p>
      {safeNotes.length === 0
        ? <div className="text-center text-zinc-600 py-3 border border-dashed border-zinc-800 rounded text-xs">No notes yet. Click &quot;Add Note&quot; to write free-form AI context.</div>
        : <div className="space-y-2">{safeNotes.map((note, idx) => (
          <div key={idx} className="flex gap-2 items-start">
            <TextArea value={note} onChange={(e) => handleUpdate(idx, e.target.value)} autoSize={{ minRows: 2 }} placeholder={placeholder || "Write context, stories, or achievements freely..."} className="bg-zinc-900 border-zinc-700 text-white text-sm flex-1 resize-none" />
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(idx)} size="small" className="hover:bg-zinc-900 mt-1 shrink-0" />
          </div>
        ))}</div>}
    </div>
  );
}

interface EducationFormProps {
  education: EducationDTO[];
  addEducation: () => Promise<void>;
  updateEducationState: (id: string, data: Partial<EducationDTO>) => void;
  deleteEducation: (id: string) => Promise<void>;
}

export default function EducationForm({ education = [], addEducation, updateEducationState, deleteEducation }: EducationFormProps) {
  const [activeTab, setActiveTab] = useState<string>();
  const [newBulletText, setNewBulletText] = useState<{ [edId: string]: string }>({});
  const [newBulletType, setNewBulletType] = useState<{ [edId: string]: "BULLET" | "PARAGRAPH" }>({});
  const prevLengthRef = useRef(0);

  useEffect(() => {
    const n = education.length;
    if (n > prevLengthRef.current) { if (education[0]) setActiveTab(education[0].id); }
    else if (n < prevLengthRef.current) { if (activeTab && !education.some((e) => e.id === activeTab)) setActiveTab(education[0]?.id); }
    else if (n > 0 && !activeTab) setActiveTab(education[0].id);
    prevLengthRef.current = n;
  }, [education, activeTab]);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const handleEditTabs = (targetKey: unknown, action: "add" | "remove") => {
    if (action === "add") addEducation();
    else if (action === "remove" && typeof targetKey === "string") {
      const ed = education.find((e) => e.id === targetKey);
      Modal.confirm({
        title: "Delete education entry?",
        content: `This will permanently delete "${ed?.tabLabel || ed?.institution || "this entry"}" and all its bullets.`,
        okText: "Delete",
        okButtonProps: { danger: true },
        cancelText: "Cancel",
        onOk: () => deleteEducation(targetKey),
      });
    }
  };

  const handleBulletDragEnd = (edId: string, event: DragEndEvent) => {
    const { active, over } = event;
    const ed = education.find((e) => e.id === edId);
    if (!ed || !over || active.id === over.id) return;
    const oldIndex = ed.bullets.findIndex((b) => b.id === active.id);
    const newIndex = ed.bullets.findIndex((b) => b.id === over.id);
    updateEducationState(edId, { bullets: arrayMove(ed.bullets, oldIndex, newIndex).map((b, i) => ({ ...b, sortOrder: i })) });
  };

  const handleUpdateBullet = (edId: string, bulletId: string, data: Partial<BulletDTO>) => {
    const ed = education.find((e) => e.id === edId);
    if (!ed) return;
    updateEducationState(edId, { bullets: ed.bullets.map((b) => (b.id === bulletId ? { ...b, ...data } : b)) });
  };

  const handleDeleteBullet = (edId: string, bulletId: string) => {
    const ed = education.find((e) => e.id === edId);
    if (!ed) return;
    updateEducationState(edId, { bullets: ed.bullets.filter((b) => b.id !== bulletId) });
  };

  const handleAddBullet = (edId: string) => {
    const text = newBulletText[edId] || "";
    if (!text.trim()) return;
    const ed = education.find((e) => e.id === edId);
    if (!ed) return;
    const type = newBulletType[edId] || "BULLET";
    updateEducationState(edId, { bullets: [...ed.bullets, { id: `temp-${Date.now()}`, text: text.trim(), isActive: true, isArchived: false, type, sortOrder: ed.bullets.length, usedInCVs: [] }] });
    setNewBulletText({ ...newBulletText, [edId]: "" });
  };

  if (education.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Title level={4} className="!text-white !m-0">Education</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={addEducation}>Add Education</Button>
        </div>
        <div className="text-center text-zinc-500 py-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-lg">No education entries added yet. Click &quot;Add Education&quot; to start.</div>
      </div>
    );
  }

  const tabItems = education.map((ed) => ({
    key: ed.id,
    label: <EditableTabLabel value={ed.tabLabel || ""} fallback={ed.institution} onSave={(val) => updateEducationState(ed.id, { tabLabel: val || null })} />,
    children: (
      <Card className="bg-zinc-900/50 border-zinc-800 text-white mt-2" title={<span className="text-white font-semibold">Edit Education</span>}>
        <Form layout="vertical" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Form.Item label={<span className="text-zinc-300">Institution</span>}>
            <Input value={ed.institution} onChange={(e) => updateEducationState(ed.id, { institution: e.target.value })} className="bg-zinc-950 border-zinc-800 text-white" />
          </Form.Item>
          <Form.Item label={<span className="text-zinc-300">Degree</span>}>
            <Input value={ed.degree} onChange={(e) => updateEducationState(ed.id, { degree: e.target.value })} className="bg-zinc-950 border-zinc-800 text-white" />
          </Form.Item>
          <Form.Item label={<span className="text-zinc-300">Field of Study</span>}>
            <Input value={ed.fieldOfStudy || ""} onChange={(e) => updateEducationState(ed.id, { fieldOfStudy: e.target.value || null })} className="bg-zinc-950 border-zinc-800 text-white" placeholder="e.g. Computer Science" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-2">
            <Form.Item label={<span className="text-zinc-300">Start Date</span>}>
              <DatePicker value={ed.startDate ? dayjs(ed.startDate) : null} onChange={(date) => updateEducationState(ed.id, { startDate: date ? date.toISOString() : new Date().toISOString() })} className="w-full bg-zinc-950 border-zinc-800 text-white" />
            </Form.Item>
            <Form.Item label={<span className="text-zinc-300">End Date</span>}>
              <DatePicker value={ed.endDate ? dayjs(ed.endDate) : null} disabled={ed.current} onChange={(date) => updateEducationState(ed.id, { endDate: date ? date.toISOString() : null })} className="w-full bg-zinc-950 border-zinc-800 text-white" />
            </Form.Item>
          </div>
          <div className="col-span-1 md:col-span-2 flex flex-col sm:flex-row gap-4">
            <Form.Item className="!mb-0">
              <Checkbox checked={ed.current} onChange={(e) => { const c = e.target.checked; updateEducationState(ed.id, { current: c, endDate: c ? null : ed.endDate }); }} className="text-zinc-300">I am currently studying here</Checkbox>
            </Form.Item>
            <Form.Item className="!mb-0">
              <Checkbox checked={ed.hideEndDate} onChange={(e) => updateEducationState(ed.id, { hideEndDate: e.target.checked })} className="text-zinc-300">Hide end date on generated CVs</Checkbox>
            </Form.Item>
          </div>
        </Form>

        <Divider className="border-zinc-800 my-6" />
        <div className="space-y-4">
          <div>
            <span className="text-white font-semibold block text-sm">Activities &amp; Highlights</span>
            <span className="text-zinc-500 text-xs">Each item renders as a bullet (•) or paragraph (¶). Toggle Active to include/exclude from CV.</span>
          </div>
          <div className="flex gap-2">
            <Input value={newBulletText[ed.id] || ""} onChange={(e) => setNewBulletText({ ...newBulletText, [ed.id]: e.target.value })} onPressEnter={() => handleAddBullet(ed.id)} placeholder="Add an activity, thesis topic, or relevant course..." className="bg-zinc-950 border-zinc-800 text-white" />
            <Select value={newBulletType[ed.id] || "BULLET"} onChange={(val) => setNewBulletType({ ...newBulletType, [ed.id]: val })} size="middle" style={{ width: 120 }} options={[{ value: "BULLET", label: "• Bullet" }, { value: "PARAGRAPH", label: "¶ Paragraph" }]} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAddBullet(ed.id)} className="bg-blue-600 border-blue-600 hover:bg-blue-500">Add</Button>
          </div>
          {ed.bullets.length === 0
            ? <div className="text-center text-zinc-600 py-4 bg-zinc-950/20 border border-dashed border-zinc-800 rounded text-xs">No highlights added. Type above to add details.</div>
            : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(evt) => handleBulletDragEnd(ed.id, evt)}>
                <SortableContext items={ed.bullets.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">{ed.bullets.map((b) => <SortableBulletItem key={b.id} bullet={b} onUpdate={(bId, data) => handleUpdateBullet(ed.id, bId, data)} onDelete={(bId) => handleDeleteBullet(ed.id, bId)} />)}</div>
                </SortableContext>
              </DndContext>
            )}
        </div>

        <Divider className="border-zinc-700 my-6" />
        <ContextNotesList
          notes={ed.freeFormContext}
          onChange={(notes) => updateEducationState(ed.id, { freeFormContext: notes })}
          placeholder="e.g. Final thesis on distributed systems fault tolerance. GPA 3.9. Tutored undergraduate data structures..."
        />
      </Card>
    ),
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center pr-2">
        <Title level={4} className="!text-white !m-0">Education</Title>
      </div>
      <Tabs type="editable-card" activeKey={activeTab} onChange={setActiveTab} onEdit={handleEditTabs} items={tabItems} className="profile-subtabs" />
    </div>
  );
}
