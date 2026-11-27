/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { ProfileProvider, useProfileContext } from "@/contexts/ProfileContext";
import { ProfileService } from "@/services/profileService";
import type { ProfileDTO, SkillDTO } from "@/types/profile";

jest.mock("@/services/profileService", () => ({
  ProfileService: {
    getProfile: jest.fn(),
    updateBasicData: jest.fn(),
    updateSkills: jest.fn(),
    syncProfile: jest.fn(),
  },
}));

const mockGetProfile = ProfileService.getProfile as jest.Mock;
const mockUpdateSkills = ProfileService.updateSkills as jest.Mock;
const mockUpdateBasicData = ProfileService.updateBasicData as jest.Mock;
const mockSyncProfile = ProfileService.syncProfile as jest.Mock;

function makeBaseProfile(overrides: Partial<ProfileDTO> = {}): ProfileDTO {
  return {
    id: "profile-1",
    basicData: {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: null,
      location: null,
      linkedin: null,
      github: null,
      website: null,
      title: "Senior Engineer",
      summary: "Experienced engineer",
    },
    experiences: [],
    education: [],
    projects: [],
    skills: [],
    references: [],
    summaries: [],
    cvs: [],
    ...overrides,
  };
}

function SyncTestHarness() {
  const {
    profile,
    saveStatus,
    error,
    updateSkillsState,
    updateBasicDataState,
    syncProfile,
  } = useProfileContext();

  return (
    <div>
      <div data-testid="loaded">{profile ? "yes" : "no"}</div>
      <div data-testid="save-status">{saveStatus}</div>
      <div data-testid="error">{error ?? ""}</div>
      <button
        type="button"
        data-testid="edit-and-sync"
        onClick={async () => {
          const nextSkills: SkillDTO[] = [
            {
              id: "skill-1",
              name: "Claude Code",
              proficiency: "ADVANCED",
              yearsExperience: 2,
            },
          ];
          updateSkillsState(nextSkills);
          await syncProfile().catch(() => {
            // Error state asserted via DOM / mocks
          });
        }}
      >
        Edit Skills and Sync
      </button>
      <button
        type="button"
        data-testid="multi-edit-and-sync"
        onClick={async () => {
          updateBasicDataState({ location: "Remote" });
          updateSkillsState([
            {
              id: "skill-2",
              name: "Cursor",
              proficiency: "EXPERT",
              yearsExperience: 2,
            },
          ]);
          await syncProfile().catch(() => {});
        }}
      >
        Multi Edit and Sync
      </button>
    </div>
  );
}

describe("ProfileContext — flushPendingSaves before syncProfile (APC-51 AC-1)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockGetProfile.mockResolvedValue(makeBaseProfile());
    mockUpdateSkills.mockResolvedValue([]);
    mockUpdateBasicData.mockResolvedValue({});
    mockSyncProfile.mockResolvedValue({
      success: true,
      profileFacts: {
        skills: ["Claude Code"],
        softSkills: ["Communication"],
        seniority: "senior",
        totalYearsExperience: 5,
        domains: ["SaaS"],
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("flushes pending debounced updateSkills save BEFORE calling ProfileService.syncProfile and does not double-fire after 1500ms", async () => {
    const callOrder: string[] = [];
    mockUpdateSkills.mockImplementation(async () => {
      callOrder.push("updateSkills");
      return [];
    });
    mockSyncProfile.mockImplementation(async () => {
      callOrder.push("syncProfile");
      return {
        success: true,
        profileFacts: {
          skills: ["Claude Code"],
          softSkills: [],
          seniority: "senior",
          totalYearsExperience: 5,
          domains: [],
        },
      };
    });

    render(
      <ProfileProvider>
        <SyncTestHarness />
      </ProfileProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loaded")).toHaveTextContent("yes");
    });

    await act(async () => {
      screen.getByTestId("edit-and-sync").click();
    });

    expect(callOrder).toEqual(["updateSkills", "syncProfile"]);
    expect(mockUpdateSkills).toHaveBeenCalledTimes(1);
    expect(mockSyncProfile).toHaveBeenCalledTimes(1);

    // Advancing past the 1500ms debounce window must NOT re-invoke the already-flushed save
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockUpdateSkills).toHaveBeenCalledTimes(1);
  });

  it("aborts syncProfile and sets saveStatus to 'error' when a flushed pending save rejects", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockUpdateSkills.mockRejectedValueOnce(new Error("Skills save failed"));

    render(
      <ProfileProvider>
        <SyncTestHarness />
      </ProfileProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loaded")).toHaveTextContent("yes");
    });

    await act(async () => {
      screen.getByTestId("edit-and-sync").click();
    });

    expect(mockUpdateSkills).toHaveBeenCalledTimes(1);
    expect(mockSyncProfile).not.toHaveBeenCalled();
    expect(screen.getByTestId("save-status")).toHaveTextContent("error");

    consoleSpy.mockRestore();
  });

  it("flushes multiple pending debounced saves before syncProfile", async () => {
    const callOrder: string[] = [];
    mockUpdateBasicData.mockImplementation(async () => {
      callOrder.push("updateBasicData");
      return {};
    });
    mockUpdateSkills.mockImplementation(async () => {
      callOrder.push("updateSkills");
      return [];
    });
    mockSyncProfile.mockImplementation(async () => {
      callOrder.push("syncProfile");
      return {
        success: true,
        profileFacts: {
          skills: ["Cursor"],
          softSkills: [],
          seniority: "senior",
          totalYearsExperience: 5,
          domains: [],
        },
      };
    });

    render(
      <ProfileProvider>
        <SyncTestHarness />
      </ProfileProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loaded")).toHaveTextContent("yes");
    });

    await act(async () => {
      screen.getByTestId("multi-edit-and-sync").click();
    });

    expect(callOrder.slice(0, 2)).toEqual(
      expect.arrayContaining(["updateBasicData", "updateSkills"]),
    );
    expect(callOrder[2]).toBe("syncProfile");
  });
});
