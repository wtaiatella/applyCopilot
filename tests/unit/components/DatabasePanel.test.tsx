/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import DatabasePanel from "@/components/settings/DatabasePanel";

const renderWithApp = () =>
  render(
    <AntApp>
      <DatabasePanel />
    </AntApp>
  );

describe("DatabasePanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders both Wipe Profile Data and Wipe Application Tracker actions inside Database collapse", async () => {
    renderWithApp();

    const header = screen.getByText("Database");
    fireEvent.click(header);

    expect(await screen.findByText("Wipe My Profile Data")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Wipe Application Tracker/i })
    ).toBeInTheDocument();
    expect(document.getElementById("btn-wipe-profile-data")).toBeInTheDocument();
    expect(
      document.getElementById("btn-wipe-application-tracker")
    ).toBeInTheDocument();
  });

  it("calls /api/admin/database/wipe-application-tracker after confirmation modal", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        summary: {
          ApplicationEvents: 2,
          Applications: 1,
          CVBullets: 3,
          CVs: 1,
          JobFavorites: 2,
          JobAnalyses: 1,
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderWithApp();
    fireEvent.click(screen.getByText("Database"));

    const wipeBtn = await screen.findByRole("button", {
      name: /Wipe Application Tracker/i,
    });
    fireEvent.click(wipeBtn);

    const confirmBtn = await screen.findByRole("button", {
      name: /Yes, wipe tracker/i,
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/database/wipe-application-tracker",
        { method: "POST" }
      );
    });
  });
});
