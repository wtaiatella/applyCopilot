"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Tabs,
  Card,
  Form,
  Input,
  Button,
  DatePicker,
  Checkbox,
  Divider,
  Switch,
  Tooltip,
  Select,
  InputNumber,
  Table,
  Typography,
  Modal,
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
import type {
  CVSnapshotData,
  CVSnapshotBullet,
  CVSnapshotExperience,
  CVSnapshotEducation,
  CVSnapshotProject,
  CVSnapshotSummary,
  CVSnapshotSkill,
} from "@/types/cv";
import type { BulletDTO } from "@/types/profile";
import {
  SortableBulletItem,
  ContextNotesList,
  EditableTabLabel,
} from "@/components/profile/shared";
import AIBulletModal from "@/components/profile/AIBulletModal";
import ReviewAllDrawer from "@/components/profile/ReviewAllDrawer";
import type {
  BulletSuggestion,
  RelevanceDecision,
} from "@/services/profileBulletAIService";

const { TextArea } = Input;
const { Title } = Typography;
const { Option } = Select;

export type CVEntityType = "experience" | "project" | "education";

export interface CVEditorProps {
  /** Needed to scope job-aware AI calls to `/api/cv/[cvId]/ai/*` (FR-7–FR-9, T029). */
  cvId: string;
  snapshot: CVSnapshotData;
  onChange: (data: Partial<CVSnapshotData>) => void;
  /** When true (CV `status === "APPLIED"`), the whole editor is read-only (FR-11, FR-18, AC.11). */
  readOnly?: boolean;
}

// ── `included` ⇄ `isActive` adapter (see spectech.md Implementation Notes) ──────────────
// This is the ONLY place in the codebase this renaming happens: services, API contracts, and
// the persisted `snapshotData` always use `included`. `SortableBulletItem` was built for
// Profile's `BulletDTO`/`isActive` shape, so we translate at this boundary only, purely to
// reuse the component unmodified.
function toDisplayBullet(bullet: CVSnapshotBullet): BulletDTO {
  return {
    id: bullet.id,
    text: bullet.text,
    type: bullet.type,
    sortOrder: bullet.sortOrder,
    isActive: bullet.included,
    isArchived: false,
    usedInCVs: [],
  };
}

function applyDisplayBulletUpdate(
  bullet: CVSnapshotBullet,
  data: Partial<BulletDTO>,
): CVSnapshotBullet {
  const next = { ...bullet };
  if (data.text !== undefined) next.text = data.text;
  if (data.type !== undefined) next.type = data.type;
  if (data.sortOrder !== undefined) next.sortOrder = data.sortOrder;
  if (data.isActive !== undefined) next.included = data.isActive;
  return next;
}

function newLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Applies an accepted job-aware suggestion locally (client folds — AI endpoints are stateless). */
function applySuggestionToBullets(
  bullets: CVSnapshotBullet[],
  suggestion: BulletSuggestion,
  editedText?: string,
): CVSnapshotBullet[] {
  if (suggestion.type === "REWRITE") {
    const text = editedText ?? suggestion.revisedText;
    return bullets.map((b) =>
      b.id === suggestion.bulletId ? { ...b, text } : b,
    );
  }
  if (suggestion.type === "MERGE") {
    const [firstId, ...restIds] = suggestion.bulletIds;
    const combinedText = editedText ?? suggestion.combinedText;
    return bullets
      .filter((b) => !restIds.includes(b.id))
      .map((b) => (b.id === firstId ? { ...b, text: combinedText } : b));
  }
  // NEW
  const text = editedText ?? suggestion.text;
  return [
    ...bullets,
    {
      id: newLocalId(),
      sourceBulletId: null,
      text,
      type: "BULLET",
      included: true,
      sortOrder: bullets.length,
    },
  ];
}

/**
 * Applies job-aware relevance decisions (FR-8) to each bullet's persisted `included` flag.
 * This is the client-side fold of a job-aware Review All's `relevanceDecisions` array into
 * local snapshot state — the candidate can still override any bullet's Active toggle manually
 * at any time while DRAFT (FR-3a), and nothing is persisted until the existing autosave PUT.
 */
function applyRelevanceDecisions(
  bullets: CVSnapshotBullet[],
  decisions: RelevanceDecision[],
): CVSnapshotBullet[] {
  const byId = new Map(decisions.map((d) => [d.bulletId, d.include]));
  return bullets.map((b) =>
    byId.has(b.id) ? { ...b, included: byId.get(b.id)! } : b,
  );
}

// ── Shared bullets editor (used by Experience/Education/Project sections) ──────────────
interface BulletsEditorProps {
  cvId: string;
  entityType: CVEntityType;
  entityId: string;
  bullets: CVSnapshotBullet[];
  onBulletsChange: (bullets: CVSnapshotBullet[]) => void;
  readOnly?: boolean;
}

