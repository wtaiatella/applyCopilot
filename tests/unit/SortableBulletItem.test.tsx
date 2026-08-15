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
