import React from "react";
import JobList from "@/components/jobs/JobList";

export const metadata = {
  title: "Job Matching | ApplyCopilot",
  description: "View scraped job listings ranked dynamically by semantic similarity with your profile.",
};

export default function JobsPage() {
  return (
    <div className="h-full">
      <JobList />
    </div>
  );
}