function BulletsEditor({
  cvId,
  entityType,
  entityId,
  bullets,
  onBulletsChange,
  readOnly = false,
}: BulletsEditorProps) {
  const [newBulletText, setNewBulletText] = useState("");
  const [newBulletType, setNewBulletType] = useState<"BULLET" | "PARAGRAPH">(
    "BULLET",
  );

  // ── AI: Review All (job-aware, FR-7/FR-8) ───────────────────────────────
  const [reviewAllLoading, setReviewAllLoading] = useState(false);
  const [reviewAllSuggestions, setReviewAllSuggestions] = useState<
    BulletSuggestion[]
  >([]);
  const [reviewAllOpen, setReviewAllOpen] = useState(false);

  // ── AI: Add with AI / per-bullet Review (job-aware, FR-7) ───────────────
  const [aiGenerateLoading, setAiGenerateLoading] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalMode, setAiModalMode] = useState<"generate" | "review">(
    "generate",
  );
  const [aiModalBulletId, setAiModalBulletId] = useState<string | null>(null);
  const [aiModalText, setAiModalText] = useState("");
  const [aiModalOriginalText, setAiModalOriginalText] = useState<
    string | undefined
  >(undefined);
  const [aiReviewLoadingId, setAiReviewLoadingId] = useState<string | null>(
    null,
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = bullets.findIndex((b) => b.id === active.id);
    const newIndex = bullets.findIndex((b) => b.id === over.id);
    onBulletsChange(
      arrayMove(bullets, oldIndex, newIndex).map((b, i) => ({
        ...b,
        sortOrder: i,
      })),
    );
  };

  const handleUpdate = (bulletId: string, data: Partial<BulletDTO>) => {
    onBulletsChange(
      bullets.map((b) =>
        b.id === bulletId ? applyDisplayBulletUpdate(b, data) : b,
      ),
    );
  };

  const handleDelete = (bulletId: string) => {
    onBulletsChange(bullets.filter((b) => b.id !== bulletId));
  };

  const handleAdd = () => {
    const text = newBulletText.trim();
    if (!text) return;
    onBulletsChange([
      ...bullets,
      {
        id: newLocalId(),
        sourceBulletId: null,
        text,
        type: newBulletType,
        included: true,
        sortOrder: bullets.length,
      },
    ]);
    setNewBulletText("");
  };

  const handleReviewAll = async () => {
    setReviewAllLoading(true);
    try {
      const res = await fetch(`/api/cv/${cvId}/ai/review-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Modal.error({
          title: "Could not run Review All",
          content: (err as { error?: string }).error || "Unknown error",
        });
        return;
      }
      const data = (await res.json()) as {
        suggestions: BulletSuggestion[];
        relevanceDecisions?: RelevanceDecision[];
      };
      if (data.relevanceDecisions && data.relevanceDecisions.length > 0) {
        onBulletsChange(
          applyRelevanceDecisions(bullets, data.relevanceDecisions),
        );
      }
      setReviewAllSuggestions(data.suggestions || []);
      setReviewAllOpen(true);
    } catch {
      Modal.error({
        title: "Could not run Review All",
        content: "Network error. Please try again.",
      });
    } finally {
      setReviewAllLoading(false);
    }
  };

  const handleReviewAllAccept = async (
    suggestion: BulletSuggestion,
    editedText?: string,
  ) => {
    onBulletsChange(applySuggestionToBullets(bullets, suggestion, editedText));
  };

  const handleReviewAllAcceptAll = async () => {
    let next = bullets;
    for (const suggestion of reviewAllSuggestions) {
      next = applySuggestionToBullets(next, suggestion);
    }
    onBulletsChange(next);
  };

  const handleGenerateBulletClick = async () => {
    setAiGenerateLoading(true);
    try {
      const res = await fetch(`/api/cv/${cvId}/ai/generate-bullet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if ((err as { error?: string }).error === "AI_CONTEXT_REQUIRED") {
          Modal.error({
            title: "AI Context Notes required",
            content:
              "Add AI Context Notes (or a job description) first to generate new bullets.",
          });
        } else {
          Modal.error({
            title: "Could not generate bullet",
            content: (err as { error?: string }).error || "Unknown error",
          });
        }
        return;
      }
      const data = (await res.json()) as { revisedText: string };
      setAiModalMode("generate");
      setAiModalBulletId(null);
      setAiModalText(data.revisedText);
      setAiModalOriginalText(undefined);
      setAiModalOpen(true);
    } catch {
      Modal.error({
        title: "Could not generate bullet",
        content: "Network error. Please try again.",
      });
    } finally {
      setAiGenerateLoading(false);
    }
  };

  const handleAIReviewBullet = async (bullet: BulletDTO) => {
    setAiReviewLoadingId(bullet.id);
    try {
      const res = await fetch(`/api/cv/${cvId}/ai/review-bullet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
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
    if (aiModalMode === "generate") {
      const res = await fetch(`/api/cv/${cvId}/ai/generate-bullet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId,
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
    }
    if (!aiModalBulletId) return "";
    const res = await fetch(`/api/cv/${cvId}/ai/review-bullet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType,
        entityId,
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
    if (aiModalMode === "generate") {
      onBulletsChange([
        ...bullets,
        {
          id: newLocalId(),
          sourceBulletId: null,
          text,
          type: "BULLET",
          included: true,
          sortOrder: bullets.length,
        },
      ]);
    } else {
      if (!aiModalBulletId) return;
      onBulletsChange(
        bullets.map((b) => (b.id === aiModalBulletId ? { ...b, text } : b)),
      );
    }
  };

  const handleAiModalClose = () => {
    setAiModalOpen(false);
    setAiModalBulletId(null);
    setAiModalText("");
    setAiModalOriginalText(undefined);
  };

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex justify-end">
          <Button
            type="dashed"
            icon={<StarOutlined />}
            loading={reviewAllLoading}
            onClick={handleReviewAll}
            className="border-violet-700/60 text-violet-400 hover:border-violet-500"
          >
            Review All
          </Button>
        </div>
      )}

      {bullets.length === 0 ? (
        <div className="text-center text-zinc-600 py-4 bg-zinc-950/20 border border-dashed border-zinc-800 rounded text-xs">
          No bullets yet. Type below and press Add or Enter.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={bullets.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {bullets.map((b) => (
                <SortableBulletItem
                  key={b.id}
                  bullet={toDisplayBullet(b)}
                  onUpdate={readOnly ? () => {} : handleUpdate}
                  onDelete={readOnly ? () => {} : handleDelete}
                  showAIReview={!readOnly}
                  onAIReview={handleAIReviewBullet}
                  aiReviewLoading={aiReviewLoadingId === b.id}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {!readOnly && (
        <div className="flex gap-2 mt-2">
          <Input
            value={newBulletText}
            onChange={(e) => setNewBulletText(e.target.value)}
            onPressEnter={handleAdd}
            placeholder="Describe an achievement or responsibility..."
            className="bg-zinc-950 border-zinc-800 text-white"
          />
          <Button
            type="text"
            onClick={() =>
              setNewBulletType(
                newBulletType === "BULLET" ? "PARAGRAPH" : "BULLET",
              )
            }
            className="shrink-0 text-zinc-400 hover:text-white border border-zinc-700 font-bold px-3"
            title={`Currently ${newBulletType === "BULLET" ? "Bullet (•)" : "Paragraph (¶)"} — click to toggle`}
          >
            {newBulletType === "BULLET" ? "•" : "¶"}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            className="bg-blue-600 border-blue-600 hover:bg-blue-500"
          >
            Add
          </Button>
          <Button
            icon={<StarOutlined />}
            loading={aiGenerateLoading}
            onClick={handleGenerateBulletClick}
            className="border-violet-700 text-violet-400"
          >
            AI
          </Button>
        </div>
      )}

      <ReviewAllDrawer
        open={reviewAllOpen}
        onClose={() => setReviewAllOpen(false)}
        suggestions={reviewAllSuggestions}
        onAccept={handleReviewAllAccept}
        onSkip={() => {}}
        onAcceptAll={handleReviewAllAcceptAll}
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

// ── Basic Data ───────────────────────────────────────────────────────────────
function BasicDataSection({
  snapshot,
  onChange,
  readOnly = false,
}: {
  snapshot: CVSnapshotData;
  onChange: (data: Partial<CVSnapshotData>) => void;
  readOnly?: boolean;
}) {
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue(snapshot.basicData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.basicData]);

  return (
    <Card
      className="bg-zinc-900/50 border-zinc-800 text-white"
      title="Basic Information"
    >
      <Form
        form={form}
        layout="vertical"
        disabled={readOnly}
        onValuesChange={(changed) => {
          const cleaned: Record<string, unknown> = {};
          for (const key of Object.keys(changed)) {
            cleaned[key] = changed[key] === "" ? null : changed[key];
          }
          onChange({ basicData: { ...snapshot.basicData, ...cleaned } });
        }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <Form.Item name="firstName" label="First Name">
          <Input className="bg-zinc-950 border-zinc-800 text-white" />
        </Form.Item>
        <Form.Item name="lastName" label="Last Name">
          <Input className="bg-zinc-950 border-zinc-800 text-white" />
        </Form.Item>
        <Form.Item name="phone" label="Phone">
          <Input className="bg-zinc-950 border-zinc-800 text-white" />
        </Form.Item>
        <Form.Item name="location" label="Location">
          <Input className="bg-zinc-950 border-zinc-800 text-white" />
        </Form.Item>
        <Form.Item name="linkedin" label="LinkedIn URL">
          <Input className="bg-zinc-950 border-zinc-800 text-white" />
        </Form.Item>
        <Form.Item name="github" label="GitHub URL">
          <Input className="bg-zinc-950 border-zinc-800 text-white" />
        </Form.Item>
        <Form.Item name="website" label="Website URL">
          <Input className="bg-zinc-950 border-zinc-800 text-white" />
        </Form.Item>
        <Form.Item name="title" label="Professional Title">
          <Input className="bg-zinc-950 border-zinc-800 text-white" />
        </Form.Item>
      </Form>
    </Card>
  );
}

// ── Summaries ────────────────────────────────────────────────────────────────
function SummariesSection({
  cvId,
  summaries,
  onChange,
  readOnly = false,
}: {
  cvId: string;
  summaries: CVSnapshotSummary[];
  onChange: (summaries: CVSnapshotSummary[]) => void;
  readOnly?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  // ── AI: job-aware summary generation (FR-9) ─────────────────────────────
  const [aiGenerateLoading, setAiGenerateLoading] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalText, setAiModalText] = useState("");

  const handleGenerateSummaryClick = async () => {
    setAiGenerateLoading(true);
    try {
      const res = await fetch(`/api/cv/${cvId}/ai/generate-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Modal.error({
          title: "Could not generate summary",
          content: (err as { error?: string }).error || "Unknown error",
        });
        return;
      }
      const data = (await res.json()) as { content: string };
      setAiModalText(data.content);
      setAiModalOpen(true);
    } catch {
      Modal.error({
        title: "Could not generate summary",
        content: "Network error. Please try again.",
      });
    } finally {
      setAiGenerateLoading(false);
    }
  };

  const handleAiModalRegenerate = async (): Promise<string> => {
    const res = await fetch(`/api/cv/${cvId}/ai/generate-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        (err as { error?: string }).error || "Failed to regenerate",
      );
    }
    const data = (await res.json()) as { content: string };
    return data.content;
  };

  const handleAiModalAccept = async (text: string) => {
    onChange([
      ...summaries,
      {
        id: newLocalId(),
        sourceSummaryId: null,
        title: "AI Generated",
        content: text,
        isAIGenerated: true,
        included: summaries.length === 0,
      },
    ]);
  };

  const handleToggleIncluded = (id: string) => {
    onChange(summaries.map((s) => ({ ...s, included: s.id === id })));
  };

  const handleDelete = (id: string) => {
    const updated = summaries.filter((s) => s.id !== id);
    if (updated.length > 0 && !updated.some((s) => s.included)) {
      updated[0].included = true;
    }
    onChange(updated);
  };

  const handleAdd = () => {
    if (!title.trim() || !content.trim()) return;
    onChange([
      ...summaries,
      {
        id: newLocalId(),
        sourceSummaryId: null,
        title: title.trim(),
        content: content.trim(),
        isAIGenerated: false,
        included: summaries.length === 0,
      },
    ]);
    setTitle("");
    setContent("");
  };

  return (
    <Card
      className="bg-zinc-900/50 border-zinc-800 text-white"
      title={
        <div className="flex items-center justify-between">
          <span>Professional Summary</span>
          {!readOnly && (
            <Button
              size="small"
              type="dashed"
              icon={<StarOutlined />}
              loading={aiGenerateLoading}
              onClick={handleGenerateSummaryClick}
              className="border-violet-700/60 text-violet-400 hover:border-violet-500"
            >
              Generate with AI
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        {summaries.length === 0 ? (
          <div className="text-center text-zinc-600 py-4 bg-zinc-950/20 border border-dashed border-zinc-800 rounded text-xs">
            No summary variants yet.
          </div>
        ) : (
          summaries.map((s) => (
            <div
              key={s.id}
              className={`flex items-start gap-3 p-3 bg-zinc-950/60 border rounded-lg ${
                s.included
                  ? "border-blue-500/50 bg-blue-950/10"
                  : "border-zinc-800"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  {s.title}
                  {s.isAIGenerated && (
                    <span className="text-[10px] bg-yellow-600/20 text-yellow-400 border border-yellow-800/50 px-1.5 py-0.5 rounded">
                      AI
                    </span>
                  )}
                </div>
                <p className="text-zinc-400 text-xs mt-1 whitespace-pre-wrap">
                  {s.content}
                </p>
              </div>
              <Tooltip title={s.included ? "Active on CV" : "Set as active"}>
                <Switch
                  checked={s.included}
                  disabled={readOnly}
                  onChange={() => handleToggleIncluded(s.id)}
                  size="small"
                />
              </Tooltip>
              {!readOnly && (
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDelete(s.id)}
                  size="small"
                />
              )}
            </div>
          ))
        )}

        {!readOnly && (
          <div className="bg-zinc-950/40 border border-zinc-850 p-3 rounded-lg space-y-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (e.g. Technical focus)"
              className="bg-zinc-900 border-zinc-800 text-white"
            />
            <TextArea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder="Summary content..."
              className="bg-zinc-900 border-zinc-800 text-white"
            />
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={handleAdd}
              className="border-zinc-700 text-zinc-300"
            >
              Add Summary
            </Button>
          </div>
        )}
      </div>

      <AIBulletModal
        open={aiModalOpen}
        mode="generate"
        initialText={aiModalText}
        onClose={() => setAiModalOpen(false)}
        onAccept={handleAiModalAccept}
        onRegenerate={handleAiModalRegenerate}
      />
    </Card>
  );
}

