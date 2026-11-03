/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import SortableBulletItem from "@/components/profile/shared/SortableBulletItem";
import type { BulletDTO } from "@/types/profile";

jest.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

jest.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: { toString: () => "" },
  },
}));

const baseBullet: BulletDTO = {
  id: "bullet-1",
  text: "Led a cross-functional migration",
  isActive: true,
  isArchived: false,
  type: "BULLET",
  sortOrder: 0,
  usedInCVs: [],
};

describe("SortableBulletItem — 'Used in' badge navigation (REM-13, AC.13)", () => {
  it("renders no badge when the bullet is not used in any CV", () => {
    render(
      <SortableBulletItem
        bullet={baseBullet}
        onUpdate={jest.fn()}
        onDelete={jest.fn()}
      />,
    );
    expect(screen.queryByText(/Used in:/)).not.toBeInTheDocument();
  });

  it("renders the 'Used in' badge as a real link to the CV's application route", () => {
    const bullet: BulletDTO = {
      ...baseBullet,
      usedInCVs: [{ id: "cv-1", name: "Acme Corp CV", jobListingId: "job-1" }],
    };
    render(
      <SortableBulletItem
        bullet={bullet}
        onUpdate={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    const link = screen.getByRole("link", { name: "Acme Corp CV" });
    expect(link).toHaveAttribute("href", "/jobs/job-1/application");
  });

  it("renders one link per referenced CV when the bullet is used in multiple CVs", () => {
    const bullet: BulletDTO = {
      ...baseBullet,
      usedInCVs: [
        { id: "cv-1", name: "Acme Corp CV", jobListingId: "job-1" },
        { id: "cv-2", name: "Globex CV", jobListingId: "job-2" },
      ],
    };
    render(
      <SortableBulletItem
        bullet={bullet}
        onUpdate={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    const acmeLink = screen.getByRole("link", { name: "Acme Corp CV" });
    expect(acmeLink).toHaveAttribute("href", "/jobs/job-1/application");

    const globexLink = screen.getByRole("link", { name: "Globex CV" });
    expect(globexLink).toHaveAttribute("href", "/jobs/job-2/application");
  });
});

describe("SortableBulletItem — locked text field for CV-referenced bullets (US-1, AC.1, AC.7)", () => {
  it("renders the text field as readOnly with a lock icon and tooltip when the bullet is tagged", () => {
    const bullet: BulletDTO = {
      ...baseBullet,
      usedInCVs: [{ id: "cv-1", name: "Acme Corp CV", jobListingId: "job-1" }],
    };
    render(
      <SortableBulletItem
        bullet={bullet}
        onUpdate={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    const textarea = screen.getByPlaceholderText(
      "Describe an achievement or responsibility...",
    );
    expect(textarea).toHaveAttribute("readonly");
    expect(
      screen.getByLabelText("Text locked — used in a CV"),
    ).toBeInTheDocument();
  });

  it("leaves the text field editable with no lock icon when the bullet is untagged (regression)", () => {
    render(
      <SortableBulletItem
        bullet={baseBullet}
        onUpdate={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    const textarea = screen.getByPlaceholderText(
      "Describe an achievement or responsibility...",
    );
    expect(textarea).not.toHaveAttribute("readonly");
    expect(
      screen.queryByLabelText("Text locked — used in a CV"),
    ).not.toBeInTheDocument();
  });
});

describe("SortableBulletItem — delete button always enabled (US-2, AC.2, AC.7)", () => {
  it("enables the delete button and calls onDelete when the bullet is tagged", async () => {
    const onDelete = jest.fn();
    const bullet: BulletDTO = {
      ...baseBullet,
      usedInCVs: [{ id: "cv-1", name: "Acme Corp CV", jobListingId: "job-1" }],
    };
    render(
      <SortableBulletItem
        bullet={bullet}
        onUpdate={jest.fn()}
        onDelete={onDelete}
      />,
    );

    const deleteButton = screen.getByRole("button", {
      name: /remove from active list/i,
    });
    expect(deleteButton).not.toBeDisabled();

    deleteButton.click();
    expect(onDelete).toHaveBeenCalledWith(bullet.id);
  });

  it("enables the delete button and calls onDelete when the bullet is untagged (regression)", () => {
    const onDelete = jest.fn();
    render(
      <SortableBulletItem
        bullet={baseBullet}
        onUpdate={jest.fn()}
        onDelete={onDelete}
      />,
    );

    const deleteButton = screen.getByRole("button", { name: /delete bullet/i });
    expect(deleteButton).not.toBeDisabled();

    deleteButton.click();
    expect(onDelete).toHaveBeenCalledWith(baseBullet.id);
  });
});

describe("SortableBulletItem — APC-34: Bullet/Paragraph Type Toggle & Inline Styling (AC-1 to AC-5)", () => {
  it("AC-1: unclutters the left column displaying only the drag handle and removing the toggle button from left", () => {
    const { container } = render(
      <SortableBulletItem
        bullet={baseBullet}
        onUpdate={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    const card = container.firstChild as HTMLElement;
    expect(card).toBeInTheDocument();

    const leftHandle = card.children[0];
    expect(leftHandle).toHaveClass("cursor-grab");
    expect(leftHandle.querySelector("button")).toBeNull();
  });

  it("AC-2: renders an inline bullet marker ('•') inside text container with text indentation when type is BULLET", () => {
    render(
      <SortableBulletItem
        bullet={{ ...baseBullet, type: "BULLET" }}
        onUpdate={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    const marker = screen.getByTestId("inline-bullet-marker");
    expect(marker).toBeInTheDocument();
    expect(marker).toHaveTextContent("•");
    expect(marker).toHaveAttribute("aria-hidden", "true");

    const textarea = screen.getByPlaceholderText(
      "Describe an achievement or responsibility...",
    );
    // Verify marker is inside the same text container wrapper as the textarea
    expect(textarea.parentElement).toContainElement(marker);
    // Verify text is indented inside the text box
    expect(textarea.style.paddingLeft).toBe("24px");
  });

  it("AC-3: does not render the inline bullet marker and uses standard alignment when type is PARAGRAPH", () => {
    render(
      <SortableBulletItem
        bullet={{ ...baseBullet, type: "PARAGRAPH" }}
        onUpdate={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    expect(
      screen.queryByTestId("inline-bullet-marker"),
    ).not.toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(
      "Describe an achievement or responsibility...",
    );
    expect(textarea.style.paddingLeft).toBe("");
  });

  it("AC-6: maintains identical outer text container wrapper width classes across both item types", () => {
    const { container: bulletContainer } = render(
      <SortableBulletItem
        bullet={{ ...baseBullet, type: "BULLET" }}
        onUpdate={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    const { container: paragraphContainer } = render(
      <SortableBulletItem
        bullet={{ ...baseBullet, type: "PARAGRAPH" }}
        onUpdate={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    const bulletWrapper = bulletContainer.querySelector(".relative.w-full");
    const paragraphWrapper =
      paragraphContainer.querySelector(".relative.w-full");

    expect(bulletWrapper).toBeInTheDocument();
    expect(paragraphWrapper).toBeInTheDocument();
    expect(bulletWrapper?.className).toBe(paragraphWrapper?.className);
  });

  it("AC-4: places the type toggle button in a second row within the right action column", () => {
    render(
      <SortableBulletItem
        bullet={baseBullet}
        onUpdate={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    const toggleButton = screen.getByTestId("bullet-type-toggle");
    expect(toggleButton).toBeInTheDocument();

    const deleteButton = screen.getByRole("button", { name: /delete bullet/i });
    const switchControl = screen.getByRole("switch");

    const row1Container = deleteButton.parentElement;
    expect(row1Container).toContainElement(switchControl);
    expect(row1Container).not.toContainElement(toggleButton);

    const actionColumn = row1Container?.parentElement;
    expect(actionColumn).toContainElement(toggleButton);
  });

  it("AC-5: clicking the type toggle toggles type from BULLET to PARAGRAPH and calls onUpdate", () => {
    const onUpdate = jest.fn();
    render(
      <SortableBulletItem
        bullet={{ ...baseBullet, type: "BULLET" }}
        onUpdate={onUpdate}
        onDelete={jest.fn()}
      />,
    );

    const toggleButton = screen.getByTestId("bullet-type-toggle");
    toggleButton.click();

    expect(onUpdate).toHaveBeenCalledWith(baseBullet.id, { type: "PARAGRAPH" });
  });

  it("AC-5: clicking the type toggle toggles type from PARAGRAPH to BULLET and calls onUpdate", () => {
    const onUpdate = jest.fn();
    render(
      <SortableBulletItem
        bullet={{ ...baseBullet, type: "PARAGRAPH" }}
        onUpdate={onUpdate}
        onDelete={jest.fn()}
      />,
    );

    const toggleButton = screen.getByTestId("bullet-type-toggle");
    toggleButton.click();

    expect(onUpdate).toHaveBeenCalledWith(baseBullet.id, { type: "BULLET" });
  });
});
