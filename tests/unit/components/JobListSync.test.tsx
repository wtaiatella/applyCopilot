/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import JobList from "@/components/jobs/JobList";
import { ProfileProvider, useProfileContext } from "@/contexts/ProfileContext";

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

global.fetch = jest.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    statusText: "OK",
    json: () => Promise.resolve(mockJobs),
  })
) as jest.Mock;

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
    const profileService = require("@/services/profileService").ProfileService;
    jest.spyOn(profileService, "syncProfile").mockResolvedValue({
      success: true,
      cleanedText: "Synced CV Text",
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
});
