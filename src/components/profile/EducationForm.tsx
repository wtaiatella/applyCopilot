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
import { EducationDTO, BulletDTO } from "../../types/profile";
import {
  SortableBulletItem,
  ContextNotesList,
  EditableTabLabel,
} from "./shared";
import AIBulletModal from "./AIBulletModal";
import ReviewAllDrawer from "./ReviewAllDrawer";
import type { BulletSuggestion } from "../../services/profileBulletAIService";

const { Title } = Typography;

const ENTITY_TYPE = "education" as const;

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
  const [newBulletText, setNewBulletText] = useState<{
    [edId: string]: string;
  }>({});
  const [newBulletType, setNewBulletType] = useState<{
    [edId: string]: "BULLET" | "PARAGRAPH";
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
    edId: string,
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
        entityId: edId,
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
    updateEducationState(edId, { bullets: data.bullets });
  };

  const handleReviewAll = async (edId: string) => {
    setReviewAllLoadingId(edId);
    try {
      const res = await fetch("/api/profile/ai/review-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: ENTITY_TYPE, entityId: edId }),
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
      setReviewAllTargetId(edId);
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

  const handleGenerateBulletClick = async (edId: string) => {
    setAiGenerateLoadingId(edId);
    try {
      const res = await fetch("/api/profile/ai/generate-bullet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: ENTITY_TYPE, entityId: edId }),
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
      setAiModalTargetId(edId);
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

  const handleAIReviewBullet = async (edId: string, bullet: BulletDTO) => {
    setAiReviewLoadingId(bullet.id);
    try {
      const res = await fetch("/api/profile/ai/review-bullet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: ENTITY_TYPE,
          entityId: edId,
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
      setAiModalTargetId(edId);
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
    const n = education.length;
    if (n > prevLengthRef.current) {
      if (education[0]) setActiveTab(education[0].id);
    } else if (n < prevLengthRef.current) {
      if (activeTab && !education.some((e) => e.id === activeTab))
        setActiveTab(education[0]?.id);
    } else if (n > 0 && !activeTab) setActiveTab(education[0].id);
    prevLengthRef.current = n;
  }, [education, activeTab]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleBulletDragEnd = (edId: string, event: DragEndEvent) => {
    const { active, over } = event;
    const ed = education.find((e) => e.id === edId);
    if (!ed || !over || active.id === over.id) return;
    const oldIndex = ed.bullets.findIndex((b) => b.id === active.id);
    const newIndex = ed.bullets.findIndex((b) => b.id === over.id);
    updateEducationState(edId, {
      bullets: arrayMove(ed.bullets, oldIndex, newIndex).map((b, i) => ({
        ...b,
        sortOrder: i,
      })),
    });
  };

  const handleUpdateBullet = (
    edId: string,
    bulletId: string,
    data: Partial<BulletDTO>,
  ) => {
    const ed = education.find((e) => e.id === edId);
    if (!ed) return;
    updateEducationState(edId, {
      bullets: ed.bullets.map((b) =>
        b.id === bulletId ? { ...b, ...data } : b,
      ),
    });
  };

  const handleDeleteBullet = (edId: string, bulletId: string) => {
    const ed = education.find((e) => e.id === edId);
    if (!ed) return;
    updateEducationState(edId, {
      bullets: ed.bullets.filter((b) => b.id !== bulletId),
    });
  };

  const handleAddBullet = (edId: string) => {
    const text = newBulletText[edId] || "";
    if (!text.trim()) return;
    const ed = education.find((e) => e.id === edId);
    if (!ed) return;
    const type = newBulletType[edId] || "BULLET";
    updateEducationState(edId, {
      bullets: [
        ...ed.bullets,
        {
          id: `temp-${Date.now()}`,
          text: text.trim(),
          isActive: true,
          isArchived: false,
          type,
          sortOrder: ed.bullets.length,
          usedInCVs: [],
        },
      ],
    });
    setNewBulletText({ ...newBulletText, [edId]: "" });
  };

  const handleDeleteEducation = (edId: string, label: string) => {
    Modal.confirm({
      title: "Delete education entry?",
      content: `This will permanently delete "${label}" and all its bullets.`,
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: () => deleteEducation(edId),
    });
  };

  if (education.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Title level={4} className="!text-white !m-0">
            Education
          </Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={addEducation}>
            Add Education
          </Button>
        </div>
        <div className="text-center text-zinc-500 py-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-lg">
          No education entries added yet. Click &quot;Add Education&quot; to
          start.
        </div>
      </div>
    );
  }

  const tabItems = education.map((ed) => ({
    key: ed.id,
    label: (
      <EditableTabLabel
        value={ed.tabLabel || ""}
        fallback={ed.institution}
        onSave={(val) => updateEducationState(ed.id, { tabLabel: val || null })}
      />
    ),
    children: (
      <Card
        className="bg-zinc-900/50 border-zinc-800 text-white mt-2"
        title={<span className="text-white font-semibold">Edit Education</span>}
      >
        <Form
          layout="vertical"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <Form.Item label={<span className="text-zinc-300">Institution</span>}>
            <Input
              value={ed.institution}
              onChange={(e) =>
                updateEducationState(ed.id, { institution: e.target.value })
              }
              className="bg-zinc-950 border-zinc-800 text-white"
            />
          </Form.Item>
          <Form.Item label={<span className="text-zinc-300">Degree</span>}>
            <Input
              value={ed.degree}
              onChange={(e) =>
                updateEducationState(ed.id, { degree: e.target.value })
              }
              className="bg-zinc-950 border-zinc-800 text-white"
            />
          </Form.Item>
          <Form.Item
            label={<span className="text-zinc-300">Field of Study</span>}
          >
            <Input
              value={ed.fieldOfStudy || ""}
              onChange={(e) =>
                updateEducationState(ed.id, {
                  fieldOfStudy: e.target.value || null,
                })
              }
              className="bg-zinc-950 border-zinc-800 text-white"
              placeholder="e.g. Computer Science"
            />
          </Form.Item>
          <div className="grid grid-cols-2 gap-2">
            {/* FR-03: month picker */}
            <Form.Item
              label={<span className="text-zinc-300">Start Date</span>}
            >
              <DatePicker
                value={ed.startDate ? dayjs(ed.startDate) : null}
                onChange={(date) =>
                  updateEducationState(ed.id, {
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
                value={ed.endDate ? dayjs(ed.endDate) : null}
                disabled={ed.current}
                onChange={(date) =>
                  updateEducationState(ed.id, {
                    endDate: date ? date.toISOString() : null,
                  })
                }
                format="MMM YYYY"
                picker="month"
                className="w-full bg-zinc-950 border-zinc-800 text-white"
              />
            </Form.Item>
          </div>
          <div className="col-span-1 md:col-span-2 flex flex-col sm:flex-row gap-4">
            <Form.Item className="!mb-0">
              <Checkbox
                checked={ed.current}
                onChange={(e) => {
                  const c = e.target.checked;
                  updateEducationState(ed.id, {
                    current: c,
                    endDate: c ? null : ed.endDate,
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
                onChange={(e) =>
                  updateEducationState(ed.id, { hideEndDate: e.target.checked })
                }
                className="text-zinc-300"
              >
                Hide end date on generated CVs
              </Checkbox>
            </Form.Item>
          </div>
        </Form>

        <Divider className="border-zinc-800 my-6" />
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-white font-semibold block text-sm">
                Activities &amp; Highlights
              </span>
              <span className="text-zinc-500 text-xs">
                Each item renders as a bullet (•) or paragraph (¶). Click • or ¶
                to toggle. Toggle Active to include/exclude.
              </span>
            </div>
            <Button
              type="dashed"
              icon={<StarOutlined />}
              loading={reviewAllLoadingId === ed.id}
              onClick={() => handleReviewAll(ed.id)}
              className="border-violet-700/60 text-violet-400 hover:border-violet-500"
            >
              Review All
            </Button>
          </div>

          {/* Bullet list — DnD list FIRST (FR-02) */}
          {ed.bullets.length === 0 ? (
            <div className="text-center text-zinc-600 py-4 bg-zinc-950/20 border border-dashed border-zinc-800 rounded text-xs">
              No highlights added. Type below to add details.
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
                      onUpdate={(bId, data) =>
                        handleUpdateBullet(ed.id, bId, data)
                      }
                      onDelete={(bId) => handleDeleteBullet(ed.id, bId)}
                      showAIReview={true}
                      onAIReview={(bullet) =>
                        handleAIReviewBullet(ed.id, bullet)
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
              value={newBulletText[ed.id] || ""}
              onChange={(e) =>
                setNewBulletText({ ...newBulletText, [ed.id]: e.target.value })
              }
              onPressEnter={() => handleAddBullet(ed.id)}
              placeholder="Add an activity, thesis topic, or relevant course..."
              className="bg-zinc-950 border-zinc-800 text-white"
            />
            <Button
              type="text"
              onClick={() =>
                setNewBulletType({
                  ...newBulletType,
                  [ed.id]:
                    (newBulletType[ed.id] || "BULLET") === "BULLET"
                      ? "PARAGRAPH"
                      : "BULLET",
                })
              }
              className="shrink-0 text-zinc-400 hover:text-white border border-zinc-700 font-bold px-3"
              title={`Currently ${(newBulletType[ed.id] || "BULLET") === "BULLET" ? "Bullet (•)" : "Paragraph (¶)"} — click to toggle`}
            >
              {(newBulletType[ed.id] || "BULLET") === "BULLET" ? "•" : "¶"}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleAddBullet(ed.id)}
              className="bg-blue-600 border-blue-600 hover:bg-blue-500"
            >
              Add
            </Button>
            <Tooltip
              title={
                (ed.freeFormContext || []).length === 0
                  ? "Add AI Context Notes first to generate new bullets."
                  : undefined
              }
            >
              <Button
                icon={<StarOutlined />}
                loading={aiGenerateLoadingId === ed.id}
                disabled={(ed.freeFormContext || []).length === 0}
                onClick={() => handleGenerateBulletClick(ed.id)}
                className="border-violet-700 text-violet-400"
              >
                AI
              </Button>
            </Tooltip>
          </div>
        </div>

        <Divider className="border-zinc-700 my-6" />
        <ContextNotesList
          notes={ed.freeFormContext}
          onChange={(notes) =>
            updateEducationState(ed.id, { freeFormContext: notes })
          }
          placeholder="e.g. Final thesis on distributed systems fault tolerance. GPA 3.9. Tutored undergraduate data structures..."
        />

        {/* ── Delete Education ── (FR-04: footer button) */}
        <Divider className="border-zinc-800 mt-6 mb-4" />
        <div className="flex justify-end">
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() =>
              handleDeleteEducation(ed.id, ed.tabLabel || ed.institution)
            }
          >
            Delete this education entry
          </Button>
        </div>
      </Card>
    ),
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Title level={4} className="!text-white !m-0">
          Education
        </Title>
        <Button type="dashed" icon={<PlusOutlined />} onClick={addEducation}>
          Add Education
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
