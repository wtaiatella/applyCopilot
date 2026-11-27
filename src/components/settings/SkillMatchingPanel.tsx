"use client";

import { useEffect, useRef, useState } from "react";
import {
  App,
  Button,
  Collapse,
  Form,
  InputNumber,
  Modal,
  Slider,
  Spin,
} from "antd";
import {
  ReloadOutlined,
  SlidersOutlined,
  WarningOutlined,
} from "@ant-design/icons";

interface BackfillResponse {
  success?: boolean;
  profilesReset?: number;
  skillsCleared?: number;
  jobsReindexed?: number;
  jobsSkipped?: number;
  skillsReindexed?: number;
  error?: string;
}

interface ThresholdFormValues {
  aliasThreshold: number;
  matchThreshold: number;
}

const DEFAULT_ALIAS_THRESHOLD = 60;
const DEFAULT_MATCH_THRESHOLD = 83;

function clampThreshold(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

interface ThresholdSliderInputProps {
  inputId: string;
  ariaLabel: string;
  value?: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
}

function ThresholdSliderInput({
  inputId,
  ariaLabel,
  value,
  onChange,
  disabled,
}: ThresholdSliderInputProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <Slider
          min={0}
          max={100}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(val) => onChange?.(val)}
        />
      </div>
      <InputNumber
        id={inputId}
        aria-label={ariaLabel}
        min={0}
        max={100}
        step={1}
        precision={0}
        value={value}
        disabled={disabled}
        onChange={(val) => {
          if (typeof val === "number" && Number.isFinite(val)) {
            onChange?.(val);
          }
        }}
      />
    </div>
  );
}

