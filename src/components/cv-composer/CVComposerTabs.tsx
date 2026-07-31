"use client";

import React, { useEffect, useState } from "react";
import {
  Tabs,
  Alert,
  Spin,
  Typography,
  Badge,
  Button,
  Modal,
  Tag,
  List,
  Divider,
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import { useCVComposer } from "@/contexts/CVComposerContext";
import CVEditor from "./CVEditor";
import CVViewer from "./CVViewer";

const { Title, Paragraph } = Typography;

interface DeepAnalysisData {
  strengths: string[];
  weaknesses: string[];
  missingSkills: string[];
  verdict: "APPLY" | "CAUTION" | "IGNORE";
  justification: string;
}

function getVerdictDetails(verdict: DeepAnalysisData["verdict"]) {
  switch (verdict) {
    case "APPLY":
      return {
        bgColor: "bg-emerald-950/40 border-emerald-900/60 text-emerald-400",
        icon: <CheckCircle2 className="text-emerald-400" size={18} />,
        text: "Recommended to Apply",
      };
    case "CAUTION":
      return {
        bgColor: "bg-amber-950/40 border-amber-900/60 text-amber-400",
        icon: <AlertTriangle className="text-amber-400" size={18} />,
        text: "Proceed with Caution",
      };
    case "IGNORE":
      return {
        bgColor: "bg-rose-950/40 border-rose-900/60 text-rose-400",
        icon: <XCircle className="text-rose-400" size={18} />,
        text: "Not Recommended",
      };
  }
}

/**
 * Tab 2 — Deep Analysis (read-only) + "Run Analysis" fallback action (FR-5, FR-10, AC.6).
 * Reuses the existing, already-cached `GET/POST /api/jobs/[id]/analyze` route (no CV-specific
 * analysis endpoint). When no Deep Analysis exists yet for the job, shows an empty state with
 * a "Run Analysis" button instead of blocking — AI actions elsewhere in the CV Editor still
 * work with reduced context (job description only) in the meantime (FR-10).
 */
function DeepAnalysisTab({ jobListingId }: { jobListingId: string }) {
  const [analysis, setAnalysis] = useState<DeepAnalysisData | null>(null);
  const [checkingCache, setCheckingCache] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setCheckingCache(true);
    });
    fetch(`/api/jobs/${jobListingId}/analyze`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to check analysis cache");
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data.cached && data.analysis) {
          setAnalysis(data.analysis);
        }
      })
      .catch(() => {
        // No cached analysis yet — fall through to the empty state, not an error (FR-10/AC.6).
      })
      .finally(() => {
        if (!cancelled) setCheckingCache(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobListingId]);

  const handleRunAnalysis = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobListingId}/analyze`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error || "Failed to analyze job listing",
        );
      }
      const result = await res.json();
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run analysis.");
    } finally {
      setAnalyzing(false);
    }
  };

  if (checkingCache) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spin size="large" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 p-4">
        <p className="text-xs text-zinc-400 max-w-sm m-0">
          No Deep Analysis has been run for this job yet. Run one to see
          strengths, weaknesses, gaps, and a candidacy recommendation — or keep
          tailoring the CV in the meantime using just the job description.
        </p>
        <Button
          type="primary"
          icon={<Sparkles size={14} />}
          onClick={handleRunAnalysis}
          loading={analyzing}
          className="bg-blue-600 hover:bg-blue-500 border-0 text-white font-bold h-9 px-4 rounded-lg"
        >
          Run Analysis
        </Button>
        {error && (
          <Typography.Text
            type="danger"
            className="text-xs mt-2 block font-medium"
          >
            {error}
          </Typography.Text>
        )}
      </div>
    );
  }

  const verdictDetails = getVerdictDetails(analysis.verdict);

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <Title level={4} className="!text-white !m-0">
          AI Candidacy Match
        </Title>
        <Tag
          className={`m-0 border uppercase font-bold text-xs ${verdictDetails?.bgColor}`}
        >
          {analysis.verdict}
        </Tag>
      </div>

      <div
        className={`flex items-start gap-3 p-4 rounded-xl border ${verdictDetails?.bgColor}`}
      >
        {verdictDetails?.icon}
        <div className="space-y-1">
          <div className="font-bold text-sm text-white">
            {verdictDetails?.text}
          </div>
          <div className="text-xs leading-relaxed text-zinc-300">
            {analysis.justification}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
            <CheckCircle2 size={12} />
            Strengths
          </div>
          {analysis.strengths.length > 0 ? (
            <List
              size="small"
              dataSource={analysis.strengths}
              renderItem={(item) => (
                <List.Item className="border-0 p-0 py-1 text-zinc-300 text-xs leading-relaxed align-top">
                  • {item}
                </List.Item>
              )}
            />
          ) : (
            <div className="text-xs text-zinc-500">None identified.</div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1">
            <XCircle size={12} />
            Weaknesses / Gaps
          </div>
          {analysis.weaknesses.length > 0 ? (
            <List
              size="small"
              dataSource={analysis.weaknesses}
              renderItem={(item) => (
                <List.Item className="border-0 p-0 py-1 text-zinc-300 text-xs leading-relaxed align-top">
                  • {item}
                </List.Item>
              )}
            />
          ) : (
            <div className="text-xs text-zinc-500">None identified.</div>
          )}
        </div>
      </div>

      <Divider className="my-2 border-zinc-800" />

      <div className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
          <Lightbulb size={12} />
          Missing Required Skills
        </div>
        {analysis.missingSkills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {analysis.missingSkills.map((skill, index) => (
              <Tag
                key={index}
                className="m-0 border-0 bg-amber-950/40 text-amber-400 text-xs py-0.5 px-2 rounded font-medium"
              >
                {skill}
              </Tag>
            ))}
          </div>
        ) : (
          <div className="text-xs text-zinc-500">
            All technical requirements matched.
          </div>
        )}
      </div>
    </div>
  );
}

interface JobDescriptionData {
  id: string;
  title: string;
  company: string;
  location: string[];
  url: string;
  fullDescription: string | null;
  isFullDescriptionFetched: boolean;
}

/**
 * Tab 1 — Job Description (read-only). Fetches the job's own record directly (the CV row only
 * stores `jobListingId`); nothing here writes to CV or Profile data.
 */
function JobDescriptionTab({ jobListingId }: { jobListingId: string }) {
  const [job, setJob] = useState<JobDescriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
    });
    fetch(`/api/jobs/${jobListingId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load job description");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setJob(data);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load job description.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobListingId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spin size="large" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <Alert
        type="error"
        message="Job Description"
        description={error || "Job not found."}
        showIcon
      />
    );
  }

  return (
    <div className="p-4 space-y-3">
      <Title level={4} className="!text-white !m-0">
        {job.title}
      </Title>
      <Paragraph className="!text-zinc-400 !m-0">
        {job.company}
        {job.location.length > 0 ? ` — ${job.location.join(", ")}` : ""}
      </Paragraph>
      <div className="text-zinc-300 text-sm whitespace-pre-wrap leading-relaxed">
        {job.fullDescription ||
          "No full description available for this job yet."}
      </div>
    </div>
  );
}

