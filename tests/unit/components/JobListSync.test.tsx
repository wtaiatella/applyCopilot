/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import React from "react";
import {
  render,
  screen,
  waitFor,
  act,
  fireEvent,
  within,
} from "@testing-library/react";
import JobList, { type Job } from "@/components/jobs/JobList";
import { ProfileProvider, useProfileContext } from "@/contexts/ProfileContext";
import { ProfileService } from "@/services/profileService";

// Polyfill MessageChannel for jsdom
if (typeof global.MessageChannel === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MessageChannel } = require("worker_threads");
  global.MessageChannel = MessageChannel;
}

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock fetch
const mockJobs = [
  {
    id: "job-1",
    portalId: "portal-1",
    externalJobId: "ext-1",
    title: "Senior Full Stack Engineer",
    company: "Acme Corp",
    location: "Remote",
    url: "https://example.com/job1",
    isFullDescriptionFetched: true,
    fullDescription: "Great job description",
    postedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    matchScore: 88,
  },
];

const defaultFetchImpl = () =>
  Promise.resolve({
    ok: true,
    statusText: "OK",
    json: () => Promise.resolve(mockJobs),
  });

global.fetch = jest.fn().mockImplementation(defaultFetchImpl) as jest.Mock;

function mockSequentialJobsFetch(responses: Job[][]) {
  let jobsCallIndex = 0;
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (typeof url === "string" && url.startsWith("/api/jobs?")) {
      const payload =
        responses[Math.min(jobsCallIndex, responses.length - 1)] ?? [];
      jobsCallIndex += 1;
      return Promise.resolve({
        ok: true,
        statusText: "OK",
        json: () => Promise.resolve(payload),
      });
    }
    if (typeof url === "string" && url.includes("/analyze")) {
      return Promise.resolve({
        ok: true,
        statusText: "OK",
        json: () => Promise.resolve({ cached: false }),
      });
    }
    return Promise.resolve({
      ok: true,
      statusText: "OK",
      json: () => Promise.resolve({}),
    });
  });
}

function buildJob(overrides: Partial<Job> & { id: string }): Job {
  return {
    portalId: "portal-1",
    externalJobId: `ext-${overrides.id}`,
    title: "Senior Full Stack Engineer",
    company: "Acme Corp",
    location: "Remote",
    url: `https://example.com/${overrides.id}`,
    isFullDescriptionFetched: true,
    fullDescription: "Great job description",
    postedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    matchScore: 88,
    matchedSkills: ["React", "Go"],
    missingSkills: [],
    ...overrides,
  };
}

function TestContainer() {
  const { syncProfile } = useProfileContext();
  return (
    <div>
      <button onClick={() => syncProfile()} data-testid="sync-button">
        Sync Profile
      </button>
      <JobList />
    </div>
  );
}