export default function SkillMatchingPanel() {
  const { message } = App.useApp();
  const messageRef = useRef(message);
  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  const [form] = Form.useForm<ThresholdFormValues>();
  const [loading, setLoading] = useState(true);
  const [initialThresholds, setInitialThresholds] =
    useState<ThresholdFormValues>({
      aliasThreshold: DEFAULT_ALIAS_THRESHOLD,
      matchThreshold: DEFAULT_MATCH_THRESHOLD,
    });
  const [saving, setSaving] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadThresholds() {
      setLoading(true);
      try {
        const [aliasRes, matchRes] = await Promise.all([
          fetch("/api/admin/skill-threshold"),
          fetch("/api/admin/skill-match-threshold"),
        ]);

        if (!aliasRes.ok || !matchRes.ok) {
          throw new Error("Failed to load skill matching thresholds");
        }

        const [aliasData, matchData] = await Promise.all([
          aliasRes.json() as Promise<{ threshold?: number }>,
          matchRes.json() as Promise<{ threshold?: number }>,
        ]);

        if (!active) return;

        const nextAlias = clampThreshold(
          aliasData.threshold,
          DEFAULT_ALIAS_THRESHOLD,
        );
        const nextMatch = clampThreshold(
          matchData.threshold,
          DEFAULT_MATCH_THRESHOLD,
        );

        const nextThresholds = {
          aliasThreshold: nextAlias,
          matchThreshold: nextMatch,
        };
        setInitialThresholds(nextThresholds);
        form.setFieldsValue(nextThresholds);
      } catch (err: unknown) {
        if (!active) return;
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        messageRef.current.error(`Failed to load skill thresholds: ${errMsg}`);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadThresholds();

    return () => {
      active = false;
    };
  }, [form]);

  const handleSaveThresholds = async (values: ThresholdFormValues) => {
    const formValues = form.getFieldsValue();
    const aliasThreshold = clampThreshold(
      values.aliasThreshold ?? formValues.aliasThreshold,
      DEFAULT_ALIAS_THRESHOLD,
    );
    const matchThreshold = clampThreshold(
      values.matchThreshold ?? formValues.matchThreshold,
      DEFAULT_MATCH_THRESHOLD,
    );

    setSaving(true);
    try {
      const [aliasRes, matchRes] = await Promise.all([
        fetch("/api/admin/skill-threshold", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threshold: aliasThreshold }),
        }),
        fetch("/api/admin/skill-match-threshold", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threshold: matchThreshold }),
        }),
      ]);

      const [aliasData, matchData] = await Promise.all([
        aliasRes.json() as Promise<{ error?: string }>,
        matchRes.json() as Promise<{ error?: string }>,
      ]);

      if (!aliasRes.ok) {
        throw new Error(aliasData.error || "Failed to save alias threshold");
      }
      if (!matchRes.ok) {
        throw new Error(matchData.error || "Failed to save match threshold");
      }

      message.success("Skill matching thresholds saved.");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      message.error(`Failed to save thresholds: ${errMsg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleBackfillConfirm = async () => {
    if (backfilling) return;
    setModalOpen(false);
    setBackfilling(true);

    try {
      const res = await fetch("/api/admin/backfill-skill-vocabulary", {
        method: "POST",
      });

      const data = (await res.json()) as BackfillResponse;

      if (res.status === 409) {
        message.warning(
          data.error ||
            "A skill vocabulary and embedding backfill is already in progress.",
        );
        return;
      }

      if (res.status === 503) {
        message.error(
          data.error ||
            "AI service temporarily unavailable. Please try again later.",
        );
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Backfill failed");
      }

      message.success(
        `Backfill complete: ${data.jobsReindexed ?? 0} jobs reindexed, ${data.jobsSkipped ?? 0} skipped, ${data.skillsReindexed ?? 0} skill embeddings rebuilt, ${data.skillsCleared ?? 0} skills cleared, ${data.profilesReset ?? 0} profiles reset.`,
        6,
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      message.error(`Backfill failed: ${errMsg}`);
    } finally {
      setBackfilling(false);
    }
  };

  const collapseItems = [
    {
      key: "skill-matching",
      forceRender: true,
      label: (
        <span className="flex items-center gap-2 text-white font-semibold text-base">
          <SlidersOutlined />
          Skill Matching &amp; Embeddings
        </span>
      ),
      children: (
        <div className="pt-2 space-y-6">
          {loading ? (
            <div className="py-4 flex items-center gap-2 text-zinc-400 text-sm">
              <Spin size="small" />
              <span>Loading skill matching thresholds...</span>
            </div>
          ) : (
            <Form
              form={form}
              layout="vertical"
              initialValues={initialThresholds}
              onFinish={handleSaveThresholds}
            >
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="skill-alias-threshold-input"
                    className="block text-sm font-medium text-zinc-200 mb-1"
                  >
                    Skill Alias Similarity Threshold (%)
                  </label>
                  <p className="text-xs text-zinc-400 mb-2">
                    Minimum cosine similarity (0–100%) to propose canonical
                    skill aliases during ingestion.
                  </p>
                  <Form.Item
                    name="aliasThreshold"
                    className="mb-0"
                    normalize={(value) =>
                      clampThreshold(value, DEFAULT_ALIAS_THRESHOLD)
                    }
                  >
                    <ThresholdSliderInput
                      inputId="skill-alias-threshold-input"
                      ariaLabel="Skill Alias Similarity Threshold (%)"
                      disabled={saving}
                    />
                  </Form.Item>
                </div>

                <div>
                  <label
                    htmlFor="skill-match-threshold-input"
                    className="block text-sm font-medium text-zinc-200 mb-1"
                  >
                    Skill Match Threshold (%)
                  </label>
                  <p className="text-xs text-zinc-400 mb-2">
                    Minimum cosine similarity (0–100%) to classify a job skill
                    as Matched. Skills below this threshold are classified as
                    Missing and contribute 0 to the composite match score.
                  </p>
                  <Form.Item
                    name="matchThreshold"
                    className="mb-0"
                    normalize={(value) =>
                      clampThreshold(value, DEFAULT_MATCH_THRESHOLD)
                    }
                  >
                    <ThresholdSliderInput
                      inputId="skill-match-threshold-input"
                      ariaLabel="Skill Match Threshold (%)"
                      disabled={saving}
                    />
                  </Form.Item>
                </div>
              </div>

              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
                disabled={saving}
                className="mt-4 font-semibold"
                id="btn-save-skill-thresholds"
              >
                {saving ? "Saving..." : "Save Thresholds"}
              </Button>
            </Form>
          )}

          <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-4">
            <div className="flex items-start gap-3">
              <WarningOutlined className="text-amber-400 text-lg mt-0.5 shrink-0" />
              <div>
                <p className="text-amber-300 font-semibold text-sm mb-1">
                  Rebuild Canonical Skill Vocabulary &amp; Reindex Embeddings
                </p>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  Clears the canonical skill vocabulary and{" "}
                  <strong className="text-zinc-300">SkillAlias</strong>{" "}
                  mappings, resets profile embedding sync timestamps, and
                  reindexes completed job embeddings using persisted{" "}
                  <code className="text-zinc-300">jobFacts.mustHave</code>{" "}
                  without re-running LLM classification.
                </p>
              </div>
            </div>

            <Button
              type="primary"
              danger
              icon={<ReloadOutlined />}
              loading={backfilling}
              disabled={backfilling}
              onClick={() => setModalOpen(true)}
              className="mt-4 font-semibold"
              size="middle"
              id="btn-backfill-skill-vocabulary"
            >
              {backfilling
                ? "Reindexing..."
                : "Reindex Embeddings & Reset Vocabulary"}
            </Button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="max-w-2xl">
        <Collapse
          defaultActiveKey={[]}
          items={collapseItems}
          className="bg-zinc-900 border border-zinc-800"
        />
      </div>

      <Modal
        open={modalOpen}
        onOk={handleBackfillConfirm}
        onCancel={() => setModalOpen(false)}
        okText="Yes, run backfill"
        cancelText="Cancel"
        okButtonProps={{
          danger: true,
          disabled: backfilling,
          id: "btn-backfill-confirm-yes",
        }}
        cancelButtonProps={{ id: "btn-backfill-confirm-cancel" }}
        title={
          <span className="flex items-center gap-2 text-amber-400">
            <WarningOutlined />
            Confirm Skill Vocabulary &amp; Embedding Backfill
          </span>
        }
        centered
      >
        <p className="text-zinc-300 mt-2">
          This operation will reset the canonical skill vocabulary and
          regenerate 1024-dimension embeddings:
        </p>
        <ul className="list-disc list-inside text-zinc-400 text-sm mt-2 space-y-1">
          <li>
            Clears all canonical <strong>SkillEmbedding</strong> entries and
            cascades to reset learned <strong>SkillAlias</strong> mappings.
          </li>
          <li>
            Resets user profile embedding sync timestamps so profiles re-sync on
            next access.
          </li>
          <li>
            Reindexes completed job embeddings from persisted{" "}
            <code>jobFacts.mustHave</code> without LLM calls.
          </li>
        </ul>
        <p className="text-amber-400 text-sm mt-3">
          Only one backfill can run at a time. Ensure LiteLLM and Ollama are
          online before proceeding.
        </p>
      </Modal>
    </>
  );
}