/**
 * 4-tab shell: Tab 1 (Job Description, read-only), Tab 2 (Deep Analysis), Tab 3 (CV Editor),
 * Tab 4 (CV Viewer — Print PDF / Calculate Match Score, FR-5/FR-12/FR-13).
 */
export default function CVComposerTabs({
  jobListingId,
}: {
  jobListingId: string;
}) {
  const { cv, saveStatus, updateSnapshotState, resetCV, applyCV } =
    useCVComposer();
  const [resetting, setResetting] = useState(false);

  if (!cv) return null;

  const readOnly = cv.status === "APPLIED";

  const handleReset = () => {
    Modal.confirm({
      title: "Reset CV to master Profile?",
      content:
        "This discards all edits made in this CV and re-clones every section from your live Profile (FR-11).",
      okText: "Reset",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        setResetting(true);
        try {
          await resetCV();
        } catch {
          Modal.error({
            title: "Reset failed",
            content: "Could not reset the CV. Please try again.",
          });
        } finally {
          setResetting(false);
        }
      },
    });
  };

  const items = [
    {
      key: "job-description",
      label: "Job Description",
      children: <JobDescriptionTab jobListingId={jobListingId} />,
    },
    {
      key: "deep-analysis",
      label: "Deep Analysis",
      children: <DeepAnalysisTab jobListingId={jobListingId} />,
    },
    {
      key: "cv-editor",
      label: "CV Editor",
      children: (
        <CVEditor
          cvId={cv.id}
          snapshot={cv.snapshotData}
          onChange={updateSnapshotState}
          readOnly={readOnly}
        />
      ),
    },
    {
      key: "cv-viewer",
      label: "CV Viewer",
      children: (
        <CVViewer
          cvId={cv.id}
          snapshot={cv.snapshotData}
          status={cv.status}
          onApply={applyCV}
        />
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-2">
        <Badge
          status={
            saveStatus === "saving"
              ? "processing"
              : saveStatus === "error"
                ? "error"
                : "success"
          }
          text={
            saveStatus === "saving"
              ? "Saving..."
              : saveStatus === "error"
                ? "Save failed"
                : readOnly
                  ? "Applied (read-only)"
                  : "Auto-saves active"
          }
          className="text-zinc-400 text-xs"
        />
        {!readOnly && (
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={resetting}
            onClick={handleReset}
            className="border-zinc-700 text-zinc-300"
          >
            Reset to Profile
          </Button>
        )}
      </div>
      <Tabs items={items} />
    </div>
  );
}
