/**
 * @jest-environment jsdom
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import "@testing-library/jest-dom";
import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import KanbanBoard from "@/components/application-tracker/KanbanBoard";
import { ApplicationTrackerService } from "@/services/applicationTrackerService";
import type { ApplicationBoardRow } from "@/types/application";

// Polyfill MessageChannel for jsdom (matches this repo's existing component-test convention).
if (typeof global.MessageChannel === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MessageChannel } = require("worker_threads");
  global.MessageChannel = MessageChannel;
}

// Capture the `onDragEnd` handler `KanbanBoard` passes to `DndContext` so the test can fire a
// simulated cross-column drag without a real pointer/mouse sequence — the same pattern the
// dropdown path exercises via `ApplicationCard`'s `onStageChange` callback (FR-5, "identical
// effects").
let capturedOnDragEnd: ((event: any) => void) | undefined;

jest.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd }: any) => {
    capturedOnDragEnd = onDragEnd;
    return <div data-testid="dnd-context">{children}</div>;
  },
  useDroppable: () => ({ setNodeRef: jest.fn(), isOver: false }),
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    isDragging: false,
  }),
  useSensor: () => ({}),
  useSensors: () => ({}),
  PointerSensor: class {},
  KeyboardSensor: class {},
}));

jest.mock("@dnd-kit/utilities", () => ({
  CSS: { Translate: { toString: () => "" } },
}));

// `KanbanBoard` now renders `ApplicationDetailModal` (T042/T043), which pulls in
// `CVComposerTabs` → `CVEditor.tsx`, which uses `@dnd-kit/sortable` for its own (unrelated)
// bullet-reordering — mocked here purely so the module graph can load in this test file.
jest.mock("@dnd-kit/sortable", () => ({
  arrayMove: (arr: any) => arr,
  SortableContext: ({ children }: any) => <>{children}</>,
  sortableKeyboardCoordinates: () => {},
  verticalListSortingStrategy: () => {},
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

jest.mock("@/services/applicationTrackerService");

const mockedService = ApplicationTrackerService as jest.Mocked<
  typeof ApplicationTrackerService
>;

const fixtureApplications: ApplicationBoardRow[] = [
  {
    id: "app-1",
    jobListingId: "job-1",
    jobTitle: "Backend Engineer",
    company: "Acme Corp",
    stage: "APPLIED",
    outcome: null,
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "app-2",
    jobListingId: "job-2",
    jobTitle: "Frontend Engineer",
    company: "Globex",
    stage: "OFFER",
    outcome: null,
    updatedAt: "2026-08-02T00:00:00.000Z",
  },
];

describe("KanbanBoard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnDragEnd = undefined;
    mockedService.getApplications.mockResolvedValue(fixtureApplications);
    mockedService.transitionStage.mockResolvedValue({
      id: "app-1",
      stage: "SCREENING",
      outcome: null,
      eventId: "evt-1",
    });
  });

  it("renders all 5 stage columns", async () => {
    render(<KanbanBoard />);

    await waitFor(() =>
      expect(screen.getByTestId("application-card-app-1")).toBeInTheDocument(),
    );

    expect(screen.getByTestId("kanban-column-APPLIED")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-SCREENING")).toBeInTheDocument();
    expect(
      screen.getByTestId("kanban-column-TECH_INTERVIEW"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-OFFER")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-FINAL")).toBeInTheDocument();
  });

  it("moves a card between columns on a simulated onDragEnd event, calling the same stage endpoint the dropdown uses", async () => {
    render(<KanbanBoard />);

    await waitFor(() =>
      expect(
        within(screen.getByTestId("kanban-column-APPLIED")).getByTestId(
          "application-card-app-1",
        ),
      ).toBeInTheDocument(),
    );

    expect(capturedOnDragEnd).toBeDefined();

    // Simulate dragging card "app-1" from Applied onto the Screening column.
    await act(async () => {
      capturedOnDragEnd!({
        active: { id: "app-1" },
        over: { id: "SCREENING" },
      });
    });

    // Same client wrapper method both the dropdown (`ApplicationCard`'s `onChange`) and
    // drag-and-drop call — never a second, inline `fetch` for either path (Implementation
    // Notes, FR-5).
    await waitFor(() =>
      expect(mockedService.transitionStage).toHaveBeenCalledWith("app-1", {
        stage: "SCREENING",
        outcome: undefined,
      }),
    );

    await waitFor(() =>
      expect(
        within(screen.getByTestId("kanban-column-SCREENING")).getByTestId(
          "application-card-app-1",
        ),
      ).toBeInTheDocument(),
    );
  });
});
