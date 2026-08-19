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
  disqualified: false,
  disqualifyReason: null,
  jobFacts: {
    niceToHave: ["GraphQL", "Redis"],
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

  it("renders nice-to-have skills and Conditions & Preferences comparison rows", async () => {
    render(<JobDetailsPanel job={baseJob} />);

    await waitFor(() => {
      expect(screen.getByText("Nice-to-Have Skills")).toBeInTheDocument();
    });

    expect(screen.getByText("Redis")).toBeInTheDocument();
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
