/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EditableSocialLink, {
  ensureUrlProtocol,
} from "@/components/profile/shared/EditableSocialLink";

describe("ensureUrlProtocol helper", () => {
  it("returns empty string for null, undefined, or whitespace", () => {
    expect(ensureUrlProtocol("")).toBe("");
    expect(ensureUrlProtocol("   ")).toBe("");
    // @ts-expect-error test invalid inputs
    expect(ensureUrlProtocol(null)).toBe("");
    // @ts-expect-error test invalid inputs
    expect(ensureUrlProtocol(undefined)).toBe("");
  });

  it("prepends https:// when protocol scheme is missing", () => {
    expect(ensureUrlProtocol("linkedin.com/in/user")).toBe(
      "https://linkedin.com/in/user",
    );
    expect(ensureUrlProtocol("github.com/octocat")).toBe(
      "https://github.com/octocat",
    );
    expect(ensureUrlProtocol("myportfolio.dev")).toBe(
      "https://myportfolio.dev",
    );
  });

  it("preserves http:// and https:// schemes", () => {
    expect(ensureUrlProtocol("https://linkedin.com/in/user")).toBe(
      "https://linkedin.com/in/user",
    );
    expect(ensureUrlProtocol("http://internal.company.dev")).toBe(
      "http://internal.company.dev",
    );
  });

  it("strips hazardous pseudo-protocols to mitigate XSS vectors", () => {
    expect(ensureUrlProtocol("javascript:alert(1)")).toBe("");
    expect(ensureUrlProtocol("JAVASCRIPT:alert(document.cookie)")).toBe("");
    expect(ensureUrlProtocol("data:text/html,<script>alert(1)</script>")).toBe(
      "",
    );
    expect(ensureUrlProtocol("vbscript:msgbox(1)")).toBe("");
  });
});

