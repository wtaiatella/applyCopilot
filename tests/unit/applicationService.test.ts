/**
 * @jest-environment node
 */

jest.mock("@/lib/db/prisma", () => {
  const application = {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  };
  const applicationEvent = {
    create: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  };
  return {
    prisma: {
      application,
      applicationEvent,
      // Runs the callback against the same mocked tables — good enough for unit-testing the
      // service's own logic without a real transaction boundary.
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) =>
        cb({ application, applicationEvent }),
      ),
    },
  };
});

jest.mock("@/lib/logging/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { prisma } from "@/lib/db/prisma";
import {
  transitionStage,
  undoTransition,
  addManualEvent,
  OutcomeRequiredError,
  StaleUndoError,
  OwnershipViolationError,
} from "@/services/applicationService";
import type { ApplicationStage } from "@/types/application";

const OWNER_ID = "user_1";

const applicationFindUnique = prisma.application.findUnique as jest.Mock;
const applicationUpdate = prisma.application.update as jest.Mock;
const eventCreate = prisma.applicationEvent.create as jest.Mock;
const eventFindFirst = prisma.applicationEvent.findFirst as jest.Mock;
const eventDelete = prisma.applicationEvent.delete as jest.Mock;

describe("applicationService.transitionStage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    applicationFindUnique.mockResolvedValue({
      stage: "APPLIED",
      outcome: null,
      profile: { userId: OWNER_ID },
    });
    applicationUpdate.mockImplementation(({ data }) =>
      Promise.resolve({
        id: "app_1",
        stage: data.stage,
        outcome: data.outcome,
      }),
    );
    eventCreate.mockResolvedValue({ id: "evt_new" });
  });

  const ALL_STAGES: ApplicationStage[] = [
    "APPLIED",
    "SCREENING",
    "TECH_INTERVIEW",
    "OFFER",
    "FINAL",
  ];

  it.each(ALL_STAGES.filter((s) => s !== "FINAL"))(
    "succeeds transitioning into %s without an outcome",
    async (stage) => {
      const result = await transitionStage("app_1", OWNER_ID, { stage });
      expect(result.application.stage).toBe(stage);
      expect(applicationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { stage, outcome: null } }),
      );
    },
  );

  it("throws OutcomeRequiredError transitioning into FINAL without an outcome, no write performed", async () => {
    await expect(
      transitionStage("app_1", OWNER_ID, { stage: "FINAL" }),
    ).rejects.toThrow(OutcomeRequiredError);
    expect(applicationUpdate).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("succeeds transitioning into FINAL with a valid outcome, outcome persisted", async () => {
    const result = await transitionStage("app_1", OWNER_ID, {
      stage: "FINAL",
      outcome: "HIRED",
    });
    expect(result.application.stage).toBe("FINAL");
    expect(result.application.outcome).toBe("HIRED");
    expect(result.eventId).toBe("evt_new");
  });

  it("clears a previously-set outcome when leaving FINAL", async () => {
    applicationFindUnique.mockResolvedValue({
      stage: "FINAL",
      outcome: "HIRED",
      profile: { userId: OWNER_ID },
    });
    await transitionStage("app_1", OWNER_ID, { stage: "SCREENING" });
    expect(applicationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { stage: "SCREENING", outcome: null },
      }),
    );
  });

  it("records fromStage/toStage on the STAGE_CHANGE event", async () => {
    applicationFindUnique.mockResolvedValue({
      stage: "SCREENING",
      outcome: null,
      profile: { userId: OWNER_ID },
    });
    await transitionStage("app_1", OWNER_ID, { stage: "OFFER" });
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicationId: "app_1",
          type: "STAGE_CHANGE",
          fromStage: "SCREENING",
          toStage: "OFFER",
        }),
      }),
    );
  });

  it("captures previousOutcome on the event when the transition leaves FINAL (REM-4)", async () => {
    applicationFindUnique.mockResolvedValue({
      stage: "FINAL",
      outcome: "HIRED",
      profile: { userId: OWNER_ID },
    });
    await transitionStage("app_1", OWNER_ID, { stage: "SCREENING" });
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStage: "FINAL",
          toStage: "SCREENING",
          previousOutcome: "HIRED",
        }),
      }),
    );
  });

  it("does not set previousOutcome when the transition does not leave FINAL", async () => {
    applicationFindUnique.mockResolvedValue({
      stage: "SCREENING",
      outcome: null,
      profile: { userId: OWNER_ID },
    });
    await transitionStage("app_1", OWNER_ID, { stage: "OFFER" });
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ previousOutcome: null }),
      }),
    );
  });

  it("rejects with OwnershipViolationError when the caller does not own the Application (REM-8)", async () => {
    applicationFindUnique.mockResolvedValue({
      stage: "APPLIED",
      outcome: null,
      profile: { userId: "someone_else" },
    });
    await expect(
      transitionStage("app_1", OWNER_ID, { stage: "SCREENING" }),
    ).rejects.toThrow(OwnershipViolationError);
    expect(applicationUpdate).not.toHaveBeenCalled();
  });

  it("rejects with OwnershipViolationError when the Application does not exist (REM-8)", async () => {
    applicationFindUnique.mockResolvedValue(null);
    await expect(
      transitionStage("app_1", OWNER_ID, { stage: "SCREENING" }),
    ).rejects.toThrow(OwnershipViolationError);
  });
});

