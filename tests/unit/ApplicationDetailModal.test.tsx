/**
 * @jest-environment jsdom
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import "@testing-library/jest-dom";
import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import KanbanBoard from "@/components/application-tracker/KanbanBoard";
import { ApplicationTrackerService } from "@/services/applicationTrackerService";
import { CVService } from "@/services/cvService";
import type { ApplicationBoardRow } from "@/types/application";

// Polyfill MessageChannel for jsdom (matches this repo's existing component-test convention).
if (typeof global.MessageChannel === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MessageChannel } = require("worker_threads");
  global.MessageChannel = MessageChannel;
}

jest.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: any) => (
    <div data-testid="dnd-context">{children}</div>
  ),
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
  CSS: {
    Translate: { toString: () => "" },
    Transform: { toString: () => "" },
  },
}));

// `CVComposerTabs` pulls in `CVEditor.tsx`, which also uses `@dnd-kit/sortable` for its own
// bullet-reordering (unrelated to this spec) — mocked here purely so the tab shell can mount.
jest.mock("@dnd-kit/sortable", () => ({
  arrayMove: (arr: unknown[]) => arr,
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
jest.mock("@/services/cvService");

// Overrides jest.setup.js's per-call `useRouter()` mock with one trackable `push` shared across
// the whole component tree, so this test can assert it is never called (FR-16/AC.7 — no URL
// change on open).
const pushMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/application-tracker",
}));

const mockedTrackerService = ApplicationTrackerService as jest.Mocked<
  typeof ApplicationTrackerService
>;
const mockedCVService = CVService as jest.Mocked<typeof CVService>;

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
];

describe("ApplicationDetailModal (opened from a KanbanBoard card click)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedTrackerService.getApplications.mockResolvedValue(fixtureApplications);
    mockedTrackerService.getForCV.mockResolvedValue(null);
    mockedCVService.createOrGetCV.mockResolvedValue({
      id: "cv-1",
      jobListingId: "job-1",
      status: "APPLIED",
      appliedAt: "2026-08-01T00:00:00.000Z",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    mockedCVService.getCV.mockResolvedValue({
      id: "cv-1",
      jobListingId: "job-1",
      status: "APPLIED",
      appliedAt: "2026-08-01T00:00:00.000Z",
      snapshotData: {
        version: 1,
        basicData: {
          firstName: null,
          lastName: null,
          phone: null,
          location: null,
          linkedin: null,
          github: null,
          website: null,
          title: null,
        },
        summaries: [],
        experiences: [],
        education: [],
        projects: [],
        skills: [],
      },
    });

    // Underlying raw `fetch` calls made by the tab shell's own tabs (Job Description, Deep
    // Analysis) — not this spec's concern, so just resolve them to a harmless non-ok response.
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      statusText: "not mocked",
      json: async () => ({}),
    }) as unknown as typeof fetch;
  });

  it("opens the 5-tab shell on a card click without any next/navigation push call, and never mutates the board's own applications state", async () => {
    render(<KanbanBoard />);

    await waitFor(() =>
      expect(screen.getByTestId("application-card-app-1")).toBeInTheDocument(),
    );

    // Modal is not open yet.
    expect(
      screen.queryByRole("dialog", { hidden: true }),
    ).not.toBeInTheDocument();

    const cardTitle = screen.getByText("Backend Engineer");
    await act(async () => {
      fireEvent.click(cardTitle);
    });

    // Fresh `CVComposerProvider` mounted (T042) — the 5-tab shell renders, proving the same
    // shell code path the full-page route uses runs here too (Implementation Notes).
    await waitFor(() =>
      expect(
        screen.getByRole("tab", { name: "Job Description" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Application")).toBeInTheDocument();
    expect(mockedCVService.createOrGetCV).toHaveBeenCalledWith("job-1");

    // No URL change on open (FR-16/AC.7).
    expect(pushMock).not.toHaveBeenCalled();

    // Board's own card is still present, unchanged, underneath the modal.
    expect(
      within(screen.getByTestId("kanban-column-APPLIED")).getByTestId(
        "application-card-app-1",
      ),
    ).toBeInTheDocument();
  });

  it("unmounts the tab shell cleanly on close, leaving the board's own state untouched", async () => {
    render(<KanbanBoard />);

    await waitFor(() =>
      expect(screen.getByTestId("application-card-app-1")).toBeInTheDocument(),
    );

    const cardTitle = screen.getByText("Backend Engineer");
    await act(async () => {
      fireEvent.click(cardTitle);
    });

    await waitFor(() =>
      expect(
        screen.getByRole("tab", { name: "Job Description" }),
      ).toBeInTheDocument(),
    );

    // antd's default close affordance (`.ant-modal-close`) — closes without a page nav.
    const closeButton = document.querySelector(".ant-modal-close");
    expect(closeButton).toBeTruthy();
    await act(async () => {
      fireEvent.click(closeButton as Element);
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("tab", { name: "Job Description" }),
      ).not.toBeInTheDocument(),
    );
    expect(pushMock).not.toHaveBeenCalled();

    // Board state untouched: the same single card, in the same column.
    expect(
      within(screen.getByTestId("kanban-column-APPLIED")).getByTestId(
        "application-card-app-1",
      ),
    ).toBeInTheDocument();
  });
});
