/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import TimelineEntry from "@/components/application-tracker/TimelineEntry";
import type { ApplicationEventDTO } from "@/types/application";

const stageChange: ApplicationEventDTO = {
  id: "evt-stage",
  type: "STAGE_CHANGE",
  fromStage: "APPLIED",
  toStage: "SCREENING",
  title: null,
  eventAt: null,
  content: null,
  createdAt: "2026-08-01T10:00:00.000Z",
};

const note: ApplicationEventDTO = {
  id: "evt-note",
  type: "NOTE",
  fromStage: null,
  toStage: null,
  title: null,
  eventAt: null,
  content: "Called the recruiter.",
  createdAt: "2026-08-02T10:00:00.000Z",
};

const meeting: ApplicationEventDTO = {
  id: "evt-meeting",
  type: "MEETING",
  fromStage: null,
  toStage: null,
  title: "Phone screen",
  eventAt: "2026-08-10T14:00:00.000Z",
  content: "30 min",
  createdAt: "2026-08-03T10:00:00.000Z",
};

const companyResponse: ApplicationEventDTO = {
  id: "evt-response",
  type: "COMPANY_RESPONSE",
  fromStage: null,
  toStage: null,
  title: null,
  eventAt: null,
  content: "We'd like to move forward.",
  createdAt: "2026-08-04T10:00:00.000Z",
};

describe("TimelineEntry", () => {
  it("renders STAGE_CHANGE as a centered, non-bubble variant", () => {
    render(<TimelineEntry event={stageChange} />);
    const el = screen.getByTestId("timeline-entry-evt-stage");
    expect(el).toHaveAttribute("data-entry-type", "STAGE_CHANGE");
    expect(el.className).toContain("justify-center");
    expect(el.className).not.toContain("rounded-lg");
  });

  it("renders NOTE with its own distinct icon/color treatment", () => {
    render(<TimelineEntry event={note} />);
    const el = screen.getByTestId("timeline-entry-evt-note");
    expect(el).toHaveAttribute("data-entry-type", "NOTE");
    expect(screen.getByText("Called the recruiter.")).toBeInTheDocument();
  });

  it("renders MEETING with its own distinct icon/color treatment", () => {
    render(<TimelineEntry event={meeting} />);
    const el = screen.getByTestId("timeline-entry-evt-meeting");
    expect(el).toHaveAttribute("data-entry-type", "MEETING");
    expect(screen.getByText("Phone screen")).toBeInTheDocument();
  });

  it("renders COMPANY_RESPONSE with its own distinct icon/color treatment", () => {
    render(<TimelineEntry event={companyResponse} />);
    const el = screen.getByTestId("timeline-entry-evt-response");
    expect(el).toHaveAttribute("data-entry-type", "COMPANY_RESPONSE");
    expect(screen.getByText("We'd like to move forward.")).toBeInTheDocument();
  });

  it("produces 4 visually distinct className treatments across the 4 fixtures", () => {
    const { container: c1 } = render(<TimelineEntry event={stageChange} />);
    const { container: c2 } = render(<TimelineEntry event={note} />);
    const { container: c3 } = render(<TimelineEntry event={meeting} />);
    const { container: c4 } = render(<TimelineEntry event={companyResponse} />);

    const classNames = [c1, c2, c3, c4].map(
      (c) => c.firstElementChild?.className,
    );
    expect(new Set(classNames).size).toBe(4);
  });
});
