/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import React from "react";
import { App } from "antd";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import SkillMatchingPanel from "@/components/settings/SkillMatchingPanel";

function createFetchMock(overrides?: {
  aliasThreshold?: number;
  matchThreshold?: number;
  backfillImpl?: () => Promise<Response>;
}) {
  const aliasThreshold = overrides?.aliasThreshold ?? 60;
  const matchThreshold = overrides?.matchThreshold ?? 83;

  return jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url === "/api/admin/skill-threshold" && (!init || init.method === "GET")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ threshold: aliasThreshold }),
      });
    }
    if (
      url === "/api/admin/skill-match-threshold" &&
      (!init || init.method === "GET")
    ) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ threshold: matchThreshold }),
      });
    }
    if (
      (url === "/api/admin/skill-threshold" ||
        url === "/api/admin/skill-match-threshold") &&
      init?.method === "POST"
    ) {
      const parsed = JSON.parse(String(init.body ?? "{}")) as {
        threshold: number;
      };
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, threshold: parsed.threshold }),
      });
    }
    if (url === "/api/admin/backfill-skill-vocabulary" && init?.method === "POST") {
      if (overrides?.backfillImpl) {
        return overrides.backfillImpl();
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            profilesReset: 1,
            skillsCleared: 10,
            jobsReindexed: 5,
            jobsSkipped: 0,
          }),
      });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

async function renderAndExpandPanel(
  fetchMock: jest.Mock,
) {
  global.fetch = fetchMock as unknown as typeof fetch;
  render(
    <App>
      <SkillMatchingPanel />
    </App>,
  );

  // Expand the Collapse panel
  const header = screen.getByText(/Skill Matching & Embeddings/i);
  fireEvent.click(header);

  await waitFor(() => {
    expect(
      screen.getByLabelText("Skill Alias Similarity Threshold (%)"),
    ).not.toBeDisabled();
  });
}

describe("SkillMatchingPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads initial thresholds from admin endpoints and persists updated thresholds", async () => {
    const fetchMock = createFetchMock({
      aliasThreshold: 62,
      matchThreshold: 85,
    });
    await renderAndExpandPanel(fetchMock);

    const aliasInput = screen.getByLabelText(
      "Skill Alias Similarity Threshold (%)",
    ) as HTMLInputElement;
    const matchInput = screen.getByLabelText(
      "Skill Match Threshold (%)",
    ) as HTMLInputElement;

    const sliders = screen.getAllByRole("slider");
    expect(sliders[0]).toHaveAttribute("aria-valuenow", "62");
    expect(aliasInput.value).toBe("62");
    expect(matchInput.value).toBe("85");

    fireEvent.change(aliasInput, { target: { value: "65" } });
    fireEvent.change(matchInput, { target: { value: "88" } });

    const saveBtn = screen.getByRole("button", { name: /Save Thresholds/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/skill-threshold",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ threshold: 65 }),
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/skill-match-threshold",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ threshold: 88 }),
        }),
      );
    });
  });

  it("displays Skill Match Threshold copy covering Matched/Missing classification and composite score zeroing while keeping Skill Alias Similarity Threshold distinct", async () => {
    const fetchMock = createFetchMock();
    await renderAndExpandPanel(fetchMock);

    expect(
      screen.getByLabelText("Skill Match Threshold (%)"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Skill Match Display Threshold (%)"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /classify a job skill as Matched\. Skills below this threshold are classified as Missing and contribute 0 to the composite match score\./i,
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Skill Alias Similarity Threshold (%)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /propose canonical skill aliases during ingestion\./i,
      ),
    ).toBeInTheDocument();
  });

  it("opens confirmation modal explaining SkillAlias reset and disables button while backfill is running", async () => {
    let resolveBackfill!: (value: Response) => void;
    const pendingBackfill = new Promise<Response>((resolve) => {
      resolveBackfill = resolve;
    });

    const fetchMock = createFetchMock({
      backfillImpl: () => pendingBackfill,
    });
    await renderAndExpandPanel(fetchMock);

    const backfillBtn = screen.getByRole("button", {
      name: /Reindex Embeddings & Reset Vocabulary/i,
    });
    fireEvent.click(backfillBtn);

    // Confirmation modal should appear with canonical vocabulary & SkillAlias explanation
    expect(
      await screen.findByText(/Confirm Skill Vocabulary & Embedding Backfill/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/SkillAlias/i).length).toBeGreaterThan(0);

    const confirmBtn = screen.getByRole("button", { name: /Yes, run backfill/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/backfill-skill-vocabulary",
        { method: "POST" },
      );
    });

    // While in-flight, the trigger button is disabled to prevent concurrent clicks
    const runningBtn = document.getElementById(
      "btn-backfill-skill-vocabulary",
    ) as HTMLButtonElement;
    expect(runningBtn).toBeDisabled();

    resolveBackfill({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          profilesReset: 1,
          skillsCleared: 10,
          jobsReindexed: 5,
          jobsSkipped: 0,
          skillsReindexed: 12,
        }),
    } as unknown as Response);

    await waitFor(() => {
      expect(runningBtn).not.toBeDisabled();
    });
  });

  it.each([
    [
      409,
      "A skill vocabulary and embedding backfill is already in progress.",
    ],
    [503, "AI service temporarily unavailable. Please try again later."],
  ])(
    "handles %i backfill response and re-enables trigger button",
    async (status, errorMessage) => {
      const fetchMock = createFetchMock({
        backfillImpl: () =>
          Promise.resolve({
            ok: false,
            status,
            json: () => Promise.resolve({ error: errorMessage }),
          } as unknown as Response),
      });
      await renderAndExpandPanel(fetchMock);

      const backfillBtn = screen.getByRole("button", {
        name: /Reindex Embeddings & Reset Vocabulary/i,
      });
      fireEvent.click(backfillBtn);

      const confirmBtn = await screen.findByRole("button", {
        name: /Yes, run backfill/i,
      });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/admin/backfill-skill-vocabulary",
          { method: "POST" },
        );
      });

      const triggerBtn = document.getElementById(
        "btn-backfill-skill-vocabulary",
      ) as HTMLButtonElement;
      await waitFor(() => {
        expect(triggerBtn).not.toBeDisabled();
      });
    },
  );
});
