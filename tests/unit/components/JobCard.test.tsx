/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import JobCard, { type JobCardProps } from "@/components/jobs/JobCard";

const baseJob: JobCardProps["job"] = {
  id: "job-1",
  title: "Senior Frontend Engineer",
  company: "Acme Corp",
  location: ["Remote"],
  postedAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  matchScore: 88,
  matchedSkills: ["React", "TypeScript", "GraphQL", "Node.js", "AWS"],
};

describe("JobCard", () => {
  it("renders at most 4 matched-skill tags even when more are provided (FR-15, Cenário 3)", () => {
    render(<JobCard job={baseJob} isSelected={false} onClick={() => {}} />);

    // 5 matchedSkills provided — only the first 4 should render as tags.
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("GraphQL")).toBeInTheDocument();
    expect(screen.getByText("Node.js")).toBeInTheDocument();
    expect(screen.queryByText("AWS")).not.toBeInTheDocument();
  });

  it("renders the numeric match badge and no skill tags when disqualified is not set", () => {
    render(
      <JobCard
        job={{ ...baseJob, matchedSkills: [] }}
        isSelected={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("88% Match")).toBeInTheDocument();
  });

  it("applies muted styling and shows the Disqualified badge instead of skill tags when disqualified", () => {
    const { container } = render(
      <JobCard
        job={{
          ...baseJob,
          matchScore: 0,
          disqualified: true,
          disqualifyReason: "Requires US work authorization",
        }}
        isSelected={false}
        onClick={() => {}}
      />,
    );

    expect(screen.getByText("Disqualified")).toBeInTheDocument();
    // Matched-skill tags are suppressed for disqualified jobs.
    expect(screen.queryByText("React")).not.toBeInTheDocument();

    // Muted card styling applied (opacity/grayscale classes).
    const card = container.querySelector(".ant-card");
    expect(card).not.toBeNull();
    expect(card!.className).toEqual(expect.stringContaining("opacity-60"));
  });

  it("shows the 'Sync Profile' fallback badge when matchScore is null (FR-17)", () => {
    render(
      <JobCard
        job={{ ...baseJob, matchScore: null, matchedSkills: [] }}
        isSelected={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("Sync Profile")).toBeInTheDocument();
  });
});
