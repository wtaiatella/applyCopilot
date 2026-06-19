"use client";

import React, { useState } from "react";
import { Card, Form, Input, Button, Divider, Alert, Tooltip, Switch, Badge } from "antd";
import { 
  PlusOutlined, 
  SparklesOutlined, 
  MenuOutlined, 
  DeleteOutlined, 
  CheckOutlined 
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
import { BasicDataDTO, SummaryDTO } from "../../types/profile";
import SummaryGeneratorModal from "./SummaryGeneratorModal";

const { TextArea } = Input;

interface SortableSummaryItemProps {
  summary: SummaryDTO;
  onToggleActive: (id: string) => void;
  onDelete: (id: string) => void;
}

function SortableSummaryItem({ summary, onToggleActive, onDelete }: SortableSummaryItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: summary.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-3 p-3 bg-zinc-950/60 border rounded-lg transition-colors ${
        summary.isActive ? "border-blue-500/50 bg-blue-950/10" : "border-zinc-800"
      }`}
    >
      <div {...attributes} {...listeners} className="mt-1 cursor-grab text-zinc-500 hover:text-zinc-300">
        <MenuOutlined />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm truncate">{summary.title}</span>
          {summary.isAIGenerated && (
            <span className="text-[10px] bg-yellow-600/20 text-yellow-400 border border-yellow-800/50 px-1.5 py-0.5 rounded font-medium">
              AI
            </span>
          )}
          {summary.isActive && (
            <span className="text-[10px] bg-emerald-600/20 text-emerald-400 border border-emerald-800/50 px-1.5 py-0.5 rounded font-medium">
              Active
            </span>
          )}
        </div>
        <p className="text-zinc-400 text-xs mt-1.5 leading-relaxed whitespace-pre-wrap">{summary.content}</p>
      </div>

      <div className="flex items-center gap-3 self-center pl-2">
        <Tooltip title={summary.isActive ? "Active Summary" : "Set as Active"}>
          <Switch
            checked={summary.isActive}
            onChange={() => onToggleActive(summary.id)}
            size="small"
            checkedChildren={<CheckOutlined />}
          />
        </Tooltip>
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => onDelete(summary.id)}
          size="small"
          className="hover:bg-zinc-900"
        />
      </div>
    </div>
  );
}

interface BasicDataFormProps {
  basicData: BasicDataDTO;
  summaries: SummaryDTO[];
  updateBasicDataState: (data: Partial<BasicDataDTO> & { summaries?: SummaryDTO[] }) => void;
  form: any;
}

export default function BasicDataForm({
  basicData,
  summaries = [],
  updateBasicDataState,
  form,
}: BasicDataFormProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = summaries.findIndex((s) => s.id === active.id);
      const newIndex = summaries.findIndex((s) => s.id === over.id);
      const reordered = arrayMove(summaries, oldIndex, newIndex).map((s, idx) => ({
        ...s,
        sortOrder: idx,
      }));
      updateBasicDataState({ summaries: reordered });
    }
  };

  const handleToggleActive = (id: string) => {
    const updated = summaries.map((s) => ({
      ...s,
      isActive: s.id === id, // Set chosen as active, deactivate all others
    }));
    updateBasicDataState({ summaries: updated });
  };

  const handleDelete = (id: string) => {
    const updated = summaries.filter((s) => s.id !== id);
    // If the active summary was deleted, optionally set the first remaining summary as active
    const activeExists = updated.some((s) => s.isActive);
    if (!activeExists && updated.length > 0) {
      updated[0].isActive = true;
    }
    updateBasicDataState({ summaries: updated });
  };

  const handleAddManual = () => {
    if (!manualTitle || !manualContent) return;

    // Create a new summary with a temporary id
    const newSummary: SummaryDTO = {
      id: `temp-${Date.now()}`,
      title: manualTitle,
      content: manualContent,
      isActive: summaries.length === 0, // make active if it's the first
      isAIGenerated: false,
      sortOrder: summaries.length,
    };

    updateBasicDataState({ summaries: [...summaries, newSummary] });
    setManualTitle("");
    setManualContent("");
    setShowManualForm(false);
  };

  const handleAiSuccess = (generated: { title: string; content: string }) => {
    // Create new AI summary (automatically set as active, deactivate others)
    const newSummary: SummaryDTO = {
      id: `temp-${Date.now()}`,
      title: generated.title,
      content: generated.content,
      isActive: true,
      isAIGenerated: true,
      sortOrder: summaries.length,
    };

    const updatedSummaries = summaries.map((s) => ({ ...s, isActive: false }));
    updateBasicDataState({ summaries: [...updatedSummaries, newSummary] });
  };

  return (
    <div className="space-y-6">
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

      <Card 
        className="bg-zinc-900/50 border-zinc-800 text-white" 
        title={<span className="text-white font-semibold">Professional Summaries & Elevator Pitches</span>}
        extra={
          <div className="flex gap-2">
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => setShowManualForm(!showManualForm)}
              className="border-zinc-700 text-zinc-300 hover:text-white"
            >
              Add Pitch
            </Button>
            <Button
              type="primary"
              icon={<SparklesOutlined />}
              onClick={() => setModalOpen(true)}
              className="bg-blue-600 border-blue-600 hover:bg-blue-500"
            >
              AI Generate
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-zinc-400 text-xs">
            Manage multiple elevator pitches or profile summaries. Drag and drop to reorder them. The active summary is dynamically synced as your primary CV header summary.
          </p>

          {showManualForm && (
            <div className="bg-zinc-950/80 border border-zinc-800 p-4 rounded-lg space-y-4 animate-fadeIn">
              <span className="text-white font-semibold block text-sm">Add New Elevator Pitch</span>
              <div className="space-y-3">
                <div>
                  <label className="text-zinc-400 text-xs block mb-1">Title</label>
                  <Input
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    placeholder="e.g. Technical focus, Leadership focus, etc."
                    className="bg-zinc-900 border-zinc-800 text-white"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs block mb-1">Content</label>
                  <TextArea
                    rows={3}
                    value={manualContent}
                    onChange={(e) => setManualContent(e.target.value)}
                    placeholder="Describe your profile summary..."
                    className="bg-zinc-900 border-zinc-800 text-white"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => setShowManualForm(false)}
                    className="bg-transparent border-zinc-800 text-zinc-400"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="primary"
                    onClick={handleAddManual}
                    className="bg-blue-600 border-blue-600 hover:bg-blue-500"
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}

          {summaries.length === 0 ? (
            <div className="text-center text-zinc-600 py-6 bg-zinc-950/20 border border-dashed border-zinc-800 rounded-lg text-sm">
              No custom summaries added yet. Click "AI Generate" or "Add Pitch" above.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={summaries.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {summaries.map((s) => (
                    <SortableSummaryItem
                      key={s.id}
                      summary={s}
                      onToggleActive={handleToggleActive}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </Card>

      <SummaryGeneratorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleAiSuccess}
      />
    </div>
  );
}
