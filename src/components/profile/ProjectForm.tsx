"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  Form,
  Input,
  Button,
  DatePicker,
  Checkbox,
  Tabs,
  Typography,
  Divider,
  Select,
  Modal,
  Spin,
  Tooltip,
} from "antd";
import { PlusOutlined, DeleteOutlined, StarOutlined } from "@ant-design/icons";
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
} from "@dnd-kit/sortable";
import dayjs from "dayjs";
import { ProjectDTO, BulletDTO } from "../../types/profile";
import {
  SortableBulletItem,
  ContextNotesList,
  EditableTabLabel,
} from "./shared";
import AIBulletModal from "./AIBulletModal";
import ReviewAllDrawer from "./ReviewAllDrawer";
import type { BulletSuggestion } from "../../services/profileBulletAIService";

const { Title } = Typography;
const { Option } = Select;

const ENTITY_TYPE = "project" as const;

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
  const [newBulletText, setNewBulletText] = useState<{
    [projId: string]: string;
  }>({});
  const [newBulletType, setNewBulletType] = useState<{
    [projId: string]: "BULLET" | "PARAGRAPH";
  }>({});
  const [suggestingFor, setSuggestingFor] = useState<string | null>(null);
  const prevLengthRef = useRef(0);

  // ── AI: Review All (Botão 1) ──────────────────────────────────
  const [reviewAllLoadingId, setReviewAllLoadingId] = useState<string | null>(
    null,
  );
  const [reviewAllTargetId, setReviewAllTargetId] = useState<string | null>(
    null,
  );
  const [reviewAllSuggestions, setReviewAllSuggestions] = useState<
    BulletSuggestion[]
  >([]);
  const [reviewAllOpen, setReviewAllOpen] = useState(false);

  // ── AI: Add with AI (Botão 2) / per-bullet AI Review (Botão 3) ──
  const [aiGenerateLoadingId, setAiGenerateLoadingId] = useState<string | null>(
    null,
  );
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalMode, setAiModalMode] = useState<"generate" | "review">(
    "generate",
  );
  const [aiModalTargetId, setAiModalTargetId] = useState<string | null>(null);
  const [aiModalBulletId, setAiModalBulletId] = useState<string | null>(null);
  const [aiModalText, setAiModalText] = useState("");
  const [aiModalOriginalText, setAiModalOriginalText] = useState<
    string | undefined
  >(undefined);
  const [aiReviewLoadingId, setAiReviewLoadingId] = useState<string | null>(
    null,
  );

  const acceptSuggestion = async (
    projId: string,
    payload:
      | { action: "rewrite"; bulletId: string; newText: string }
      | { action: "merge"; bulletIds: string[]; combinedText: string }
      | { action: "new" | "generate"; text: string },
  ) => {
    const res = await fetch("/api/profile/ai/accept-suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: ENTITY_TYPE,
        entityId: projId,
        ...payload,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        (err as { error?: string }).error || "Failed to save AI suggestion",
      );
    }
    const data = (await res.json()) as { bullets: BulletDTO[] };
    updateProjectState(projId, { bullets: data.bullets });
  };

  const handleReviewAll = async (projId: string) => {
    setReviewAllLoadingId(projId);
    try {
      const res = await fetch("/api/profile/ai/review-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: ENTITY_TYPE, entityId: projId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Modal.error({
          title: "Could not run Review All",
          content: (err as { error?: string }).error || "Unknown error",
        });
        return;
      }
      const data = (await res.json()) as { suggestions: BulletSuggestion[] };
      setReviewAllTargetId(projId);
      setReviewAllSuggestions(data.suggestions || []);
      setReviewAllOpen(true);
    } catch {
      Modal.error({
        title: "Could not run Review All",
        content: "Network error. Please try again.",
      });
    } finally {
      setReviewAllLoadingId(null);
    }
  };

  const handleReviewAllDrawerAccept = async (
    suggestion: BulletSuggestion,
    editedText?: string,
  ) => {
    if (!reviewAllTargetId) return;
    try {
      if (suggestion.type === "REWRITE") {
        await acceptSuggestion(reviewAllTargetId, {
          action: "rewrite",
          bulletId: suggestion.bulletId,
          newText: editedText ?? suggestion.revisedText,
        });
      } else if (suggestion.type === "MERGE") {
        await acceptSuggestion(reviewAllTargetId, {
          action: "merge",
          bulletIds: suggestion.bulletIds,
          combinedText: editedText ?? suggestion.combinedText,
        });
      } else {
        await acceptSuggestion(reviewAllTargetId, {
          action: "new",
          text: editedText ?? suggestion.text,
        });
      }
    } catch (err) {
      Modal.error({
        title: "Could not accept suggestion",
        content: err instanceof Error ? err.message : "Unknown error",
      });
      throw err;
    }
  };

  const handleReviewAllDrawerAcceptAll = async () => {
    if (!reviewAllTargetId) return;
    const targetId = reviewAllTargetId;
    for (const suggestion of reviewAllSuggestions) {
      try {
        if (suggestion.type === "REWRITE") {
          await acceptSuggestion(targetId, {
            action: "rewrite",
            bulletId: suggestion.bulletId,
            newText: suggestion.revisedText,
          });
        } else if (suggestion.type === "MERGE") {
          await acceptSuggestion(targetId, {
            action: "merge",
            bulletIds: suggestion.bulletIds,
            combinedText: suggestion.combinedText,
          });
        } else {
          await acceptSuggestion(targetId, {
            action: "new",
            text: suggestion.text,
          });
        }
      } catch (err) {
        console.error("Failed to accept suggestion during Accept All", err);
      }
    }
  };

  const handleGenerateBulletClick = async (projId: string) => {
    setAiGenerateLoadingId(projId);
    try {
      const res = await fetch("/api/profile/ai/generate-bullet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: ENTITY_TYPE, entityId: projId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if ((err as { error?: string }).error === "AI_CONTEXT_REQUIRED") {
          Modal.error({
            title: "AI Context Notes required",
            content: "Add AI Context Notes first to generate new bullets.",
          });
        } else {
          Modal.error({
            title: "Could not generate bullet",
            content: (err as { error?: string }).error || "Unknown error",
          });
        }
        return;
      }
      const data = (await res.json()) as { text: string };
      setAiModalMode("generate");
      setAiModalTargetId(projId);
      setAiModalBulletId(null);
      setAiModalText(data.text);
      setAiModalOriginalText(undefined);
      setAiModalOpen(true);
    } catch {
      Modal.error({
        title: "Could not generate bullet",
        content: "Network error. Please try again.",
      });
    } finally {
      setAiGenerateLoadingId(null);
    }
  };

  const handleAIReviewBullet = async (projId: string, bullet: BulletDTO) => {
    setAiReviewLoadingId(bullet.id);
    try {
      const res = await fetch("/api/profile/ai/review-bullet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: ENTITY_TYPE,
          entityId: projId,
          bulletId: bullet.id,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Modal.error({
          title: "Could not review bullet",
          content: (err as { error?: string }).error || "Unknown error",
        });
        return;
      }
      const data = (await res.json()) as { revisedText: string };
      setAiModalMode("review");
      setAiModalTargetId(projId);
      setAiModalBulletId(bullet.id);
      setAiModalText(data.revisedText);
      setAiModalOriginalText(bullet.text);
      setAiModalOpen(true);
    } catch {
      Modal.error({
        title: "Could not review bullet",
        content: "Network error. Please try again.",
      });
    } finally {
      setAiReviewLoadingId(null);
    }
  };

  const handleAiModalRegenerate = async (comment: string): Promise<string> => {
    if (!aiModalTargetId) return "";
    if (aiModalMode === "generate") {
      const res = await fetch("/api/profile/ai/generate-bullet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: ENTITY_TYPE,
          entityId: aiModalTargetId,
          userComment: comment || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error || "Failed to regenerate",
        );
      }
      const data = (await res.json()) as { text: string };
      return data.text;
    }
    if (!aiModalBulletId) return "";
    const res = await fetch("/api/profile/ai/review-bullet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: ENTITY_TYPE,
        entityId: aiModalTargetId,
        bulletId: aiModalBulletId,
        userComment: comment || undefined,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        (err as { error?: string }).error || "Failed to regenerate",
      );
    }
    const data = (await res.json()) as { revisedText: string };
    return data.revisedText;
  };

  const handleAiModalAccept = async (text: string) => {
    if (!aiModalTargetId) return;
    if (aiModalMode === "generate") {
      await acceptSuggestion(aiModalTargetId, { action: "generate", text });
    } else {
      if (!aiModalBulletId) return;
      await acceptSuggestion(aiModalTargetId, {
        action: "rewrite",
        bulletId: aiModalBulletId,
        newText: text,
      });
    }
  };

  const handleAiModalClose = () => {
    setAiModalOpen(false);
    setAiModalTargetId(null);
    setAiModalBulletId(null);
    setAiModalText("");
    setAiModalOriginalText(undefined);
  };

  const isEmptyProject = (proj: ProjectDTO) =>
    proj.name === "New Project" &&
    proj.bullets.length === 0 &&
    proj.technologies.length === 0 &&
    (!proj.freeFormContext || proj.freeFormContext.length === 0);

  const handleSuggest = async (projId: string) => {
    setSuggestingFor(projId);
    try {
      const res = await fetch("/api/profile/projects/suggest", {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        Modal.error({
          title: "Could not generate suggestion",
          content: (err as { error?: string }).error || "Unknown error",
        });
        return;
      }
      const suggestion = (await res.json()) as {
        name?: string;
        technologies?: string[];
        bullets?: Array<{ text: string; type: string }>;
        freeFormContext?: string[];
      };
      updateProjectState(projId, {
        name: suggestion.name || "New Project",
        technologies: suggestion.technologies || [],
        bullets: (suggestion.bullets || []).map((b, idx) => ({
          id: `temp-${Date.now()}-${idx}`,
          text: b.text,
          isActive: true,
          isArchived: false,
          type: (b.type as "BULLET" | "PARAGRAPH") || "BULLET",
          sortOrder: idx,
          usedInCVs: [],
        })),
        freeFormContext: suggestion.freeFormContext || [],
      });
    } catch {
      Modal.error({
        title: "Could not generate suggestion",
        content: "Network error. Please try again.",
      });
    } finally {
      setSuggestingFor(null);
    }
  };

  useEffect(() => {
    const n = projects.length;
    if (n > prevLengthRef.current) {
      if (projects[0]) setActiveTab(projects[0].id);
    } else if (n < prevLengthRef.current) {
      if (activeTab && !projects.some((e) => e.id === activeTab))
        setActiveTab(projects[0]?.id);
    } else if (n > 0 && !activeTab) setActiveTab(projects[0].id);
    prevLengthRef.current = n;
  }, [projects, activeTab]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleBulletDragEnd = (projId: string, event: DragEndEvent) => {
    const { active, over } = event;
    const proj = projects.find((e) => e.id === projId);
    if (!proj || !over || active.id === over.id) return;
    const oldIndex = proj.bullets.findIndex((b) => b.id === active.id);
    const newIndex = proj.bullets.findIndex((b) => b.id === over.id);
    updateProjectState(projId, {
      bullets: arrayMove(proj.bullets, oldIndex, newIndex).map((b, i) => ({
        ...b,
        sortOrder: i,
      })),
    });
  };

  const handleUpdateBullet = (
    projId: string,
    bulletId: string,
    data: Partial<BulletDTO>,
  ) => {
    const proj = projects.find((e) => e.id === projId);
    if (!proj) return;
    updateProjectState(projId, {
      bullets: proj.bullets.map((b) =>
        b.id === bulletId ? { ...b, ...data } : b,
      ),
    });
  };

  const handleDeleteBullet = (projId: string, bulletId: string) => {
    const proj = projects.find((e) => e.id === projId);
    if (!proj) return;
    updateProjectState(projId, {
      bullets: proj.bullets.filter((b) => b.id !== bulletId),
    });
  };

  const handleAddBullet = (projId: string) => {
    const text = newBulletText[projId] || "";
    if (!text.trim()) return;
    const proj = projects.find((e) => e.id === projId);
    if (!proj) return;
    const type = newBulletType[projId] || "BULLET";
    updateProjectState(projId, {
      bullets: [
        ...proj.bullets,
        {
          id: `temp-${Date.now()}`,
          text: text.trim(),
          isActive: true,
          isArchived: false,
          type,
          sortOrder: proj.bullets.length,
          usedInCVs: [],
        },
      ],
    });
    setNewBulletText({ ...newBulletText, [projId]: "" });
  };

  const handleDeleteProject = (projId: string, label: string) => {
    Modal.confirm({
      title: "Delete project?",
      content: `This will permanently delete "${label}" and all its bullets.`,
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: () => deleteProject(projId),
    });
  };

  if (projects.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Title level={4} className="!text-white !m-0">
            Projects
          </Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={addProject}>
            Add Project
          </Button>
        </div>
        <div className="text-center text-zinc-500 py-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-lg">
          No projects added yet. Click &quot;Add Project&quot; to start.
        </div>
      </div>
    );
  }

  const tabItems = projects.map((proj) => ({
    key: proj.id,
    label: (
      <EditableTabLabel
        value={proj.tabLabel || ""}
        fallback={proj.name}
        onSave={(val) => updateProjectState(proj.id, { tabLabel: val || null })}
      />
    ),
    children: (
      <Card
        className="bg-zinc-900/50 border-zinc-800 text-white mt-2"
        title={<span className="text-white font-semibold">Edit Project</span>}
        extra={
          isEmptyProject(proj) ? (
            <Button
              size="small"
              icon={
                suggestingFor === proj.id ? (
                  <Spin size="small" />
                ) : (
                  <StarOutlined />
                )
              }
              disabled={!!suggestingFor}
              onClick={() => handleSuggest(proj.id)}
              className="border-amber-700/60 text-amber-400 hover:border-amber-500 hover:text-amber-300"
            >
              {suggestingFor === proj.id
                ? "Generating..."
                : "Suggest from my experiences"}
            </Button>
          ) : null
        }
      >
        {/* ── Fields ── */}
        <Form
          layout="vertical"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <Form.Item
            label={<span className="text-zinc-300">Project Name</span>}
            className="col-span-1 md:col-span-2"
          >
            <Input
              value={proj.name}
              onChange={(e) =>
                updateProjectState(proj.id, { name: e.target.value })
              }
              className="bg-zinc-950 border-zinc-800 text-white"
            />
          </Form.Item>
          {/* FR-03: month picker */}
          <Form.Item label={<span className="text-zinc-300">Start Date</span>}>
            <DatePicker
              value={proj.startDate ? dayjs(proj.startDate) : null}
              onChange={(date) =>
                updateProjectState(proj.id, {
                  startDate: date ? date.toISOString() : null,
                })
              }
              format="MMM YYYY"
              picker="month"
              className="w-full bg-zinc-950 border-zinc-800 text-white"
            />
          </Form.Item>
          <Form.Item label={<span className="text-zinc-300">End Date</span>}>
            <DatePicker
              value={proj.endDate ? dayjs(proj.endDate) : null}
              disabled={proj.current}
              onChange={(date) =>
                updateProjectState(proj.id, {
                  endDate: date ? date.toISOString() : null,
                })
              }
              format="MMM YYYY"
              picker="month"
              className="w-full bg-zinc-950 border-zinc-800 text-white"
            />
          </Form.Item>
          <Form.Item className="col-span-1 md:col-span-2">
            <Checkbox
              checked={proj.current}
              onChange={(e) => {
                const c = e.target.checked;
                updateProjectState(proj.id, {
                  current: c,
                  endDate: c ? null : proj.endDate,
                });
              }}
              className="text-zinc-300"
            >
              This project is currently ongoing
            </Checkbox>
          </Form.Item>
          <Form.Item
            label={<span className="text-zinc-300">Technologies</span>}
            className="col-span-1 md:col-span-2"
          >
            <Select
              mode="tags"
              style={{ width: "100%" }}
              placeholder="Select or type technologies used"
              value={proj.technologies}
              onChange={(techs) =>
                updateProjectState(proj.id, { technologies: techs })
              }
              className="bg-zinc-950 border-zinc-800 text-white"
            >
              {proj.technologies.map((t) => (
                <Option key={t} value={t}>
                  {t}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Form>

        {/* ── Contributions & Accomplishments ── */}
        <Divider className="border-zinc-800 my-6" />
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-white font-semibold block text-sm">
                Contributions &amp; Accomplishments
              </span>
              <span className="text-zinc-500 text-xs">
                Each item renders as a bullet (•) or paragraph (¶). Click • or ¶
                to toggle. Toggle Active to include/exclude.
              </span>
            </div>
            <Button
              type="dashed"
              icon={<StarOutlined />}
              loading={reviewAllLoadingId === proj.id}
              onClick={() => handleReviewAll(proj.id)}
              className="border-violet-700/60 text-violet-400 hover:border-violet-500"
            >
              Review All
            </Button>
          </div>

          {/* Bullet list — DnD list FIRST (FR-02) */}
          {proj.bullets.length === 0 ? (
            <div className="text-center text-zinc-600 py-4 bg-zinc-950/20 border border-dashed border-zinc-800 rounded text-xs">
              No project highlights added. Type below to add contributions.
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
                      onUpdate={(bId, data) =>
                        handleUpdateBullet(proj.id, bId, data)
                      }
                      onDelete={(bId) => handleDeleteBullet(proj.id, bId)}
                      showAIReview={true}
                      onAIReview={(bullet) =>
                        handleAIReviewBullet(proj.id, bullet)
                      }
                      aiReviewLoading={aiReviewLoadingId === b.id}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* Add bullet row — AFTER the list (FR-02) */}
          <div className="flex gap-2 mt-3">
            <Input
              value={newBulletText[proj.id] || ""}
              onChange={(e) =>
                setNewBulletText({
                  ...newBulletText,
                  [proj.id]: e.target.value,
                })
              }
              onPressEnter={() => handleAddBullet(proj.id)}
              placeholder="Describe a contribution or technical achievement..."
              className="bg-zinc-950 border-zinc-800 text-white"
            />
            <Button
              type="text"
              onClick={() =>
                setNewBulletType({
                  ...newBulletType,
                  [proj.id]:
                    (newBulletType[proj.id] || "BULLET") === "BULLET"
                      ? "PARAGRAPH"
                      : "BULLET",
                })
              }
              className="shrink-0 text-zinc-400 hover:text-white border border-zinc-700 font-bold px-3"
              title={`Currently ${(newBulletType[proj.id] || "BULLET") === "BULLET" ? "Bullet (•)" : "Paragraph (¶)"} — click to toggle`}
            >
              {(newBulletType[proj.id] || "BULLET") === "BULLET" ? "•" : "¶"}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleAddBullet(proj.id)}
              className="bg-blue-600 border-blue-600 hover:bg-blue-500"
            >
              Add
            </Button>
            <Tooltip
              title={
                (proj.freeFormContext || []).length === 0
                  ? "Add AI Context Notes first to generate new bullets."
                  : undefined
              }
            >
              <Button
                icon={<StarOutlined />}
                loading={aiGenerateLoadingId === proj.id}
                disabled={(proj.freeFormContext || []).length === 0}
                onClick={() => handleGenerateBulletClick(proj.id)}
                className="border-violet-700 text-violet-400"
              >
                AI
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* ── AI Context Notes ── */}
        <Divider className="border-zinc-700 my-6" />
        <ContextNotesList
          notes={proj.freeFormContext}
          onChange={(notes) =>
            updateProjectState(proj.id, { freeFormContext: notes })
          }
          placeholder="e.g. Led backend architecture for a fintech API handling 50k req/min. Reduced P99 latency from 800ms to 90ms..."
        />

        {/* ── Delete Project ── (FR-04: footer button) */}
        <Divider className="border-zinc-800 mt-6 mb-4" />
        <div className="flex justify-end">
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() =>
              handleDeleteProject(proj.id, proj.tabLabel || proj.name)
            }
          >
            Delete this project
          </Button>
        </div>
      </Card>
    ),
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Title level={4} className="!text-white !m-0">
          Projects
        </Title>
        <Button type="dashed" icon={<PlusOutlined />} onClick={addProject}>
          Add Project
        </Button>
      </div>
      {/* FR-04: standard Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        className="profile-subtabs"
      />

      <ReviewAllDrawer
        open={reviewAllOpen}
        onClose={() => setReviewAllOpen(false)}
        suggestions={reviewAllSuggestions}
        onAccept={handleReviewAllDrawerAccept}
        onSkip={() => {}}
        onAcceptAll={handleReviewAllDrawerAcceptAll}
      />

      <AIBulletModal
        open={aiModalOpen}
        mode={aiModalMode}
        initialText={aiModalText}
        originalText={aiModalOriginalText}
        onClose={handleAiModalClose}
        onAccept={handleAiModalAccept}
        onRegenerate={handleAiModalRegenerate}
      />
    </div>
  );
}
