/**
 * @jest-environment jsdom
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ExperienceForm from "@/components/profile/ExperienceForm";
import { ExperienceDTO } from "@/types/profile";

// Polyfill MessageChannel for jsdom
if (typeof global.MessageChannel === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MessageChannel } = require("worker_threads");
  global.MessageChannel = MessageChannel;
}

// Mock Select component as standard select to make JSDOM testing simple and robust
jest.mock("antd", () => {
  const actual = jest.requireActual("antd");
  return {
    ...actual,
    message: {
      success: jest.fn(),
      error: jest.fn(),
      warning: jest.fn(),
      info: jest.fn(),
      loading: jest.fn(),
    },
    notification: {
      success: jest.fn(),
      error: jest.fn(),
      warning: jest.fn(),
      info: jest.fn(),
      open: jest.fn(),
    },
    Select: ({ value, onChange, options, children, ...props }: any) => {
      return (
        <select
          value={value}
          onChange={(e) => onChange && onChange(e.target.value)}
          data-testid={props["data-testid"] || "mock-select"}
        >
          {options
            ? options.map((opt: any) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
      );
    },
  };
});

// Mock dnd-kit modules
jest.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd }: any) => (
    <div
      data-testid="mock-dnd-context"
      onClick={() => onDragEnd && onDragEnd({ active: { id: "b-1" }, over: { id: "b-2" } })}
    >
      {children}
    </div>
  ),
  useSensor: () => ({}),
  useSensors: () => ({}),
  PointerSensor: class {},
  KeyboardSensor: class {},
  closestCenter: jest.fn(),
}));

jest.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: any) => <div>{children}</div>,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  verticalListSortingStrategy: {},
  arrayMove: (arr: any[], from: number, to: number) => {
    const next = [...arr];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  },
}));

describe("ExperienceForm UI Behavior", () => {
  const mockExperiences: ExperienceDTO[] = [
    {
      id: "exp-1",
      company: "Acme Corp",
      position: "Developer",
      startDate: "2020-01-01T00:00:00.000Z",
      endDate: "2022-01-01T00:00:00.000Z",
      current: false,
      bullets: [
        {
          id: "b-1",
          text: "Active Bullet 1",
          isActive: true,
          isArchived: false,
          type: "BULLET",
          sortOrder: 0,
          usedInCVs: [],
        },
        {
          id: "b-2",
          text: "Active Bullet 2",
          isActive: true,
          isArchived: false,
          type: "BULLET",
          sortOrder: 1,
          usedInCVs: [],
        },
      ],
      freeFormContext: [],
    },
  ];

  const mockAddExperience = jest.fn();
  const mockUpdateExperienceState = jest.fn();
  const mockDeleteExperience = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should trigger updateExperienceState when bullet type is changed", async () => {
    render(
      <ExperienceForm
        experiences={mockExperiences}
        addExperience={mockAddExperience}
        updateExperienceState={mockUpdateExperienceState}
        deleteExperience={mockDeleteExperience}
      />
    );

    // Find the select inside the bullet container containing "Active Bullet 1"
    const bulletTextarea = screen.getByDisplayValue("Active Bullet 1");
    const bulletContainer = bulletTextarea.closest(".flex");
    expect(bulletContainer).toBeInTheDocument();
    
    const bulletTypeSelect = bulletContainer!.querySelector("select");
    expect(bulletTypeSelect).not.toBeNull();

    // Trigger select change directly
    fireEvent.change(bulletTypeSelect!, { target: { value: "PARAGRAPH" } });

    await waitFor(() => {
      expect(mockUpdateExperienceState).toHaveBeenCalledWith(
        "exp-1",
        expect.objectContaining({
          bullets: expect.arrayContaining([
            expect.objectContaining({
              id: "b-1",
              type: "PARAGRAPH",
            }),
          ]),
        })
      );
    });
  });

  it("should trigger updateExperienceState with current: true and endDate: null when current checkbox is checked", async () => {
    render(
      <ExperienceForm
        experiences={mockExperiences}
        addExperience={mockAddExperience}
        updateExperienceState={mockUpdateExperienceState}
        deleteExperience={mockDeleteExperience}
      />
    );

    const checkbox = screen.getByLabelText("I currently work here") as HTMLInputElement;
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(mockUpdateExperienceState).toHaveBeenCalledWith(
        "exp-1",
        expect.objectContaining({
          current: true,
          endDate: null,
        })
      );
    });
  });

  it("should trigger reordering of bullets when bullet is dragged", async () => {
    render(
      <ExperienceForm
        experiences={mockExperiences}
        addExperience={mockAddExperience}
        updateExperienceState={mockUpdateExperienceState}
        deleteExperience={mockDeleteExperience}
      />
    );

    // Simulate drag end by clicking the mock-dnd-context div
    const contextDiv = screen.getByTestId("mock-dnd-context");
    fireEvent.click(contextDiv);

    await waitFor(() => {
      expect(mockUpdateExperienceState).toHaveBeenCalledWith(
        "exp-1",
        expect.objectContaining({
          bullets: [
            expect.objectContaining({ id: "b-2", sortOrder: 0 }),
            expect.objectContaining({ id: "b-1", sortOrder: 1 }),
          ],
        })
      );
    });
  });
});