describe("EditableSocialLink Component", () => {
  describe("Empty State (AC.1, FR-1)", () => {
    it("renders an open input with placeholder when value is null", () => {
      render(
        <EditableSocialLink
          value={null}
          placeholder="https://linkedin.com/in/username"
          ariaLabel="LinkedIn URL"
        />,
      );

      const input = screen.getByPlaceholderText(
        "https://linkedin.com/in/username",
      );
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("aria-label", "LinkedIn URL");
      expect(input).toHaveValue("");
    });

    it("renders an open input with placeholder when value is undefined or empty string", () => {
      const { rerender } = render(
        <EditableSocialLink
          value={undefined}
          placeholder="https://github.com/username"
        />,
      );
      expect(
        screen.getByPlaceholderText("https://github.com/username"),
      ).toBeInTheDocument();

      rerender(
        <EditableSocialLink
          value=""
          placeholder="https://github.com/username"
        />,
      );
      expect(
        screen.getByPlaceholderText("https://github.com/username"),
      ).toBeInTheDocument();
    });

    it("invokes onChange with normalized URL on blur when text is entered (AC.2, FR-7)", () => {
      const mockOnChange = jest.fn();
      render(
        <EditableSocialLink
          value=""
          onChange={mockOnChange}
          placeholder="https://linkedin.com/in/username"
        />,
      );

      const input = screen.getByPlaceholderText(
        "https://linkedin.com/in/username",
      );
      fireEvent.change(input, {
        target: { value: "linkedin.com/in/testuser" },
      });
      fireEvent.blur(input);

      expect(mockOnChange).toHaveBeenCalledWith(
        "https://linkedin.com/in/testuser",
      );
    });

    it("invokes onChange with normalized URL on Enter keypress", () => {
      const mockOnChange = jest.fn();
      render(
        <EditableSocialLink
          value=""
          onChange={mockOnChange}
          placeholder="https://github.com/username"
        />,
      );

      const input = screen.getByPlaceholderText(
        "https://github.com/username",
      );
      fireEvent.change(input, {
        target: { value: "https://github.com/octocat" },
      });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockOnChange).toHaveBeenCalledWith(
        "https://github.com/octocat",
      );
    });

    it("invokes onChange(null) if entered text only contains whitespace or XSS payload", () => {
      const mockOnChange = jest.fn();
      const { rerender } = render(
        <EditableSocialLink
          value=""
          onChange={mockOnChange}
          placeholder="Enter URL"
        />,
      );

      const input = screen.getByPlaceholderText("Enter URL");
      fireEvent.change(input, { target: { value: "   " } });
      fireEvent.blur(input);
      expect(mockOnChange).toHaveBeenCalledWith(null);

      mockOnChange.mockClear();
      rerender(
        <EditableSocialLink
          value=""
          onChange={mockOnChange}
          placeholder="Enter URL"
        />,
      );
      const input2 = screen.getByPlaceholderText("Enter URL");
      fireEvent.change(input2, { target: { value: "javascript:alert(1)" } });
      fireEvent.keyDown(input2, { key: "Enter" });
      expect(mockOnChange).toHaveBeenCalledWith(null);
    });
  });

  describe("Populated State (AC.3, AC.4, FR-2, FR-3, FR-4)", () => {
    it("renders a secure anchor tag with external link icon, edit, and delete buttons", () => {
      render(
        <EditableSocialLink
          value="https://linkedin.com/in/johndoe"
          ariaLabel="LinkedIn URL"
        />,
      );

      const link = screen.getByRole("link", {
        name: "LinkedIn URL: https://linkedin.com/in/johndoe",
      });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute(
        "href",
        "https://linkedin.com/in/johndoe",
      );
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");

      expect(screen.getByLabelText("Edit link")).toBeInTheDocument();
      expect(screen.getByLabelText("Delete link")).toBeInTheDocument();
    });

    it("prepends https:// to anchor href if value had no scheme (AC.4, FR-4)", () => {
      render(
        <EditableSocialLink
          value="github.com/octocat"
          ariaLabel="GitHub URL"
        />,
      );

      const link = screen.getByRole("link", {
        name: "GitHub URL: github.com/octocat",
      });
      expect(link).toHaveAttribute("href", "https://github.com/octocat");
      expect(screen.getByText("github.com/octocat")).toBeInTheDocument();
    });
  });

  describe("Edit and Commit Lifecycle (AC.5, AC.6, FR-5, FR-6, FR-7)", () => {
    it("switches to input pre-filled with value and focuses when clicking Edit button", async () => {
      render(
        <EditableSocialLink
          value="https://linkedin.com/in/johndoe"
          placeholder="LinkedIn"
        />,
      );

      const editBtn = screen.getByLabelText("Edit link");
      fireEvent.click(editBtn);

      const input = screen.getByDisplayValue("https://linkedin.com/in/johndoe");
      expect(input).toBeInTheDocument();
      expect(input).toHaveFocus();
    });

    it("commits modified URL on Enter and calls onChange with normalized URL (AC.6)", () => {
      const mockOnChange = jest.fn();
      render(
        <EditableSocialLink
          value="https://linkedin.com/in/johndoe"
          onChange={mockOnChange}
        />,
      );

      fireEvent.click(screen.getByLabelText("Edit link"));
      const input = screen.getByDisplayValue("https://linkedin.com/in/johndoe");

      fireEvent.change(input, {
        target: { value: "linkedin.com/in/janedoe" },
      });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockOnChange).toHaveBeenCalledWith(
        "https://linkedin.com/in/janedoe",
      );
    });

    it("commits modified URL on blur and calls onChange with normalized URL", () => {
      const mockOnChange = jest.fn();
      render(
        <EditableSocialLink
          value="https://linkedin.com/in/johndoe"
          onChange={mockOnChange}
        />,
      );

      fireEvent.click(screen.getByLabelText("Edit link"));
      const input = screen.getByDisplayValue("https://linkedin.com/in/johndoe");

      fireEvent.change(input, {
        target: { value: "https://linkedin.com/in/updated" },
      });
      fireEvent.blur(input);

      expect(mockOnChange).toHaveBeenCalledWith(
        "https://linkedin.com/in/updated",
      );
    });

    it("cancels editing on Escape without calling onChange and restores original value (AC.7, FR-8)", () => {
      const mockOnChange = jest.fn();
      render(
        <EditableSocialLink
          value="https://linkedin.com/in/johndoe"
          onChange={mockOnChange}
        />,
      );

      fireEvent.click(screen.getByLabelText("Edit link"));
      const input = screen.getByDisplayValue("https://linkedin.com/in/johndoe");

      fireEvent.change(input, {
        target: { value: "https://modified-abandoned.com" },
      });
      fireEvent.keyDown(input, { key: "Escape" });

      expect(mockOnChange).not.toHaveBeenCalled();
      // Returns to link display state
      expect(
        screen.getByRole("link", {
          name: "https://linkedin.com/in/johndoe",
        }),
      ).toBeInTheDocument();
    });

    it("dispatches onChange(null) when text is completely cleared in edit mode (FR-11)", () => {
      const mockOnChange = jest.fn();
      render(
        <EditableSocialLink
          value="https://linkedin.com/in/johndoe"
          onChange={mockOnChange}
        />,
      );

      fireEvent.click(screen.getByLabelText("Edit link"));
      const input = screen.getByDisplayValue("https://linkedin.com/in/johndoe");

      fireEvent.change(input, { target: { value: "" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockOnChange).toHaveBeenCalledWith(null);
    });
  });

  describe("Inline Deletion (AC.8, FR-9, FR-10)", () => {
    it("immediately invokes onChange(null) when clicking Delete button without modal", () => {
      const mockOnChange = jest.fn();
      render(
        <EditableSocialLink
          value="https://github.com/octocat"
          onChange={mockOnChange}
          placeholder="https://github.com/username"
        />,
      );

      const deleteBtn = screen.getByLabelText("Delete link");
      fireEvent.click(deleteBtn);

      expect(mockOnChange).toHaveBeenCalledTimes(1);
      expect(mockOnChange).toHaveBeenCalledWith(null);
    });
  });

  describe("Disabled State", () => {
    it("disables input in empty state when disabled=true", () => {
      render(
        <EditableSocialLink
          value=""
          disabled={true}
          placeholder="Disabled input"
        />,
      );
      const input = screen.getByPlaceholderText("Disabled input");
      expect(input).toBeDisabled();
    });

    it("disables action buttons and prevents link click when disabled=true in populated state", () => {
      render(
        <EditableSocialLink
          value="https://mywebsite.com"
          disabled={true}
        />,
      );

      const link = screen.getByRole("link");
      expect(link).toHaveClass("pointer-events-none");

      const editBtn = screen.getByLabelText("Edit link");
      const deleteBtn = screen.getByLabelText("Delete link");
      expect(editBtn).toBeDisabled();
      expect(deleteBtn).toBeDisabled();

      // Clicking link should prevent default
      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      link.dispatchEvent(clickEvent);
      expect(clickEvent.defaultPrevented).toBe(true);
    });
  });

  describe("Event Propagation & Controlled Updates", () => {
    it("stops propagation on Enter and Escape keys to prevent outer form submission", () => {
      const outerKeyDown = jest.fn();
      render(
        <div onKeyDown={outerKeyDown}>
          <EditableSocialLink value="https://initial.com" />
        </div>,
      );

      fireEvent.click(screen.getByLabelText("Edit link"));
      const input = screen.getByDisplayValue("https://initial.com");

      fireEvent.keyDown(input, { key: "Enter" });
      expect(outerKeyDown).not.toHaveBeenCalled();

      // Re-enter edit
      fireEvent.click(screen.getByLabelText("Edit link"));
      const inputAfter = screen.getByDisplayValue("https://initial.com");
      fireEvent.keyDown(inputAfter, { key: "Escape" });
      expect(outerKeyDown).not.toHaveBeenCalled();
    });

    it("syncs with external value prop changes when not in editing state", () => {
      const { rerender } = render(
        <EditableSocialLink value="https://site1.com" />,
      );
      expect(screen.getByText("https://site1.com")).toBeInTheDocument();

      rerender(<EditableSocialLink value="https://site2.com" />);
      expect(screen.getByText("https://site2.com")).toBeInTheDocument();

      rerender(<EditableSocialLink value={null} placeholder="Empty now" />);
      expect(screen.getByPlaceholderText("Empty now")).toBeInTheDocument();
    });
  });
});