// ── Skills ───────────────────────────────────────────────────────────────────
function SkillsSection({
  skills,
  onChange,
  readOnly = false,
}: {
  skills: CVSnapshotSkill[];
  onChange: (skills: CVSnapshotSkill[]) => void;
  readOnly?: boolean;
}) {
  const [name, setName] = useState("");
  const [proficiency, setProficiency] =
    useState<CVSnapshotSkill["proficiency"]>("INTERMEDIATE");
  const [yearsExperience, setYearsExperience] = useState<number | null>(null);

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (skills.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      return;
    }
    onChange([
      ...skills,
      {
        id: newLocalId(),
        sourceSkillId: null,
        name: trimmed,
        proficiency,
        yearsExperience,
        included: true,
      },
    ]);
    setName("");
    setYearsExperience(null);
  };

  const handleUpdate = (id: string, data: Partial<CVSnapshotSkill>) => {
    onChange(skills.map((s) => (s.id === id ? { ...s, ...data } : s)));
  };

  const handleDelete = (id: string) => {
    onChange(skills.filter((s) => s.id !== id));
  };

  const columns = [
    {
      title: "Skill",
      dataIndex: "name",
      key: "name",
      render: (text: string) => (
        <span className="text-white font-medium">{text}</span>
      ),
    },
    {
      title: "Proficiency",
      dataIndex: "proficiency",
      key: "proficiency",
      render: (
        val: CVSnapshotSkill["proficiency"],
        record: CVSnapshotSkill,
      ) => (
        <Select
          value={val}
          disabled={readOnly}
          onChange={(newVal) =>
            handleUpdate(record.id, { proficiency: newVal })
          }
          className="w-36"
        >
          <Option value="BEGINNER">Beginner</Option>
          <Option value="INTERMEDIATE">Intermediate</Option>
          <Option value="ADVANCED">Advanced</Option>
          <Option value="EXPERT">Expert</Option>
        </Select>
      ),
    },
    {
      title: "Years",
      dataIndex: "yearsExperience",
      key: "yearsExperience",
      render: (val: number | null, record: CVSnapshotSkill) => (
        <InputNumber
          min={0}
          max={100}
          disabled={readOnly}
          value={val ?? undefined}
          onChange={(v) =>
            handleUpdate(record.id, { yearsExperience: v ?? null })
          }
          className="w-24"
        />
      ),
    },
    {
      title: "Included",
      dataIndex: "included",
      key: "included",
      render: (val: boolean, record: CVSnapshotSkill) => (
        <Switch
          checked={val}
          disabled={readOnly}
          onChange={(checked) => handleUpdate(record.id, { included: checked })}
          size="small"
        />
      ),
    },
    {
      title: "",
      key: "action",
      width: 60,
      render: (_: unknown, record: CVSnapshotSkill) =>
        !readOnly && (
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          />
        ),
    },
  ];

  return (
    <Card className="bg-zinc-900/50 border-zinc-800 text-white" title="Skills">
      <div className="space-y-4">
        {!readOnly && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end bg-zinc-950/40 border border-zinc-850 p-3 rounded-lg">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Skill name"
              className="bg-zinc-900 border-zinc-800 text-white sm:col-span-2"
            />
            <Select
              value={proficiency}
              onChange={setProficiency}
              className="w-full"
            >
              <Option value="BEGINNER">Beginner</Option>
              <Option value="INTERMEDIATE">Intermediate</Option>
              <Option value="ADVANCED">Advanced</Option>
              <Option value="EXPERT">Expert</Option>
            </Select>
            <div className="flex gap-2">
              <InputNumber
                min={0}
                value={yearsExperience ?? undefined}
                onChange={(v) => setYearsExperience(v ?? null)}
                placeholder="Years"
                className="w-full"
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAdd}
              >
                Add
              </Button>
            </div>
          </div>
        )}
        <Table
          dataSource={skills}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="small"
          locale={{
            emptyText: (
              <div className="text-zinc-600 py-6 text-sm">No skills yet.</div>
            ),
          }}
        />
      </div>
    </Card>
  );
}

