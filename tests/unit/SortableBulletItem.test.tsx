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