describe("JobList Reactive Sync Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockImplementation(defaultFetchImpl);
  });

  it("fetches jobs initially on mount", async () => {
    render(
      <ProfileProvider>
        <JobList />
      </ProfileProvider>
    );

    await waitFor(() => {
      const jobFetchCalls = (global.fetch as jest.Mock).mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("/api/jobs")
      );
      expect(jobFetchCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("re-fetches jobs automatically when lastSyncedAt updates via syncProfile", async () => {
    // Mock ProfileService.syncProfile
    jest.spyOn(ProfileService, "syncProfile").mockResolvedValue({
      success: true,
      profileFacts: {
        skills: ["React"],
        softSkills: [],
        seniority: "senior",
        totalYearsExperience: 5,
        domains: [],
      },
    });

    render(
      <ProfileProvider>
        <TestContainer />
      </ProfileProvider>
    );

    let initialJobFetchCount = 0;
    await waitFor(() => {
      const jobFetchCalls = (global.fetch as jest.Mock).mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("/api/jobs")
      );
      expect(jobFetchCalls.length).toBeGreaterThanOrEqual(1);
      initialJobFetchCount = jobFetchCalls.length;
    });

    // Simulate Profile Sync
    const syncButton = screen.getByTestId("sync-button");
    await act(async () => {
      syncButton.click();
    });

    await waitFor(() => {
      const jobFetchCalls = (global.fetch as jest.Mock).mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("/api/jobs")
      );
      expect(jobFetchCalls.length).toBeGreaterThan(initialJobFetchCount);
    });
  });

  it('updates open JobDetailsPanel match score and Matched/Missing skill lists in place on "Update Job List" without re-selecting', async () => {
    const beforeThresholdChange = buildJob({
      id: "job-1",
      matchScore: 88,
      matchedSkills: ["React", "Go"],
      missingSkills: [],
    });
    const afterThresholdChange = buildJob({
      id: "job-1",
      matchScore: 62,
      matchedSkills: ["React"],
      missingSkills: ["Go"],
    });

    mockSequentialJobsFetch([
      [beforeThresholdChange],
      [afterThresholdChange],
    ]);

    render(
      <ProfileProvider>
        <JobList />
      </ProfileProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("88% Match")).toBeInTheDocument();
      expect(screen.getByTestId("match-comparison")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /update job list/i })
      ).not.toHaveClass("ant-btn-loading");
    });

    const initialComparison = screen.getByTestId("match-comparison");
    const initialMatchedSection = within(initialComparison)
      .getByText("Matched Must-Have Skills")
      .parentElement!;
    const initialMissingSection = within(initialComparison)
      .getByText("Missing Must-Have Skills")
      .parentElement!;

    expect(within(initialMatchedSection).getByText("React")).toBeInTheDocument();
    expect(within(initialMatchedSection).getByText("Go")).toBeInTheDocument();
    expect(
      within(initialMissingSection).getByText("All must-have requirements matched.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /update job list/i }));

    await waitFor(() => {
      expect(screen.getByText("62% Match")).toBeInTheDocument();
      expect(screen.queryByText("88% Match")).not.toBeInTheDocument();
    });

    const updatedComparison = screen.getByTestId("match-comparison");
    const updatedMatchedSection = within(updatedComparison)
      .getByText("Matched Must-Have Skills")
      .parentElement!;
    const updatedMissingSection = within(updatedComparison)
      .getByText("Missing Must-Have Skills")
      .parentElement!;

    expect(within(updatedMatchedSection).getByText("React")).toBeInTheDocument();
    expect(within(updatedMatchedSection).queryByText("Go")).not.toBeInTheDocument();
    expect(within(updatedMissingSection).getByText("Go")).toBeInTheDocument();
    expect(
      within(updatedMissingSection).queryByText("All must-have requirements matched.")
    ).not.toBeInTheDocument();

    const jobsApiCalls = (global.fetch as jest.Mock).mock.calls.filter(
      (call) => typeof call[0] === "string" && call[0].startsWith("/api/jobs?")
    );
    expect(jobsApiCalls).toHaveLength(2);
  });

  it("falls back to the first job when the previously selected job is filtered out on refresh", async () => {
    const job1 = buildJob({
      id: "job-1",
      title: "Senior Full Stack Engineer",
      company: "Acme Corp",
      matchScore: 85,
      matchedSkills: ["React"],
      missingSkills: [],
    });
    const job2 = buildJob({
      id: "job-2",
      title: "Backend Platform Engineer",
      company: "Beta Systems",
      matchScore: 76,
      matchedSkills: ["Rust"],
      missingSkills: ["Go"],
    });

    mockSequentialJobsFetch([[job1, job2], [job1]]);

    render(
      <ProfileProvider>
        <JobList />
      </ProfileProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Backend Platform Engineer")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /update job list/i })
      ).not.toHaveClass("ant-btn-loading");
    });

    // Select job-2
    fireEvent.click(screen.getByText("Backend Platform Engineer"));

    await waitFor(() => {
      const comparison = screen.getByTestId("match-comparison");
      expect(within(comparison).getByText("Rust")).toBeInTheDocument();
    });

    // Refresh where job-2 is filtered out
    fireEvent.click(screen.getByRole("button", { name: /update job list/i }));

    await waitFor(() => {
      expect(
        screen.queryByText("Backend Platform Engineer")
      ).not.toBeInTheDocument();
      const comparison = screen.getByTestId("match-comparison");
      expect(within(comparison).getByText("React")).toBeInTheDocument();
      expect(within(comparison).queryByText("Rust")).not.toBeInTheDocument();
    });
  });

  it("falls back to empty state when all jobs are filtered out on refresh", async () => {
    const job1 = buildJob({
      id: "job-1",
      matchScore: 88,
      matchedSkills: ["React"],
      missingSkills: [],
    });

    mockSequentialJobsFetch([[job1], []]);

    render(
      <ProfileProvider>
        <JobList />
      </ProfileProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("match-comparison")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /update job list/i })
      ).not.toHaveClass("ant-btn-loading");
    });

    fireEvent.click(screen.getByRole("button", { name: /update job list/i }));

    await waitFor(() => {
      expect(screen.getByText("No Job Selected")).toBeInTheDocument();
      expect(
        screen.getByText(
          "No active job listings found for the selected filters."
        )
      ).toBeInTheDocument();
      expect(screen.queryByTestId("match-comparison")).not.toBeInTheDocument();
    });
  });
});
