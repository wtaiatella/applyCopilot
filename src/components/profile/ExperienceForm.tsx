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
  Modal,
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
import { ExperienceDTO, BulletDTO } from "../../types/profile";
import {
  SortableBulletItem,
  ContextNotesList,
  EditableTabLabel,
} from "./shared";
import AIBulletModal from "./AIBulletModal";
import ReviewAllDrawer from "./ReviewAllDrawer";
import type { BulletSuggestion } from "../../services/profileBulletAIService";

const { Title } = Typography;

const ENTITY_TYPE = "experience" as const;

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
  const [newBulletText, setNewBulletText] = useState<{
    [expId: string]: string;
  }>({});
  const [newBulletType, setNewBulletType] = useState<{
    [expId: string]: "BULLET" | "PARAGRAPH";
  }>({});
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
    expId: string,
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
        entityId: expId,
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
    updateExperienceState(expId, { bullets: data.bullets });
  };

  const handleReviewAll = async (expId: string) => {
    setReviewAllLoadingId(expId);
    try {
      const res = await fetch("/api/profile/ai/review-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: ENTITY_TYPE, entityId: expId }),
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
      setReviewAllTargetId(expId);
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

  const handleGenerateBulletClick = async (expId: string) => {
    setAiGenerateLoadingId(expId);
    try {
      const res = await fetch("/api/profile/ai/generate-bullet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: ENTITY_TYPE, entityId: expId }),
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
      setAiModalTargetId(expId);
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

  const handleAIReviewBullet = async (expId: string, bullet: BulletDTO) => {
    setAiReviewLoadingId(bullet.id);
    try {
      const res = await fetch("/api/profile/ai/review-bullet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: ENTITY_TYPE,
          entityId: expId,
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
      setAiModalTargetId(expId);
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

  useEffect(() => {
    const n = experiences.length;
    if (n > prevLengthRef.current) {
      if (experiences[0]) setActiveTab(experiences[0].id);
    } else if (n < prevLengthRef.current) {
      if (activeTab && !experiences.some((e) => e.id === activeTab))
        setActiveTab(experiences[0]?.id);
    } else if (n > 0 && !activeTab) setActiveTab(experiences[0].id);
    prevLengthRef.current = n;
  }, [experiences, activeTab]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleBulletDragEnd = (expId: string, event: DragEndEvent) => {
    const { active, over } = event;
    const exp = experiences.find((e) => e.id === expId);
    if (!exp || !over || active.id === over.id) return;
    const oldIndex = exp.bullets.findIndex((b) => b.id === active.id);
    const newIndex = exp.bullets.findIndex((b) => b.id === over.id);
    updateExperienceState(expId, {
      bullets: arrayMove(exp.bullets, oldIndex, newIndex).map((b, i) => ({
        ...b,
        sortOrder: i,
      })),
    });
  };

  const handleUpdateBullet = (
    expId: string,
    bulletId: string,
    data: Partial<BulletDTO>,
  ) => {
    const exp = experiences.find((e) => e.id === expId);
    if (!exp) return;
    updateExperienceState(expId, {
      bullets: exp.bullets.map((b) =>
        b.id === bulletId ? { ...b, ...data } : b,
      ),
    });
  };

  const handleDeleteBullet = (expId: string, bulletId: string) => {
    const exp = experiences.find((e) => e.id === expId);
    if (!exp) return;
    updateExperienceState(expId, {
      bullets: exp.bullets.filter((b) => b.id !== bulletId),
    });
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
        {
          id: `temp-${Date.now()}`,
          text: text.trim(),
          isActive: true,
          isArchived: false,
          type,
          sortOrder: exp.bullets.length,
          usedInCVs: [],
        },
      ],
    });
    setNewBulletText({ ...newBulletText, [expId]: "" });
  };

  const handleDeleteExperience = (expId: string, label: string) => {
    Modal.confirm({
      title: "Delete experience?",
      content: `This will permanently delete "${label}" and all its bullets.`,
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: () => deleteExperience(expId),
    });
  };

  if (experiences.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Title level={4} className="!text-white !m-0">
            Work Experience
          </Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={addExperience}
          >
            Add Experience
          </Button>
        </div>
        <div className="text-center text-zinc-500 py-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-lg">
          No work experiences added yet. Click &quot;Add Experience&quot; to
          start.
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
        onSave={(val) =>
          updateExperienceState(exp.id, { tabLabel: val || null })
        }
      />
    ),
    children: (
      <Card
        className="bg-zinc-900/50 border-zinc-800 text-white mt-2"
        title={
          <span className="text-white font-semibold">Edit Work Experience</span>
        }
      >
        {/* ── Fields ── */}
        <Form
          layout="vertical"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <Form.Item label={<span className="text-zinc-300">Company</span>}>
            <Input
              value={exp.company}
              onChange={(e) =>
                updateExperienceState(exp.id, { company: e.target.value })
              }
              className="bg-zinc-950 border-zinc-800 text-white"
            />
          </Form.Item>
          <Form.Item label={<span className="text-zinc-300">Position</span>}>
            <Input
              value={exp.position}
              onChange={(e) =>
                updateExperienceState(exp.id, { position: e.target.value })
              }
              className="bg-zinc-950 border-zinc-800 text-white"
            />
          </Form.Item>
          {/* FR-03: month picker with MMM YYYY display format */}
          <Form.Item label={<span className="text-zinc-300">Start Date</span>}>
            <DatePicker
              value={exp.startDate ? dayjs(exp.startDate) : null}
              onChange={(date) =>
                updateExperienceState(exp.id, {
                  startDate: date
                    ? date.toISOString()
                    : new Date().toISOString(),
                })
              }
              format="MMM YYYY"
              picker="month"
              className="w-full bg-zinc-950 border-zinc-800 text-white"
            />
          </Form.Item>
          <Form.Item label={<span className="text-zinc-300">End Date</span>}>
            <DatePicker
              value={exp.endDate ? dayjs(exp.endDate) : null}
              disabled={exp.current}
              onChange={(date) =>
                updateExperienceState(exp.id, {
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
              checked={exp.current}
              onChange={(e) => {
                const checked = e.target.checked;
                updateExperienceState(exp.id, {
                  current: checked,
                  endDate: checked ? null : exp.endDate,
                });
              }}
              className="text-zinc-300"
            >
              I currently work here
            </Checkbox>
          </Form.Item>
        </Form>

        {/* ── Key Achievements & Responsibilities ── */}
        <Divider className="border-zinc-800 my-6" />
        <div className="space-y-4">
          {/* Header with Review All button (wired in Phase 4, T025) */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-white font-semibold block text-sm">
                Key Achievements &amp; Responsibilities
              </span>
              <span className="text-zinc-500 text-xs">
                Each item renders as a bullet (•) or paragraph (¶) on the final
                CV. Click • or ¶ to toggle. Toggle Active to include/exclude.
              </span>
            </div>
            <Button
              type="dashed"
              icon={<StarOutlined />}
              loading={reviewAllLoadingId === exp.id}
              onClick={() => handleReviewAll(exp.id)}
              className="border-violet-700/60 text-violet-400 hover:border-violet-500"
            >
              Review All
            </Button>
          </div>

          {/* Bullet list — DnD list rendered FIRST (FR-02) */}
          {exp.bullets.length === 0 ? (
            <div className="text-center text-zinc-600 py-4 bg-zinc-950/20 border border-dashed border-zinc-800 rounded text-xs">
              No bullets yet. Type below and press Add or Enter.
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
                      onUpdate={(bId, data) =>
                        handleUpdateBullet(exp.id, bId, data)
                      }
                      onDelete={(bId) => handleDeleteBullet(exp.id, bId)}
                      showAIReview={true}
                      onAIReview={(bullet) =>
                        handleAIReviewBullet(exp.id, bullet)
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
              value={newBulletText[exp.id] || ""}
              onChange={(e) =>
                setNewBulletText({ ...newBulletText, [exp.id]: e.target.value })
              }
              onPressEnter={() => handleAddBullet(exp.id)}
              placeholder="Describe an achievement or responsibility..."
              className="bg-zinc-950 border-zinc-800 text-white"
            />
            {/* Type toggle for new bullet — button style (AC-01) */}
            <Button
              type="text"
              onClick={() =>
                setNewBulletType({
                  ...newBulletType,
                  [exp.id]:
                    (newBulletType[exp.id] || "BULLET") === "BULLET"
                      ? "PARAGRAPH"
                      : "BULLET",
                })
              }
              className="shrink-0 text-zinc-400 hover:text-white border border-zinc-700 font-bold px-3"
              title={`Currently ${(newBulletType[exp.id] || "BULLET") === "BULLET" ? "Bullet (•)" : "Paragraph (¶)"} — click to toggle`}
            >
              {(newBulletType[exp.id] || "BULLET") === "BULLET" ? "•" : "¶"}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleAddBullet(exp.id)}
              className="bg-blue-600 border-blue-600 hover:bg-blue-500"
            >
              Add
            </Button>
            <Tooltip
              title={
                (exp.freeFormContext || []).length === 0
                  ? "Add AI Context Notes first to generate new bullets."
                  : undefined
              }
            >
              <Button
                icon={<StarOutlined />}
                loading={aiGenerateLoadingId === exp.id}
                disabled={(exp.freeFormContext || []).length === 0}
                onClick={() => handleGenerateBulletClick(exp.id)}
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
          notes={exp.freeFormContext}
          onChange={(notes) =>
            updateExperienceState(exp.id, { freeFormContext: notes })
          }
          placeholder="e.g. Led a cross-functional migration from monolith to microservices, reduced deploy time from 2h to 12min..."
        />

        {/* ── Delete Experience ── (FR-04: footer button instead of tab ×) */}
        <Divider className="border-zinc-800 mt-6 mb-4" />
        <div className="flex justify-end">
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() =>
              handleDeleteExperience(exp.id, exp.tabLabel || exp.company)
            }
          >
            Delete this experience
          </Button>
        </div>
      </Card>
    ),
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Title level={4} className="!text-white !m-0">
          Work Experiences
        </Title>
        {/* FR-04: standalone Add button — not inside editable-card */}
        <Button type="dashed" icon={<PlusOutlined />} onClick={addExperience}>
          Add Experience
        </Button>
      </div>
      {/* FR-04: standard Tabs (no type="editable-card", no onEdit handler) */}
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
