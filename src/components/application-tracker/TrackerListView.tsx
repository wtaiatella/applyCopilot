"use client";

import { useEffect, useState } from "react";
import { Table, Tag, Typography, Spin, Alert, Empty } from "antd";
import { Star } from "lucide-react";
import type { TrackerListRow } from "@/types/application";
import ApplicationDetailModal from "./ApplicationDetailModal";

const { Text } = Typography;

const cvStatusTag: Record<
  TrackerListRow["cvStatus"],
  { color: string; label: string }
> = {
  not_started: { color: "default", label: "Not Started" },
  draft: { color: "gold", label: "Draft" },
  applied: { color: "green", label: "Applied" },
};

const applicationStageTag: Record<
  NonNullable<TrackerListRow["applicationStage"]>,
  { color: string; label: string }
> = {
  APPLIED: { color: "blue", label: "Applied" },
  SCREENING: { color: "cyan", label: "Screening" },
  TECH_INTERVIEW: { color: "purple", label: "Tech Interview" },
  OFFER: { color: "gold", label: "Offer" },
  FINAL: { color: "green", label: "Final" },
};

/**
 * List view: Favorite / Deep Analysis / CV Status / Application stage columns, sourced from the
 * single consolidated `GET /api/application-tracker/list` read (FR-19, AC.9). Replaces the old
 * CV Composer hub's per-job N+1 fetch pattern — matches this repo's existing `antd` Table-based
 * list conventions (see the former `cv-composer` hub page).
 *
 * Rendered by `/application-tracker`'s List/Board toggle (Phase 5, T031).
 */
export default function TrackerListView() {
  const [rows, setRows] = useState<TrackerListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Detail modal — same pattern as KanbanBoard's (FR-16/US-5), so both List and Board open the
  // same job-detail experience consistently instead of one navigating away and one overlaying.
  const [detailJobListingId, setDetailJobListingId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/application-tracker/list");
        if (!res.ok) throw new Error("Failed to load application tracker list");
        const data = (await res.json()) as { rows: TrackerListRow[] };
        if (!cancelled) {
          setRows(data.rows);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load application tracker list",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Same optimistic toggle pattern as JobCard.tsx's Favorite star (Jobs Matching), reused here
  // so the star is togglable from this list too, not just from Jobs Matching.
  const toggleFavorite = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const current = rows.find((r) => r.jobId === jobId);
    if (!current) return;
    const next = !current.favorite;

    setRows((prev) =>
      prev.map((r) => (r.jobId === jobId ? { ...r, favorite: next } : r)),
    );
    try {
      const res = await fetch(`/api/jobs/${jobId}/favorite`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: next }),
      });
      if (!res.ok) throw new Error("Failed to update favorite");
    } catch {
      setRows((prev) =>
        prev.map((r) => (r.jobId === jobId ? { ...r, favorite: !next } : r)),
      );
    }
  };

  const columns = [
    {
      title: "Job",
      dataIndex: "title",
      key: "title",
    },
    {
      title: "Company",
      dataIndex: "company",
      key: "company",
    },
    {
      title: "Favorite",
      dataIndex: "favorite",
      key: "favorite",
      render: (favorite: boolean, record: TrackerListRow) => (
        <button
          type="button"
          onClick={(e) => toggleFavorite(record.jobId, e)}
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={favorite}
          className="inline-flex items-center justify-center bg-transparent border-0 p-0 cursor-pointer"
        >
          <Star
            size={16}
            className={favorite ? "text-yellow-400" : "text-zinc-600"}
            fill={favorite ? "currentColor" : "none"}
          />
        </button>
      ),
    },
    {
      title: "Deep Analysis",
      dataIndex: "deepAnalysisDone",
      key: "deepAnalysisDone",
      render: (done: boolean) => (
        <Tag color={done ? "green" : "default"}>
          {done ? "Done" : "Not Done"}
        </Tag>
      ),
    },
    {
      title: "CV Status",
      dataIndex: "cvStatus",
      key: "cvStatus",
      render: (status: TrackerListRow["cvStatus"]) => (
        <Tag color={cvStatusTag[status].color}>{cvStatusTag[status].label}</Tag>
      ),
    },
    {
      title: "Application Stage",
      dataIndex: "applicationStage",
      key: "applicationStage",
      render: (stage: TrackerListRow["applicationStage"]) =>
        stage ? (
          <Tag color={applicationStageTag[stage].color}>
            {applicationStageTag[stage].label}
          </Tag>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message={error} showIcon />;
  }

  if (rows.length === 0) {
    return <Empty description="No favorited, analyzed, or tracked jobs yet" />;
  }

  return (
    <>
      <Table
        rowKey="jobId"
        columns={columns}
        dataSource={rows}
        pagination={false}
        onRow={(row) => ({
          onClick: () => setDetailJobListingId(row.jobId),
          style: { cursor: "pointer" },
        })}
      />

      <ApplicationDetailModal
        jobListingId={detailJobListingId}
        onClose={() => setDetailJobListingId(null)}
      />
    </>
  );
}
