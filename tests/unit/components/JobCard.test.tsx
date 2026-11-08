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

describe("JobCard - compact salary line (APC-44)", () => {
  const facts = { salaryMin: 40, salaryMax: 60, currency: "USD" };

  it("shows /hr for an hourly salary (AC-1)", () => {
    render(
      <JobCard
        job={{ ...baseJob, jobFacts: { ...facts, salaryPeriod: "HOURLY" } }}
        isSelected={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("US$40 - US$60/hr")).toBeInTheDocument();
  });

  it("shows /mo for a monthly salary", () => {
    render(
      <JobCard
        job={{
          ...baseJob,
          jobFacts: { salaryMin: 5000, salaryMax: 8000, currency: "USD", salaryPeriod: "MONTHLY" },
        }}
        isSelected={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("US$5k - US$8k/mo")).toBeInTheDocument();
  });

  it("renders /yr when the salaryPeriod key is absent (legacy fact)", () => {
    render(
      <JobCard
        job={{ ...baseJob, jobFacts: { salaryMin: 120000, salaryMax: 160000, currency: "USD" } }}
        isSelected={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("US$120k - US$160k/yr")).toBeInTheDocument();
  });

  it("renders no suffix when salaryPeriod is null", () => {
    render(
      <JobCard
        job={{ ...baseJob, jobFacts: { ...facts, salaryPeriod: null } }}
        isSelected={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("US$40 - US$60")).toBeInTheDocument();
  });

  it("omits the salary line when there is no salary (AC-7)", () => {
    const { container } = render(
      <JobCard
        job={{
          ...baseJob,
          jobFacts: { salaryMin: null, salaryMax: null, currency: null },
        }}
        isSelected={false}
        onClick={() => {}}
      />,
    );
    expect(container.textContent).not.toMatch(/\/(hr|mo|yr)/);
    expect(container.textContent).not.toMatch(/US\$/);
    expect(container.querySelector("[title*='US$']")).toBeNull();
  });

  it("omits the salary line when jobFacts is absent", () => {
    const { container } = render(
      <JobCard job={baseJob} isSelected={false} onClick={() => {}} />,
    );
    expect(container.textContent).not.toMatch(/US\$/);
    expect(container.querySelector("[title*='US$']")).toBeNull();
  });
});
