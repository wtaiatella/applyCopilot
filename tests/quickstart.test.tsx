/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import AntdThemeProvider, { useTheme } from "@/components/providers/AntdThemeProvider";
import { ExperienceInputSchema, ProjectInputSchema } from "@/lib/validation/profileSchemas";

// Polyfill MessageChannel for jsdom
if (typeof global.MessageChannel === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MessageChannel } = require("worker_threads");
  global.MessageChannel = MessageChannel;
}

// Simple test component that consumes the theme context
function ThemeConsumer() {
  const { themeMode, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-mode">{themeMode}</span>
      <button data-testid="toggle-btn" onClick={toggleTheme}>Toggle</button>
    </div>
  );
}

describe("Quickstart Theme & Validation Tests", () => {
  describe("Theme Persistence (T053b)", () => {
    beforeEach(() => {
      localStorage.clear();
      jest.clearAllMocks();
    });

    it("should default to dark mode when no theme is saved", () => {
      render(
        <AntdThemeProvider>
          <ThemeConsumer />
        </AntdThemeProvider>
      );

      const modeSpan = screen.getByTestId("theme-mode");
      expect(modeSpan.textContent).toBe("dark");
    });

    it("should load light mode from localStorage if preferred", () => {
      localStorage.setItem("theme_preference", "light");

      render(
        <AntdThemeProvider>
          <ThemeConsumer />
        </AntdThemeProvider>
      );

      const modeSpan = screen.getByTestId("theme-mode");
      expect(modeSpan.textContent).toBe("light");
    });

    it("should toggle theme and save preference to localStorage", () => {
      render(
        <AntdThemeProvider>
          <ThemeConsumer />
        </AntdThemeProvider>
      );

      const modeSpan = screen.getByTestId("theme-mode");
      const toggleBtn = screen.getByTestId("toggle-btn");

      expect(modeSpan.textContent).toBe("dark");

      // Click to toggle
      fireEvent.click(toggleBtn);

      expect(modeSpan.textContent).toBe("light");
      expect(localStorage.getItem("theme_preference")).toBe("light");

      // Click to toggle back
      fireEvent.click(toggleBtn);

      expect(modeSpan.textContent).toBe("dark");
      expect(localStorage.getItem("theme_preference")).toBe("dark");
    });
  });

  describe("Zod Validation Verification (T055)", () => {
    it("should validate a valid experience payload", () => {
      const validExperience = {
        company: "Google",
        position: "Software Engineer",
        startDate: "2020-01-01T00:00:00.000Z",
        endDate: "2022-01-01T00:00:00.000Z",
        current: false,
        bullets: [
          { text: "Designed scalable APIs", type: "BULLET", sortOrder: 0 }
        ],
        freeFormContext: ["Cool team"],
      };

      const result = ExperienceInputSchema.safeParse(validExperience);
      expect(result.success).toBe(true);
    });

    it("should reject an experience payload with empty company name", () => {
      const invalidExperience = {
        company: "", // invalid empty string
        position: "Software Engineer",
        startDate: "2020-01-01T00:00:00.000Z",
        bullets: [],
        freeFormContext: [],
      };

      const result = ExperienceInputSchema.safeParse(invalidExperience);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Company name is required");
      }
    });

    it("should validate a valid project payload", () => {
      const validProject = {
        name: "ApplyCopilot Rewrite",
        startDate: "2023-01-01T00:00:00.000Z",
        current: true,
        technologies: ["React", "TypeScript"],
        bullets: [],
        freeFormContext: [],
      };

      const result = ProjectInputSchema.safeParse(validProject);
      expect(result.success).toBe(true);
    });
  });
});
