/**
 * @jest-environment jsdom
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ExperienceForm from "@/components/profile/ExperienceForm";
import BasicDataForm from "@/components/profile/BasicDataForm";
import { ExperienceDTO, BasicDataDTO, SummaryDTO } from "@/types/profile";
import { Form } from "antd";

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
      onClick={() =>
        onDragEnd && onDragEnd({ active: { id: "b-1" }, over: { id: "b-2" } })
      }
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
      />,
    );

    // Find the type-toggle button inside the bullet container containing "Active Bullet 1"
    const bulletTextarea = screen.getByDisplayValue("Active Bullet 1");
    const bulletContainer = bulletTextarea.closest(".flex");
    expect(bulletContainer).toBeInTheDocument();

    const bulletTypeToggle = bulletContainer!.querySelector(
      'button[aria-label="Toggle type: currently bullet"]',
    );
    expect(bulletTypeToggle).not.toBeNull();

    // Click the toggle button to switch the bullet type
    fireEvent.click(bulletTypeToggle!);

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
        }),
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
      />,
    );

    const checkbox = screen.getByLabelText(
      "I currently work here",
    ) as HTMLInputElement;
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(mockUpdateExperienceState).toHaveBeenCalledWith(
        "exp-1",
        expect.objectContaining({
          current: true,
          endDate: null,
        }),
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
      />,
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
        }),
      );
    });
  });
});

describe("BasicDataForm UI Behavior & Social Links Integration", () => {
  function TestBasicDataForm({
    initialValues = {},
    summaries = [],
    updateBasicDataState = jest.fn(),
  }: {
    initialValues?: Partial<BasicDataDTO>;
    summaries?: SummaryDTO[];
    updateBasicDataState?: (
      data: Partial<BasicDataDTO> & { summaries?: SummaryDTO[] },
    ) => void;
  }) {
    const [form] = Form.useForm();

    React.useEffect(() => {
      if (initialValues) {
        form.setFieldsValue(initialValues);
      }
    }, [form, initialValues]);

    return (
      <BasicDataForm
        basicData={initialValues as BasicDataDTO}
        summaries={summaries}
        updateBasicDataState={updateBasicDataState}
        form={form}
      />
    );
  }

  const mockUpdateBasicDataState = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders EditableSocialLink open inputs with custom placeholders when social fields are empty", () => {
    render(
      <TestBasicDataForm
        initialValues={{
          firstName: "John",
          lastName: "Doe",
          linkedin: null,
          github: null,
          website: null,
        }}
        updateBasicDataState={mockUpdateBasicDataState}
      />,
    );

    expect(
      screen.getByPlaceholderText("https://linkedin.com/in/username"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("https://github.com/username"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("https://yourwebsite.com"),
    ).toBeInTheDocument();
  });

  it("renders external hyperlinks with action buttons when social fields are populated", () => {
    render(
      <TestBasicDataForm
        initialValues={{
          firstName: "Jane",
          lastName: "Doe",
          linkedin: "https://linkedin.com/in/janedoe",
          github: "https://github.com/janedoe",
          website: "https://janedoe.com",
        }}
        updateBasicDataState={mockUpdateBasicDataState}
      />,
    );

    const linkedinLink = screen.getByRole("link", {
      name: "LinkedIn URL: https://linkedin.com/in/janedoe",
    });
    expect(linkedinLink).toBeInTheDocument();
    expect(linkedinLink).toHaveAttribute(
      "href",
      "https://linkedin.com/in/janedoe",
    );
    expect(linkedinLink).toHaveAttribute("target", "_blank");
    expect(linkedinLink).toHaveAttribute("rel", "noopener noreferrer");

    const githubLink = screen.getByRole("link", {
      name: "GitHub URL: https://github.com/janedoe",
    });
    expect(githubLink).toBeInTheDocument();
    expect(githubLink).toHaveAttribute("href", "https://github.com/janedoe");

    const websiteLink = screen.getByRole("link", {
      name: "Website URL: https://janedoe.com",
    });
    expect(websiteLink).toBeInTheDocument();
    expect(websiteLink).toHaveAttribute("href", "https://janedoe.com");

    // Verify Edit and Delete buttons exist for each social link
    const editButtons = screen.getAllByLabelText("Edit link");
    expect(editButtons).toHaveLength(3);

    const deleteButtons = screen.getAllByLabelText("Delete link");
    expect(deleteButtons).toHaveLength(3);
  });

  it("triggers updateBasicDataState with normalized URL when entering social link in empty state", async () => {
    render(
      <TestBasicDataForm
        initialValues={{
          firstName: "John",
          lastName: "Doe",
          linkedin: null,
          github: null,
          website: null,
        }}
        updateBasicDataState={mockUpdateBasicDataState}
      />,
    );

    const linkedinInput = screen.getByPlaceholderText(
      "https://linkedin.com/in/username",
    );
    fireEvent.change(linkedinInput, {
      target: { value: "linkedin.com/in/newuser" },
    });
    fireEvent.blur(linkedinInput);

    await waitFor(() => {
      expect(mockUpdateBasicDataState).toHaveBeenCalledWith(
        expect.objectContaining({
          linkedin: "https://linkedin.com/in/newuser",
        }),
      );
    });
  });

  it("triggers updateBasicDataState with null when clicking delete on a populated social link", async () => {
    render(
      <TestBasicDataForm
        initialValues={{
          firstName: "Jane",
          lastName: "Doe",
          linkedin: "https://linkedin.com/in/janedoe",
          github: null,
          website: null,
        }}
        updateBasicDataState={mockUpdateBasicDataState}
      />,
    );

    const deleteBtn = screen.getByLabelText("Delete link");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockUpdateBasicDataState).toHaveBeenCalledWith(
        expect.objectContaining({
          linkedin: null,
        }),
      );
    });
  });

  it("triggers updateBasicDataState with updated URL when modifying link via edit mode", async () => {
    render(
      <TestBasicDataForm
        initialValues={{
          firstName: "Jane",
          lastName: "Doe",
          linkedin: null,
          github: "https://github.com/oldhandle",
          website: null,
        }}
        updateBasicDataState={mockUpdateBasicDataState}
      />,
    );

    const editBtn = screen.getByLabelText("Edit link");
    fireEvent.click(editBtn);

    const githubInput = screen.getByDisplayValue(
      "https://github.com/oldhandle",
    );
    fireEvent.change(githubInput, {
      target: { value: "github.com/newhandle" },
    });
    fireEvent.keyDown(githubInput, { key: "Enter" });

    await waitFor(() => {
      expect(mockUpdateBasicDataState).toHaveBeenCalledWith(
        expect.objectContaining({
          github: "https://github.com/newhandle",
        }),
      );
    });
  });
});
