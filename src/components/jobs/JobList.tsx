"use client";

import React, { useState, useEffect, useRef } from "react";
import { Select, Button, Space, Typography, Spin, Alert, Empty } from "antd";
import { RefreshCw, SlidersHorizontal, Sparkles } from "lucide-react";
import JobCard from "./JobCard";
import JobDetailsPanel from "./JobDetailsPanel";
import { useProfileContext } from "@/contexts/ProfileContext";

const { Text, Title } = Typography;

export interface JobFactsSummary {
  niceToHave: string[];
  softSkills: string[];
  seniority: string | null;
  yearsExperienceMin: number | null;
  workMode: string | null;
  isWorldwide: boolean | null;
  requiresUsWorkAuth: boolean | null;
  providesRelocationVisa: boolean | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
}

export interface Job {
  id: string;
  portalId: string;
  externalJobId: string;
  title: string;
  company: string;
  location: string[] | string | null;
  url: string;
  isFullDescriptionFetched: boolean;
  fullDescription: string | null;
  postedAt: string | Date | null;
  createdAt: string | Date | null;
  matchScore: number | null;
  matchedSkills?: string[];
  missingSkills?: string[];
  niceToHaveMatched?: string[];
  niceToHaveMissing?: string[];
  softSkillsMatched?: string[];
  softSkillsMissing?: string[];
  disqualified?: boolean;
  disqualifyReason?: string | null;
  jobFacts?: JobFactsSummary | null;
  favorite?: boolean;
}

export default function JobList() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Filter States
  const [days, setDays] = useState<number>(15);
  const [minMatch, setMinMatch] = useState<number | undefined>(undefined);

  // Profile Context (optional fallback for un-wrapped unit tests)
  let lastSyncedAt: number | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const profileCtx = useProfileContext();
    lastSyncedAt = profileCtx.lastSyncedAt;
  } catch {
    lastSyncedAt = null;
  }

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/jobs?days=${days}&limit=100`;
      if (minMatch !== undefined) {
        url += `&minMatch=${minMatch}`;
      }
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load jobs: ${response.statusText}`);
      }
      const data = (await response.json()) as Job[];
      setJobs(data);

      // Select the first job by default if jobs are returned and the previously selected job is no longer in the list
      if (data.length > 0) {
        setSelectedJob((prev) => {
          const stillExists = prev ? data.some((j) => j.id === prev.id) : false;
          return stillExists ? prev : data[0];
        });
      } else {
        setSelectedJob(null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevSyncedAtRef = useRef<number | null>(lastSyncedAt);

  useEffect(() => {
    if (lastSyncedAt && lastSyncedAt !== prevSyncedAtRef.current) {
      prevSyncedAtRef.current = lastSyncedAt;
      fetchJobs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSyncedAt]);

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Top Filter and Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-950/40 border border-zinc-900 p-4 rounded-2xl shadow-sm">
        <Space size="middle" wrap className="items-center">
          <span className="flex items-center gap-2 text-zinc-400 font-semibold text-sm">
            <SlidersHorizontal size={16} className="text-zinc-500" />
            Filters:
          </span>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
              Published Within
            </span>
            <Select
              value={days}
              onChange={setDays}
              popupClassName="bg-zinc-950 border-zinc-800 text-white"
              style={{ width: 140 }}
              options={[
                { value: 7, label: "Last 7 days" },
                { value: 15, label: "Last 15 days" },
                { value: 30, label: "Last 30 days" },
                { value: 90, label: "Last 90 days" },
                { value: 365, label: "Last Year" },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
              Minimum Match %
            </span>
            <Select
              value={minMatch}
              onChange={setMinMatch}
              allowClear
              placeholder="Show All"
              popupClassName="bg-zinc-950 border-zinc-800 text-white"
              style={{ width: 160 }}
              options={[
                { value: 80, label: "High Match (≥ 80%)" },
                { value: 60, label: "Medium Match (≥ 60%)" },
                { value: 40, label: "Low Match (≥ 40%)" },
              ]}
            />
          </div>
        </Space>

        <Button
          type="primary"
          icon={
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          }
          onClick={fetchJobs}
          loading={loading}
          className="bg-blue-600 hover:bg-blue-500 border-0 text-white font-bold h-10 px-5 rounded-xl shadow-lg shadow-blue-950/20"
        >
          Update Job List
        </Button>
      </div>

      {/* Main Grid: Job Cards left, Details right */}
      <div
        className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0"
        style={{ height: "calc(100vh - 200px)" }}
      >
        {/* Left Side: Job Cards List (Col-span 5) */}
        <div className="lg:col-span-5 flex flex-col h-full min-h-0">
          {error && (
            <Alert
              message="Failed to retrieve jobs"
              description={error}
              type="error"
              showIcon
              className="mb-4 bg-red-950/20 border-red-900 text-red-300"
            />
          )}

          <div className="flex-1 overflow-y-auto pr-2 space-y-3.5 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
            {loading && jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 space-y-4">
                <Spin size="large" />
                <Text className="text-zinc-400 font-medium">
                  Scanning vectors and retrieving jobs...
                </Text>
              </div>
            ) : jobs.length === 0 ? (
              <Empty
                description={
                  <span className="text-zinc-500 font-medium text-sm">
                    No active job listings found for the selected filters.
                  </span>
                }
                className="py-16 bg-zinc-950/20 border border-zinc-900 border-dashed rounded-2xl"
              />
            ) : (
              jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  isSelected={selectedJob?.id === job.id}
                  onClick={() => setSelectedJob(job)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right Side: Selected Job Detail (Col-span 7) */}
        <div className="lg:col-span-7 h-full min-h-0 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          {selectedJob ? (
            <JobDetailsPanel job={selectedJob} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-zinc-950/10 border border-zinc-900/60 rounded-2xl border-dashed">
              <Sparkles
                size={40}
                className="text-zinc-700 animate-pulse mb-3"
              />
              <Title level={4} style={{ color: "#71717a", margin: 0 }}>
                No Job Selected
              </Title>
              <Text className="text-zinc-500 text-sm mt-1 max-w-xs block">
                Select a job card from the listing to read the full description
                and dynamic match details.
              </Text>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
