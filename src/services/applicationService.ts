import { logger } from "@/lib/logging/logger";
import { prisma } from "@/lib/db/prisma";
import type {
  Prisma,
  ApplicationStage,
  ApplicationOutcome,
} from "@prisma/client";
import type {
  StageTransitionInput,
  UndoInput,
  AddEventInput,
} from "@/lib/validation/applicationSchemas";

/**
 * Thrown when a stage transition targets `FINAL` without an `outcome` (FR-6, AC.4). Enforced
 * here — not only by `StageTransitionSchema`'s Zod refine — so the invariant holds even for a
 * caller that bypasses HTTP validation (defense in depth, mirrors the DB-level
 * `applicationevent_type_shape_check` CHECK constraint backstopping `addManualEvent`).
 */
export class OutcomeRequiredError extends Error {
  constructor() {
    super("outcome is required when stage is FINAL");
    this.name = "OutcomeRequiredError";
  }
}

/**
 * Thrown when an Undo's `eventId` does not match the Application's current latest
 * `STAGE_CHANGE` event — either superseded by a newer transition, or already undone (FR-8, AC.3).
 */
export class StaleUndoError extends Error {
  constructor() {
    super("eventId is not this Application's latest STAGE_CHANGE event");
    this.name = "StaleUndoError";
  }
}

// Structural subset of a Prisma transaction client `createApplicationForCV` needs — mirrors
// `cvReconciliationService.ts`'s `ReconcileTx` convention: the caller's already-open Apply
// transaction is passed in, not a bare Prisma client.
export interface CreateApplicationTx {
  application: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  applicationEvent: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

export interface CVForApplicationCreation {
  id: string;
  profileId: string;
  jobListingId: string;
}

/**
 * Creates the `Application` row (+ its first `STAGE_CHANGE` event, `fromStage: null,
 * toStage: APPLIED`) for a CV that just became `APPLIED`. Must be called as the LAST statement
 * inside the caller's existing `prisma.$transaction` (see `POST /api/cv/[cvId]/apply`) — this
 * function performs no transaction management itself (FR-1, FR-2, AC.1).
 */
export async function createApplicationForCV(
  tx: CreateApplicationTx,
  cv: CVForApplicationCreation,
): Promise<{ id: string }> {
  const application = await tx.application.create({
    data: {
      cvId: cv.id,
      profileId: cv.profileId,
      jobListingId: cv.jobListingId,
      stage: "APPLIED",
    },
  });

  await tx.applicationEvent.create({
    data: {
      applicationId: application.id,
      type: "STAGE_CHANGE",
      fromStage: null,
      toStage: "APPLIED",
    },
  });

  logger.info("application_created", {
    cvId: cv.id,
    jobListingId: cv.jobListingId,
    applicationId: application.id,
  });

  return application;
}

interface ApplicationRow {
  id: string;
  stage: ApplicationStage;
  outcome: ApplicationOutcome | null;
}

/**
 * Transitions an Application's `stage` (FR-4, unrestricted — every stage reachable from every
 * other stage), requiring `outcome` when the target is `FINAL` (FR-6, AC.4) and clearing any
 * previously-set `outcome` when moving away from `FINAL` (Clarifications & Assumptions —
 * `outcome` is scoped to "how did this end", reopening a Final application is legitimate).
 * Records the transition as a `STAGE_CHANGE` event (FR-7) and returns its id so the caller's
 * Undo toast can reference exactly this transition (FR-8). Runs in its own transaction, outside
 * the Apply transaction.
 */
export async function transitionStage(
  applicationId: string,
  input: StageTransitionInput,
): Promise<{ application: ApplicationRow; eventId: string }> {
  if (input.stage === "FINAL" && !input.outcome) {
    throw new OutcomeRequiredError();
  }

  const outcome = input.stage === "FINAL" ? (input.outcome ?? null) : null;

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: { stage: true },
    });

    const updated = await tx.application.update({
      where: { id: applicationId },
      data: { stage: input.stage, outcome },
      select: { id: true, stage: true, outcome: true },
    });

    const event = await tx.applicationEvent.create({
      data: {
        applicationId,
        type: "STAGE_CHANGE",
        fromStage: current.stage,
        toStage: input.stage,
      },
      select: { id: true },
    });

    return { application: updated, eventId: event.id };
  });

  logger.info("application_stage_changed", {
    applicationId,
    toStage: input.stage,
    outcome,
  });

  return result;
}

/**
 * Reverts an Application's most recent `STAGE_CHANGE` transition: sets `stage` back to the
 * undone event's `fromStage`, deletes the event, and clears `outcome` if the undone transition
 * had set one (FR-8, AC.3). Rejects with `StaleUndoError` when `eventId` is not the
 * Application's current latest `STAGE_CHANGE` event (superseded by a newer transition, or
 * already undone) — enforced server-side regardless of the toast's own client-side timer
 * (Clarifications & Assumptions).
 */
export async function undoTransition(
  applicationId: string,
  eventId: UndoInput["eventId"],
): Promise<ApplicationRow> {
  const updated = await prisma.$transaction(async (tx) => {
    const latestEvent = await tx.applicationEvent.findFirst({
      where: { applicationId, type: "STAGE_CHANGE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, fromStage: true, toStage: true },
    });

    if (!latestEvent || latestEvent.id !== eventId || !latestEvent.fromStage) {
      // `!latestEvent.fromStage` guards the Application-creation event (fromStage: null) — there
      // is no prior stage to revert to, so it can never be the target of an Undo.
      throw new StaleUndoError();
    }

    await tx.applicationEvent.delete({ where: { id: eventId } });

    return tx.application.update({
      where: { id: applicationId },
      data: {
        stage: latestEvent.fromStage,
        // The undone transition had set an outcome only if it moved INTO FINAL.
        outcome: latestEvent.toStage === "FINAL" ? null : undefined,
      },
      select: { id: true, stage: true, outcome: true },
    });
  });

  logger.info("application_transition_undone", {
    applicationId,
    revertedEventId: eventId,
  });

  return updated;
}

interface ApplicationEventRow {
  id: string;
  type: string;
  fromStage: ApplicationStage | null;
  toStage: ApplicationStage | null;
  title: string | null;
  eventAt: Date | null;
  content: string | null;
  createdAt: Date;
}

/**
 * Authors one manual timeline entry (`NOTE`/`MEETING`/`COMPANY_RESPONSE`, FR-9) — the only write
 * path for `ApplicationEvent` rows besides `transitionStage`'s automatic `STAGE_CHANGE` (see
 * spectech.md "Boundaries & coupling"). Populates only the fields relevant to `input.type`,
 * matching the DB-level `applicationevent_type_shape_check` CHECK constraint.
 */
export async function addManualEvent(
  applicationId: string,
  input: AddEventInput,
): Promise<ApplicationEventRow> {
  const data: Prisma.ApplicationEventUncheckedCreateInput = {
    applicationId,
    type: input.type,
  };

  if (input.type === "MEETING") {
    data.title = input.title;
    data.eventAt = new Date(input.eventAt);
    if (input.content) {
      data.content = input.content;
    }
  } else {
    // NOTE / COMPANY_RESPONSE
    data.content = input.content;
  }

  const event = await prisma.applicationEvent.create({ data });

  logger.info("application_event_added", { applicationId, type: input.type });

  return event;
}