describe("applicationService.undoTransition", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    applicationFindUnique.mockResolvedValue({
      profile: { userId: OWNER_ID },
    });
    eventDelete.mockResolvedValue({});
    applicationUpdate.mockImplementation(({ data }) =>
      Promise.resolve({
        id: "app_1",
        stage: data.stage,
        outcome: data.outcome,
      }),
    );
  });

  it("reverts stage and deletes the event when eventId matches the latest STAGE_CHANGE event", async () => {
    eventFindFirst.mockResolvedValue({
      id: "evt_latest",
      fromStage: "SCREENING",
      toStage: "TECH_INTERVIEW",
      previousOutcome: null,
    });

    const result = await undoTransition("app_1", OWNER_ID, "evt_latest");

    expect(eventDelete).toHaveBeenCalledWith({ where: { id: "evt_latest" } });
    expect(applicationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { stage: "SCREENING", outcome: undefined },
      }),
    );
    expect(result.stage).toBe("SCREENING");
  });

  it("clears outcome when the undone transition had set one (moved into FINAL)", async () => {
    eventFindFirst.mockResolvedValue({
      id: "evt_latest",
      fromStage: "OFFER",
      toStage: "FINAL",
      previousOutcome: null,
    });

    await undoTransition("app_1", OWNER_ID, "evt_latest");

    expect(applicationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stage: "OFFER", outcome: null } }),
    );
  });

  it("restores previousOutcome when the undone transition left FINAL (REM-4)", async () => {
    eventFindFirst.mockResolvedValue({
      id: "evt_latest",
      fromStage: "FINAL",
      toStage: "SCREENING",
      previousOutcome: "HIRED",
    });

    await undoTransition("app_1", OWNER_ID, "evt_latest");

    expect(applicationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { stage: "FINAL", outcome: "HIRED" },
      }),
    );
  });

  it("rejects with StaleUndoError when eventId does not match the latest STAGE_CHANGE event", async () => {
    eventFindFirst.mockResolvedValue({
      id: "evt_current",
      fromStage: "SCREENING",
      toStage: "TECH_INTERVIEW",
      previousOutcome: null,
    });

    await expect(
      undoTransition("app_1", OWNER_ID, "evt_stale"),
    ).rejects.toThrow(StaleUndoError);
    expect(eventDelete).not.toHaveBeenCalled();
    expect(applicationUpdate).not.toHaveBeenCalled();
  });

  it("rejects with StaleUndoError when there is no STAGE_CHANGE event at all", async () => {
    eventFindFirst.mockResolvedValue(null);

    await expect(
      undoTransition("app_1", OWNER_ID, "evt_stale"),
    ).rejects.toThrow(StaleUndoError);
  });

  it("rejects with StaleUndoError for the Application-creation event (no fromStage to revert to)", async () => {
    eventFindFirst.mockResolvedValue({
      id: "evt_creation",
      fromStage: null,
      toStage: "APPLIED",
      previousOutcome: null,
    });

    await expect(
      undoTransition("app_1", OWNER_ID, "evt_creation"),
    ).rejects.toThrow(StaleUndoError);
    expect(eventDelete).not.toHaveBeenCalled();
  });

  it("rejects with OwnershipViolationError when the caller does not own the Application (REM-8)", async () => {
    applicationFindUnique.mockResolvedValue({
      profile: { userId: "someone_else" },
    });

    await expect(
      undoTransition("app_1", OWNER_ID, "evt_latest"),
    ).rejects.toThrow(OwnershipViolationError);
    expect(eventFindFirst).not.toHaveBeenCalled();
  });
});

describe("applicationService.addManualEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    applicationFindUnique.mockResolvedValue({
      profile: { userId: OWNER_ID },
    });
    eventCreate.mockImplementation(({ data }) =>
      Promise.resolve({ id: "evt_1", ...data }),
    );
  });

  it("NOTE: populates only content", async () => {
    await addManualEvent("app_1", OWNER_ID, {
      type: "NOTE",
      content: "Follow up next week",
    });
    expect(eventCreate).toHaveBeenCalledWith({
      data: {
        applicationId: "app_1",
        type: "NOTE",
        content: "Follow up next week",
      },
    });
  });

  it("MEETING: populates title + eventAt, content optional", async () => {
    await addManualEvent("app_1", OWNER_ID, {
      type: "MEETING",
      title: "Tech screen",
      eventAt: "2026-08-10T14:00:00.000Z",
    });
    expect(eventCreate).toHaveBeenCalledWith({
      data: {
        applicationId: "app_1",
        type: "MEETING",
        title: "Tech screen",
        eventAt: new Date("2026-08-10T14:00:00.000Z"),
      },
    });
  });

  it("MEETING: includes content when provided", async () => {
    await addManualEvent("app_1", OWNER_ID, {
      type: "MEETING",
      title: "Tech screen",
      eventAt: "2026-08-10T14:00:00.000Z",
      content: "Bring portfolio",
    });
    expect(eventCreate).toHaveBeenCalledWith({
      data: {
        applicationId: "app_1",
        type: "MEETING",
        title: "Tech screen",
        eventAt: new Date("2026-08-10T14:00:00.000Z"),
        content: "Bring portfolio",
      },
    });
  });

  it("COMPANY_RESPONSE: populates only content", async () => {
    await addManualEvent("app_1", OWNER_ID, {
      type: "COMPANY_RESPONSE",
      content: "Received an offer letter",
    });
    expect(eventCreate).toHaveBeenCalledWith({
      data: {
        applicationId: "app_1",
        type: "COMPANY_RESPONSE",
        content: "Received an offer letter",
      },
    });
  });

  it("rejects with OwnershipViolationError when the caller does not own the Application (REM-8)", async () => {
    applicationFindUnique.mockResolvedValue({
      profile: { userId: "someone_else" },
    });

    await expect(
      addManualEvent("app_1", OWNER_ID, {
        type: "NOTE",
        content: "Should not be written",
      }),
    ).rejects.toThrow(OwnershipViolationError);
    expect(eventCreate).not.toHaveBeenCalled();
  });
});