// ── Generic entity section (Experience / Education / Project) ──────────────
interface EntityLike {
  id: string;
  tabLabel: string | null;
  freeFormContext: string[];
  bullets: CVSnapshotBullet[];
}

function EntitySection<T extends EntityLike>({
  cvId,
  entityType,
  title,
  entities,
  fallbackLabel,
  onEntitiesChange,
  renderFields,
  createEntity,
  readOnly = false,
}: {
  cvId: string;
  entityType: CVEntityType;
  title: string;
  entities: T[];
  fallbackLabel: (entity: T) => string;
  onEntitiesChange: (entities: T[]) => void;
  renderFields: (
    entity: T,
    update: (data: Partial<T>) => void,
  ) => React.ReactNode;
  createEntity: () => T;
  readOnly?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<string>();
  const prevLengthRef = useRef(0);

  useEffect(() => {
    const n = entities.length;
    if (n > prevLengthRef.current) {
      if (entities[n - 1]) {
        Promise.resolve().then(() => setActiveTab(entities[n - 1].id));
      }
    } else if (n < prevLengthRef.current) {
      if (activeTab && !entities.some((e) => e.id === activeTab)) {
        Promise.resolve().then(() => setActiveTab(entities[0]?.id));
      }
    } else if (n > 0 && !activeTab) {
      Promise.resolve().then(() => setActiveTab(entities[0].id));
    }
    prevLengthRef.current = n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities]);

  const updateEntity = (id: string, data: Partial<T>) => {
    onEntitiesChange(
      entities.map((e) => (e.id === id ? { ...e, ...data } : e)),
    );
  };

  const handleDelete = (id: string, label: string) => {
    Modal.confirm({
      title: `Remove ${label}?`,
      content:
        "This removes the entry from this CV only — your master Profile is unaffected.",
      okText: "Remove",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: () => onEntitiesChange(entities.filter((e) => e.id !== id)),
    });
  };

  const handleAdd = () => {
    onEntitiesChange([...entities, createEntity()]);
  };

  if (entities.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Title level={4} className="!text-white !m-0">
            {title}
          </Title>
          {!readOnly && (
            <Button type="dashed" icon={<PlusOutlined />} onClick={handleAdd}>
              Add
            </Button>
          )}
        </div>
        <div className="text-center text-zinc-500 py-12 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-lg">
          Nothing here yet.
        </div>
      </div>
    );
  }

  const tabItems = entities.map((entity) => ({
    key: entity.id,
    label: (
      <EditableTabLabel
        value={entity.tabLabel || ""}
        fallback={fallbackLabel(entity)}
        onSave={(val) =>
          updateEntity(entity.id, { tabLabel: val || null } as Partial<T>)
        }
      />
    ),
    children: (
      <Card className="bg-zinc-900/50 border-zinc-800 text-white mt-2">
        {renderFields(entity, (data) => updateEntity(entity.id, data))}

        <Divider className="border-zinc-800 my-6" />
        <div className="space-y-3">
          <span className="text-white font-semibold block text-sm">
            Key Achievements &amp; Responsibilities
          </span>
          <BulletsEditor
            cvId={cvId}
            entityType={entityType}
            entityId={entity.id}
            bullets={entity.bullets}
            onBulletsChange={(bullets) =>
              updateEntity(entity.id, { bullets } as Partial<T>)
            }
            readOnly={readOnly}
          />
        </div>

        <Divider className="border-zinc-700 my-6" />
        <ContextNotesList
          notes={entity.freeFormContext}
          onChange={(notes) =>
            updateEntity(entity.id, { freeFormContext: notes } as Partial<T>)
          }
        />

        {!readOnly && (
          <>
            <Divider className="border-zinc-800 mt-6 mb-4" />
            <div className="flex justify-end">
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={() =>
                  handleDelete(
                    entity.id,
                    entity.tabLabel || fallbackLabel(entity),
                  )
                }
              >
                Remove this entry
              </Button>
            </div>
          </>
        )}
      </Card>
    ),
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Title level={4} className="!text-white !m-0">
          {title}
        </Title>
        {!readOnly && (
          <Button type="dashed" icon={<PlusOutlined />} onClick={handleAdd}>
            Add
          </Button>
        )}
      </div>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
    </div>
  );
}

function ExperienceFields({
  experience,
  update,
}: {
  experience: CVSnapshotExperience;
  update: (data: Partial<CVSnapshotExperience>) => void;
}) {
  return (
    <Form layout="vertical" className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Form.Item label="Company">
        <Input
          value={experience.company}
          onChange={(e) => update({ company: e.target.value })}
          className="bg-zinc-950 border-zinc-800 text-white"
        />
      </Form.Item>
      <Form.Item label="Position">
        <Input
          value={experience.position}
          onChange={(e) => update({ position: e.target.value })}
          className="bg-zinc-950 border-zinc-800 text-white"
        />
      </Form.Item>
      <Form.Item label="Start Date">
        <DatePicker
          value={experience.startDate ? dayjs(experience.startDate) : null}
          onChange={(date) =>
            update({
              startDate: date ? date.toISOString() : new Date().toISOString(),
            })
          }
          format="MMM YYYY"
          picker="month"
          className="w-full"
        />
      </Form.Item>
      <Form.Item label="End Date">
        <DatePicker
          value={experience.endDate ? dayjs(experience.endDate) : null}
          disabled={experience.current}
          onChange={(date) =>
            update({ endDate: date ? date.toISOString() : null })
          }
          format="MMM YYYY"
          picker="month"
          className="w-full"
        />
      </Form.Item>
      <Form.Item className="col-span-1 md:col-span-2">
        <Checkbox
          checked={experience.current}
          onChange={(e) =>
            update({
              current: e.target.checked,
              endDate: e.target.checked ? null : experience.endDate,
            })
          }
        >
          I currently work here
        </Checkbox>
      </Form.Item>
    </Form>
  );
}

function EducationFields({
  education,
  update,
}: {
  education: CVSnapshotEducation;
  update: (data: Partial<CVSnapshotEducation>) => void;
}) {
  return (
    <Form layout="vertical" className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Form.Item label="Institution">
        <Input
          value={education.institution}
          onChange={(e) => update({ institution: e.target.value })}
          className="bg-zinc-950 border-zinc-800 text-white"
        />
      </Form.Item>
      <Form.Item label="Degree">
        <Input
          value={education.degree}
          onChange={(e) => update({ degree: e.target.value })}
          className="bg-zinc-950 border-zinc-800 text-white"
        />
      </Form.Item>
      <Form.Item label="Field of Study">
        <Input
          value={education.fieldOfStudy ?? ""}
          onChange={(e) => update({ fieldOfStudy: e.target.value || null })}
          className="bg-zinc-950 border-zinc-800 text-white"
        />
      </Form.Item>
      <Form.Item label="Start Date">
        <DatePicker
          value={education.startDate ? dayjs(education.startDate) : null}
          onChange={(date) =>
            update({
              startDate: date ? date.toISOString() : new Date().toISOString(),
            })
          }
          format="MMM YYYY"
          picker="month"
          className="w-full"
        />
      </Form.Item>
      <Form.Item label="End Date">
        <DatePicker
          value={education.endDate ? dayjs(education.endDate) : null}
          disabled={education.current}
          onChange={(date) =>
            update({ endDate: date ? date.toISOString() : null })
          }
          format="MMM YYYY"
          picker="month"
          className="w-full"
        />
      </Form.Item>
      <Form.Item className="col-span-1 md:col-span-2 flex gap-6">
        <Checkbox
          checked={education.current}
          onChange={(e) =>
            update({
              current: e.target.checked,
              endDate: e.target.checked ? null : education.endDate,
            })
          }
        >
          Currently studying here
        </Checkbox>
        <Checkbox
          checked={education.hideEndDate}
          onChange={(e) => update({ hideEndDate: e.target.checked })}
        >
          Hide end date on CV
        </Checkbox>
      </Form.Item>
    </Form>
  );
}

function ProjectFields({
  project,
  update,
}: {
  project: CVSnapshotProject;
  update: (data: Partial<CVSnapshotProject>) => void;
}) {
  return (
    <Form layout="vertical" className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Form.Item label="Name">
        <Input
          value={project.name}
          onChange={(e) => update({ name: e.target.value })}
          className="bg-zinc-950 border-zinc-800 text-white"
        />
      </Form.Item>
      <Form.Item label="Technologies (comma-separated)">
        <Input
          value={project.technologies.join(", ")}
          onChange={(e) =>
            update({
              technologies: e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
          className="bg-zinc-950 border-zinc-800 text-white"
        />
      </Form.Item>
      <Form.Item label="Start Date">
        <DatePicker
          value={project.startDate ? dayjs(project.startDate) : null}
          onChange={(date) =>
            update({ startDate: date ? date.toISOString() : null })
          }
          format="MMM YYYY"
          picker="month"
          className="w-full"
        />
      </Form.Item>
      <Form.Item label="End Date">
        <DatePicker
          value={project.endDate ? dayjs(project.endDate) : null}
          disabled={project.current}
          onChange={(date) =>
            update({ endDate: date ? date.toISOString() : null })
          }
          format="MMM YYYY"
          picker="month"
          className="w-full"
        />
      </Form.Item>
      <Form.Item className="col-span-1 md:col-span-2">
        <Checkbox
          checked={project.current}
          onChange={(e) =>
            update({
              current: e.target.checked,
              endDate: e.target.checked ? null : project.endDate,
            })
          }
        >
          Ongoing project
        </Checkbox>
      </Form.Item>
    </Form>
  );
}

/**
 * CVEditor — adapter that renders Profile-equivalent editing sections against `CVSnapshotData`,
 * reusing `SortableBulletItem` / `ContextNotesList` / `EditableTabLabel` from the Profile domain.
 * See the top-of-file note re: the `included` ⇄ `isActive` mapping boundary.
 */
export default function CVEditor({
  cvId,
  snapshot,
  onChange,
  readOnly = false,
}: CVEditorProps) {
  const items = [
    {
      key: "basic",
      label: "Basic Data",
      children: (
        <BasicDataSection
          snapshot={snapshot}
          onChange={onChange}
          readOnly={readOnly}
        />
      ),
    },
    {
      key: "summary",
      label: "Summary",
      children: (
        <SummariesSection
          cvId={cvId}
          summaries={snapshot.summaries}
          onChange={(summaries) => onChange({ summaries })}
          readOnly={readOnly}
        />
      ),
    },
    {
      key: "experience",
      label: "Experience",
      children: (
        <EntitySection<CVSnapshotExperience>
          cvId={cvId}
          entityType="experience"
          title="Work Experience"
          entities={snapshot.experiences}
          fallbackLabel={(e) => e.company || "New experience"}
          onEntitiesChange={(experiences) => onChange({ experiences })}
          renderFields={(experience, update) => (
            <ExperienceFields experience={experience} update={update} />
          )}
          createEntity={() => ({
            id: newLocalId(),
            sourceExperienceId: null,
            company: "",
            position: "",
            startDate: new Date().toISOString(),
            endDate: null,
            current: true,
            tabLabel: null,
            freeFormContext: [],
            bullets: [],
          })}
          readOnly={readOnly}
        />
      ),
    },
    {
      key: "education",
      label: "Education",
      children: (
        <EntitySection<CVSnapshotEducation>
          cvId={cvId}
          entityType="education"
          title="Education"
          entities={snapshot.education}
          fallbackLabel={(e) => e.institution || "New education"}
          onEntitiesChange={(education) => onChange({ education })}
          renderFields={(education, update) => (
            <EducationFields education={education} update={update} />
          )}
          createEntity={() => ({
            id: newLocalId(),
            sourceEducationId: null,
            institution: "",
            degree: "",
            fieldOfStudy: null,
            startDate: new Date().toISOString(),
            endDate: null,
            current: true,
            hideEndDate: false,
            tabLabel: null,
            freeFormContext: [],
            bullets: [],
          })}
          readOnly={readOnly}
        />
      ),
    },
    {
      key: "projects",
      label: "Projects",
      children: (
        <EntitySection<CVSnapshotProject>
          cvId={cvId}
          entityType="project"
          title="Projects"
          entities={snapshot.projects}
          fallbackLabel={(p) => p.name || "New project"}
          onEntitiesChange={(projects) => onChange({ projects })}
          renderFields={(project, update) => (
            <ProjectFields project={project} update={update} />
          )}
          createEntity={() => ({
            id: newLocalId(),
            sourceProjectId: null,
            name: "",
            startDate: null,
            endDate: null,
            current: true,
            technologies: [],
            tabLabel: null,
            freeFormContext: [],
            bullets: [],
          })}
          readOnly={readOnly}
        />
      ),
    },
    {
      key: "skills",
      label: "Skills",
      children: (
        <SkillsSection
          skills={snapshot.skills}
          onChange={(skills) => onChange({ skills })}
          readOnly={readOnly}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {readOnly && (
        <div className="text-amber-300 text-xs bg-amber-950/30 border border-amber-900/50 rounded px-3 py-2">
          This CV has been Applied and is now read-only.
        </div>
      )}
      <Tabs defaultActiveKey="basic" items={items} type="card" />
    </div>
  );
}
