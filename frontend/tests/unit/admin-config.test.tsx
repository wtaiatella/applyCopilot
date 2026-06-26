/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LLMSettingsPanel from "@/components/settings/LLMSettingsPanel";
import { App, message } from "antd";

// Polyfill MessageChannel for React/rc-component in jsdom
if (typeof global.MessageChannel === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MessageChannel } = require("worker_threads");
  global.MessageChannel = MessageChannel;
}

// Mock fetch globally
global.fetch = jest.fn();

const mockModal = {
  confirm: jest.fn().mockImplementation((options: any) => {
    if (options && options.onOk) {
      options.onOk();
    }
  }),
};

// Spy on App.useApp to return mocked message api from jest.setup
jest.spyOn(App, "useApp").mockReturnValue({
  message: message,
  modal: mockModal as any,
  notification: {} as any,
});

describe("LLMSettingsPanel Unit Tests", () => {
  const mockConfig = {
    defaultProvider: "ollama" as const,
    parsingProvider: "ollama" as const,
    summariesProvider: "gemini" as const,
  };

  const mockCredentialStatus = {
    ollama: true,
    gemini: false,
    claude: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render collapsed panel and show contents on expand", async () => {
    render(<LLMSettingsPanel config={mockConfig} credentialStatus={mockCredentialStatus} />);

    // Initially collapsed, but header "LLM Models" is visible
    const header = screen.getByText("LLM Models");
    expect(header).toBeInTheDocument();

    // In Ant Design, the panel can be expanded by clicking the header
    fireEvent.click(header);

    // Form fields are visible after expanding
    expect(screen.getByText("Default Provider")).toBeInTheDocument();
    expect(screen.getByText("Parsing Provider")).toBeInTheDocument();
    expect(screen.getByText("Summaries Provider")).toBeInTheDocument();
  });

  it("should submit the form with new values when Save is clicked", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<LLMSettingsPanel config={mockConfig} credentialStatus={mockCredentialStatus} />);

    // Expand panel
    const header = screen.getByText("LLM Models");
    fireEvent.click(header);

    // Click Save Configuration
    const saveButton = screen.getByText("Save Configuration");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/admin/llm-config", expect.any(Object));
    });

    // Check request body matches initialValues if unchanged
    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const fetchBody = JSON.parse(callArgs[1].body);
    expect(fetchBody).toEqual(mockConfig);

    expect(message.success).toHaveBeenCalledWith("LLM configuration saved successfully!");
  });

  it("should assert badge text renders correctly for each credential status combination", () => {
    // 1. All true
    const { rerender } = render(
      <LLMSettingsPanel
        config={mockConfig}
        credentialStatus={{ ollama: true, gemini: true, claude: true }}
      />
    );
    // Expand collapse
    fireEvent.click(screen.getByText("LLM Models"));
    
    // We should see three "✓ Configured" badges (one for each provider option)
    const configuredBadges = screen.getAllByText("✓ Configured");
    expect(configuredBadges.length).toBe(3);

    // 2. Gemini and Claude false, but selected so they render in closed Selects
    render(
      <LLMSettingsPanel
        config={{
          defaultProvider: "ollama",
          parsingProvider: "gemini",
          summariesProvider: "claude",
        }}
        credentialStatus={{ ollama: true, gemini: false, claude: false }}
      />
    );
    // Expand collapse
    fireEvent.click(screen.getAllByText("LLM Models")[1]); // click the second panel header

    expect(screen.getAllByText("✓ Configured").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("⚠️ API key not set").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("❌ Not configured").length).toBeGreaterThanOrEqual(1);
  });
});
