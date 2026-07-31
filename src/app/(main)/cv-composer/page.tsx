"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Table, Tag, Typography, Spin, Alert, Empty } from "antd";
import { FileText } from "lucide-react";

const { Title, Paragraph } = Typography;

interface JobListItem {
  id: string;
  title: string;
  company: string;
}

type CVHubStatus = "not_started" | "draft" | "applied";

interface HubRow {
  jobId: string;
  title: string;
  company: string;
  status: CVHubStatus;
}

const statusTag: Record<CVHubStatus, { color: string; label: string }> = {
  not_started: { color: "default", label: "Not Started" },
  draft: { color: "gold", label: "Draft" },
  applied: { color: "green", label: "Applied" },
};

/**
 * Sidebar hub/list page (FR-19, AC.12) — lists jobs that have Deep Analysis completed and/or
 * an existing CV, with a status badge per row. Clicking any row navigates to the per-job CV
 * Composer route (`/jobs/[id]/cv-composer`), which idempotently creates-or-gets the CV on
 * mount (T009/T014) — this converges both entry points onto the same composer screen with
 * no separate/duplicate CV Editor UI here.
 */
export default function CVComposerHubPage() {
  const router = useRouter();
  const [rows, setRows] = useState<HubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const jobsRes = await fetch("/api/jobs?days=365&limit=100");
        if (!jobsRes.ok) throw new Error("Failed to load jobs");
        const jobs = (await jobsRes.json()) as JobListItem[];

        const checked = await Promise.all(
          jobs.map(async (job) => {
            const [analysisRes, cvRes] = await Promise.all([
              fetch(`/api/jobs/${job.id}/analyze`),
              fetch(`/api/jobs/${job.id}/cv`),
            ]);

            const analysis = analysisRes.ok
              ? await analysisRes.json()
              : { cached: false };
            const cv = cvRes.ok
              ? await cvRes.json()
              : { status: "not_started" as CVHubStatus };

            const hasDeepAnalysis = Boolean(analysis.cached);
            const status: CVHubStatus = cv.status ?? "not_started";

            if (!hasDeepAnalysis && status === "not_started") {
              return null;
            }

            return {
              jobId: job.id,
              title: job.title,
              company: job.company,
              status,
            } as HubRow;
          }),
        );

        if (!cancelled) {
          setRows(checked.filter((r): r is HubRow => r !== null));
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load CV hub",
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
      title: "CV Status",
      dataIndex: "status",
      key: "status",
      render: (status: CVHubStatus) => (
        <Tag color={statusTag[status].color}>{statusTag[status].label}</Tag>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Title level={2} style={{ margin: 0 }}>
          <FileText className="inline-block mr-2" size={22} />
          CV Composer
        </Title>
        <Paragraph type="secondary" className="mt-2">
          Jobs with Deep Analysis completed and/or a tailored CV. Click a row to
          open or start its CV.
        </Paragraph>
      </div>

      {error && <Alert type="error" message={error} showIcon />}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spin size="large" />
        </div>
      ) : rows.length === 0 ? (
        <Empty description="No jobs with Deep Analysis or a CV yet" />
      ) : (
        <Table
          rowKey="jobId"
          columns={columns}
          dataSource={rows}
          pagination={false}
          onRow={(row) => ({
            onClick: () => router.push(`/jobs/${row.jobId}/cv-composer`),
            style: { cursor: "pointer" },
          })}
        />
      )}
    </div>
  );
}
