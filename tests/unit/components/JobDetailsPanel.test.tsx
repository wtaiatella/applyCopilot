/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import JobDetailsPanel from "@/components/jobs/JobDetailsPanel";

const baseJob = {
  id: "job-1",
  title: "Senior Backend Engineer",
  company: "Acme Corp",
  url: "https://example.com/job",
  isFullDescriptionFetched: true,
  fullDescription: "We are hiring...",
  matchedSkills: ["Node.js", "PostgreSQL"],
  missingSkills: ["Kubernetes"],
  niceToHaveMatched: ["GraphQL"],
  niceToHaveMissing: ["Redis"],
  softSkillsMatched: ["Communication"],
  softSkillsMissing: ["Leadership"],
  disqualified: false,
  disqualifyReason: null,
  jobFacts: {
    niceToHave: ["GraphQL", "Redis"],
    softSkills: ["Communication", "Leadership"],
    seniority: "senior",
    yearsExperienceMin: 5,
    workMode: "remote",
    isWorldwide: true,
    requiresUsWorkAuth: false,
    providesRelocationVisa: null,
    employmentType: "permanent",
    salaryMin: 120_000,
    salaryMax: 160_000,
    currency: "USD",
  },
};

beforeEach(() => {
  global.fetch = jest.fn().mockImplementation(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ cached: false }),
    }),
  ) as jest.Mock;
});

describe("JobDetailsPanel — Match Comparison section (FR-16, Cenário 4)", () => {
  it("renders the full (untruncated) matched and missing must-have skill lists", async () => {
    render(<JobDetailsPanel job={baseJob} />);

    await waitFor(() => {
      expect(screen.getByText("Match Comparison")).toBeInTheDocument();
    });

    expect(screen.getByText("Node.js")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
    expect(screen.getByText("Kubernetes")).toBeInTheDocument();
  });

  it("renders nice-to-have and soft-skills matched/missing breakdowns and Conditions & Preferences comparison rows", async () => {
    render(<JobDetailsPanel job={baseJob} />);

    await waitFor(() => {
      expect(
        screen.getByText("Matched Nice-to-Have Skills"),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("Missing Nice-to-Have Skills")).toBeInTheDocument();
    expect(screen.getByText("GraphQL")).toBeInTheDocument();
    expect(screen.getByText("Redis")).toBeInTheDocument();
    expect(screen.getByText("Matched Soft Skills")).toBeInTheDocument();
    expect(screen.getByText("Missing Soft Skills")).toBeInTheDocument();
    expect(screen.getByText("Communication")).toBeInTheDocument();
    expect(screen.getByText("Leadership")).toBeInTheDocument();
    expect(screen.getByText("Conditions & Preferences")).toBeInTheDocument();
    expect(screen.getByText(/Work Mode: remote/)).toBeInTheDocument();
    expect(screen.getByText(/Worldwide: Yes/)).toBeInTheDocument();
    expect(screen.getByText(/Seniority: senior/)).toBeInTheDocument();
  });

  it("keeps the existing AI Deep-Analysis CTA present alongside the new section", async () => {
    render(<JobDetailsPanel job={baseJob} />);

    await waitFor(() => {
      expect(screen.getByText("AI Candidacy Match")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /Analyze with AI/i }),
    ).toBeInTheDocument();
  });

  it("shows the disqualification reason banner when the job is disqualified", async () => {
    render(
      <JobDetailsPanel
        job={{
          ...baseJob,
          disqualified: true,
          disqualifyReason: "Requires US work authorization",
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Disqualified")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Requires US work authorization"),
    ).toBeInTheDocument();
  });
});

describe("JobDetailsPanel - salary period display (APC-44)", () => {
  const withFacts = (facts: Record<string, unknown>) => ({
    ...baseJob,
    jobFacts: { ...baseJob.jobFacts, ...facts },
  });

  it("shows /yr for a legacy fact with the salaryPeriod key absent (AC-2)", async () => {
    render(<JobDetailsPanel job={baseJob} />);
    await waitFor(() => {
      expect(
        screen.getByText(/Salary Range: US\$120,000 - US\$160,000\/yr/),
      ).toBeInTheDocument();
    });
  });

  it("shows /hr for an hourly salary", async () => {
    render(
      <JobDetailsPanel
        job={withFacts({ salaryMin: 40, salaryMax: 60, salaryPeriod: "HOURLY" })}
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByText(/Salary Range: US\$40 - US\$60\/hr/),
      ).toBeInTheDocument();
    });
  });

  it("shows the amount with no suffix when salaryPeriod is null", async () => {
    render(<JobDetailsPanel job={withFacts({ salaryPeriod: null })} />);
    await waitFor(() => {
      expect(
        screen.getByText(/Salary Range: US\$120,000 - US\$160,000$/),
      ).toBeInTheDocument();
    });
  });

  it("shows Not specified when there is no usable salary", async () => {
    render(
      <JobDetailsPanel job={withFacts({ salaryMin: null, salaryMax: null })} />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Salary Range: Not specified/)).toBeInTheDocument();
    });
  });
});
