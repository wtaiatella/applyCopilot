"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, Form, Input, Button, DatePicker, Checkbox, Switch, Tooltip, Tabs, Typography, Divider, Select, Modal, Spin } from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  MenuOutlined,
  BulbOutlined,
  StarOutlined,
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
import { ProjectDTO, BulletDTO } from "../../types/profile";

const { Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

// ── 1. Editable Tab Label ─────────────────────────────────────────────────────
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
  return <span onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }} className="cursor-pointer select-none" title="Double-click to rename tab (does not change the project name)">{value || fallback || "New Project"}</span>;
}

// ── 2. Sortable Bullet Item ───────────────────────────────────────────────────
interface SortableBulletItemProps {
  bullet: BulletDTO;
  onUpdate: (bulletId: string, data: Partial<BulletDTO>) => void;
  onDelete: (bulletId: string) => void;
}

function SortableBulletItem({ bullet, onUpdate, onDelete }: SortableBulletItemProps) {
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

// ── 3. AI Context Notes list ──────────────────────────────────────────────────
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
      <p className="text-zinc-500 text-xs leading-relaxed">
        Write freely — the role you played, challenges faced, impact, architecture decisions. The AI uses this when generating bullets, summaries, or cover letters for this project.
      </p>
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

// ── 4. Project Form ───────────────────────────────────────────────────────────
interface ProjectFormProps {
  projects: ProjectDTO[];
  addProject: () => Promise<void>;
  updateProjectState: (id: string, data: Partial<ProjectDTO>) => void;
  deleteProject: (id: string) => Promise<void>;
}

export default function ProjectForm({ projects = [], addProject, updateProjectState, deleteProject }: ProjectFormProps) {
  const [activeTab, setActiveTab] = useState<string>();
  const [newBulletText, setNewBulletText] = useState<{ [projId: string]: string }>({});
  const [newBulletType, setNewBulletType] = useState<{ [projId: string]: "BULLET" | "PARAGRAPH" }>({});
  const [suggestingFor, setSuggestingFor] = useState<string | null>(null);
  const prevLengthRef = useRef(0);

  const isEmptyProject = (proj: ProjectDTO) =>
    proj.name === "New Project" &&
    proj.bullets.length === 0 &&
    proj.technologies.length === 0 &&
    (!proj.freeFormContext || proj.freeFormContext.length === 0);

  const handleSuggest = async (projId: string) => {
    setSuggestingFor(projId);
    try {
      const res = await fetch("/api/profile/projects/suggest", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        Modal.error({ title: "Could not generate suggestion", content: err.error || "Unknown error" });
        return;
      }
      const suggestion = await res.json();
      updateProjectState(projId, {
        name: suggestion.name || "New Project",
        technologies: suggestion.technologies || [],
        bullets: (suggestion.bullets || []).map((b: { text: string; type: string }, idx: number) => ({
          id: `temp-${Date.now()}-${idx}`,
          text: b.text,
          isActive: true,
          isArchived: false,
          type: b.type || "BULLET",
          sortOrder: idx,
          usedInCVs: [],
        })),
        freeFormContext: suggestion.freeFormContext || [],
      });
    } catch {
      Modal.error({ title: "Could not generate suggestion", content: "Network error. Please try again." });
    } finally {
      setSuggestingFor(null);
    }
  };

  useEffect(() => {
    const n = projects.length;
    if (n > prevLengthRef.current) { if (projects[0]) setActiveTab(projects[0].id); }
    else if (n < prevLengthRef.current) { if (activeTab && !projects.some((e) => e.id === activeTab)) setActiveTab(projects[0]?.id); }
    else if (n > 0 && !activeTab) setActiveTab(projects[0].id);
    prevLengthRef.current = n;
  }, [projects, activeTab]);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const handleEditTabs = (targetKey: unknown, action: "add" | "remove") => {
    if (action === "add") addProject();
    else if (action === "remove" && typeof targetKey === "string") {
      const proj = projects.find((p) => p.id === targetKey);
      Modal.confirm({
        title: "Delete project?",
        content: `This will permanently delete "${proj?.tabLabel || proj?.name || "this project"}" and all its bullets.`,
        okText: "Delete",
        okButtonProps: { danger: true },
        cancelText: "Cancel",
        onOk: () => deleteProject(targetKey),
      });
    }
  };

  const handleBulletDragEnd = (projId: string, event: DragEndEvent) => {
    const { active, over } = event;
    const proj = projects.find((e) => e.id === projId);
    if (!proj || !over || active.id === over.id) return;
    const oldIndex = proj.bullets.findIndex((b) => b.id === active.id);
    const newIndex = proj.bullets.findIndex((b) => b.id === over.id);
    updateProjectState(projId, { bullets: arrayMove(proj.bullets, oldIndex, newIndex).map((b, i) => ({ ...b, sortOrder: i })) });
  };

  const handleUpdateBullet = (projId: string, bulletId: string, data: Partial<BulletDTO>) => {
    const proj = projects.find((e) => e.id === projId);
    if (!proj) return;
    updateProjectState(projId, { bullets: proj.bullets.map((b) => (b.id === bulletId ? { ...b, ...data } : b)) });
  };

  const handleDeleteBullet = (projId: string, bulletId: string) => {
    const proj = projects.find((e) => e.id === projId);
    if (!proj) return;
    updateProjectState(projId, { bullets: proj.bullets.filter((b) => b.id !== bulletId) });
  };

  const handleAddBullet = (projId: string) => {
    const text = newBulletText[projId] || "";
    if (!text.trim()) return;
    const proj = projects.find((e) => e.id === projId);
    if (!proj) return;
    const type = newBulletType[projId] || "BULLET";
    updateProjectState(projId, { bullets: [...proj.bullets, { id: `temp-${Date.now()}`, text: text.trim(), isActive: true, isArchived: false, type, sortOrder: proj.bullets.length, usedInCVs: [] }] });
    setNewBulletText({ ...newBulletText, [projId]: "" });
  };

  if (projects.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Title level={4} className="!text-white !m-0">Projects</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={addProject}>Add Project</Button>
        </div>
        <div className="text-center text-zinc-500 py-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-lg">No projects added yet. Click &quot;Add Project&quot; to start.</div>
      </div>
    );
  }

  const tabItems = projects.map((proj) => ({
    key: proj.id,
    label: <EditableTabLabel value={proj.tabLabel || ""} fallback={proj.name} onSave={(val) => updateProjectState(proj.id, { tabLabel: val || null })} />,
    children: (
      <Card
        className="bg-zinc-900/50 border-zinc-800 text-white mt-2"
        title={<span className="text-white font-semibold">Edit Project</span>}
        extra={
          isEmptyProject(proj) ? (
            <Tooltip title="AI will suggest a project based on your work experiences (review before saving)">
              <Button
                size="small"
                icon={suggestingFor === proj.id ? <Spin size="small" /> : <StarOutlined />}
                disabled={!!suggestingFor}
                onClick={() => handleSuggest(proj.id)}
                className="border-amber-700/60 text-amber-400 hover:border-amber-500 hover:text-amber-300"
              >
                {suggestingFor === proj.id ? "Generating..." : "Suggest from my experiences"}
              </Button>
            </Tooltip>
          ) : null
        }
      >
        {/* ── Fields ── */}
        <Form layout="vertical" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Form.Item label={<span className="text-zinc-300">Project Name</span>} className="col-span-1 md:col-span-2">
            <Input value={proj.name} onChange={(e) => updateProjectState(proj.id, { name: e.target.value })} className="bg-zinc-950 border-zinc-800 text-white" />
          </Form.Item>
          <Form.Item label={<span className="text-zinc-300">Start Date</span>}>
            <DatePicker value={proj.startDate ? dayjs(proj.startDate) : null} onChange={(date) => updateProjectState(proj.id, { startDate: date ? date.toISOString() : null })} className="w-full bg-zinc-950 border-zinc-800 text-white" />
          </Form.Item>
          <Form.Item label={<span className="text-zinc-300">End Date</span>}>
            <DatePicker value={proj.endDate ? dayjs(proj.endDate) : null} disabled={proj.current} onChange={(date) => updateProjectState(proj.id, { endDate: date ? date.toISOString() : null })} className="w-full bg-zinc-950 border-zinc-800 text-white" />
          </Form.Item>
          <Form.Item className="col-span-1 md:col-span-2">
            <Checkbox checked={proj.current} onChange={(e) => { const c = e.target.checked; updateProjectState(proj.id, { current: c, endDate: c ? null : proj.endDate }); }} className="text-zinc-300">
              This project is currently ongoing
            </Checkbox>
          </Form.Item>
          <Form.Item label={<span className="text-zinc-300">Technologies</span>} className="col-span-1 md:col-span-2">
            <Select mode="tags" style={{ width: "100%" }} placeholder="Select or type technologies used" value={proj.technologies} onChange={(techs) => updateProjectState(proj.id, { technologies: techs })} className="bg-zinc-950 border-zinc-800 text-white">
              {proj.technologies.map((t) => <Option key={t} value={t}>{t}</Option>)}
            </Select>
          </Form.Item>
        </Form>

        {/* ── Contributions & Accomplishments ── */}
        <Divider className="border-zinc-800 my-6" />
        <div className="space-y-4">
          <div>
            <span className="text-white font-semibold block text-sm">Contributions &amp; Accomplishments</span>
            <span className="text-zinc-500 text-xs">Each item renders as a bullet (•) or paragraph (¶). Toggle Active to include/exclude from CV.</span>
          </div>
          <div className="flex gap-2">
            <Input value={newBulletText[proj.id] || ""} onChange={(e) => setNewBulletText({ ...newBulletText, [proj.id]: e.target.value })} onPressEnter={() => handleAddBullet(proj.id)} placeholder="Describe a contribution or technical achievement..." className="bg-zinc-950 border-zinc-800 text-white" />
            <Select value={newBulletType[proj.id] || "BULLET"} onChange={(val) => setNewBulletType({ ...newBulletType, [proj.id]: val })} size="middle" style={{ width: 120 }} options={[{ value: "BULLET", label: "• Bullet" }, { value: "PARAGRAPH", label: "¶ Paragraph" }]} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAddBullet(proj.id)} className="bg-blue-600 border-blue-600 hover:bg-blue-500">Add</Button>
          </div>
          {proj.bullets.length === 0
            ? <div className="text-center text-zinc-600 py-4 bg-zinc-950/20 border border-dashed border-zinc-800 rounded text-xs">No project highlights added. Type above to add contributions.</div>
            : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(evt) => handleBulletDragEnd(proj.id, evt)}>
                <SortableContext items={proj.bullets.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">{proj.bullets.map((b) => <SortableBulletItem key={b.id} bullet={b} onUpdate={(bId, data) => handleUpdateBullet(proj.id, bId, data)} onDelete={(bId) => handleDeleteBullet(proj.id, bId)} />)}</div>
                </SortableContext>
              </DndContext>
            )}
        </div>

        {/* ── AI Context Notes ── */}
        <Divider className="border-zinc-700 my-6" />
        <ContextNotesList
          notes={proj.freeFormContext}
          onChange={(notes) => updateProjectState(proj.id, { freeFormContext: notes })}
          placeholder="e.g. Led backend architecture for a fintech API handling 50k req/min. Reduced P99 latency from 800ms to 90ms..."
        />
      </Card>
    ),
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center pr-2">
        <Title level={4} className="!text-white !m-0">Projects</Title>
      </div>
      <Tabs type="editable-card" activeKey={activeTab} onChange={setActiveTab} onEdit={handleEditTabs} items={tabItems} className="profile-subtabs" />
    </div>
  );
}
