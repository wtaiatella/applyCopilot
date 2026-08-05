"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Alert, Modal, Select, Spin, notification } from "antd";
import ApplicationCard, { STAGE_OPTIONS } from "./ApplicationCard";
import ApplicationDetailModal from "./ApplicationDetailModal";
import { ApplicationTrackerService } from "@/services/applicationTrackerService";
import type {
  ApplicationBoardRow,
  ApplicationOutcome,
  ApplicationStage,
} from "@/types/application";

const OUTCOME_OPTIONS: { value: ApplicationOutcome; label: string }[] = [
  { value: "NOT_APPROVED", label: "Not Approved" },
  { value: "NO_RESPONSE", label: "No Response" },
  { value: "DECLINED_BY_COMPANY", label: "Declined by Company" },
  { value: "DECLINED_BY_CANDIDATE", label: "Declined by Candidate" },
  { value: "HIRED", label: "Hired" },
];

interface PendingFinal {
  applicationId: string;
}

function emptyGroups(): Record<ApplicationStage, ApplicationBoardRow[]> {
  return {
    APPLIED: [],
    SCREENING: [],
    TECH_INTERVIEW: [],
    OFFER: [],
    FINAL: [],
  };
}

/**
 * One droppable Kanban column (`useDroppable`) — the cross-container drop target for
 * `KanbanBoard`'s `DndContext` (Technical Decisions: `@dnd-kit` cross-container reuse, no new
 * dependency).
 */
function KanbanColumn({
  stage,
  label,
  applications,
  onStageChange,
  onOpenDetail,
}: {
  stage: ApplicationStage;
  label: string;
  applications: ApplicationBoardRow[];
  onStageChange: (applicationId: string, stage: ApplicationStage) => void;
  onOpenDetail: (jobListingId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      data-testid={`kanban-column-${stage}`}
      className={`min-w-[220px] flex-1 rounded-md border p-2 ${
        isOver ? "border-blue-500 bg-blue-950/10" : "border-zinc-800"
      }`}
    >
      <div className="mb-2 text-sm font-semibold text-zinc-300">
        {label} <span className="text-zinc-500">({applications.length})</span>
      </div>
      {applications.map((application) => (
        <ApplicationCard
          key={application.id}
          application={application}
          onStageChange={onStageChange}
          onOpenDetail={onOpenDetail}
        />
      ))}
    </div>
  );
}

/**
 * Board view: `@dnd-kit/core` `DndContext` + 5 `useDroppable` columns (FR-5, FR-14). Both this
 * component's `onDragEnd` and `ApplicationCard`'s dropdown `onChange` funnel through
 * `requestStageChange` → `ApplicationTrackerService.transitionStage` — the same server-side
 * transition action, so drag-and-drop and the dropdown always have identical effects
 * (Implementation Notes). The Final-column outcome prompt (FR-6, AC.4) blocks either path from
 * completing the transition until an outcome is chosen; a short (~5s) Undo toast follows every
 * successful transition (FR-8, AC.3).
 */
export default function KanbanBoard() {
  const [applications, setApplications] = useState<ApplicationBoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingFinal, setPendingFinal] = useState<PendingFinal | null>(null);
  const [selectedOutcome, setSelectedOutcome] =
    useState<ApplicationOutcome | null>(null);
  // Detail modal (FR-16, US-5) — `null` closed, board's own state is otherwise untouched by
  // opening/closing it (AC.7).
  const [detailJobListingId, setDetailJobListingId] = useState<string | null>(
    null,
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await ApplicationTrackerService.getApplications();
        if (!cancelled) setApplications(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load applications",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const byStage = useMemo(() => {
    const grouped = emptyGroups();
    for (const app of applications) {
      grouped[app.stage].push(app);
    }
    return grouped;
  }, [applications]);

  function applyLocalStage(
    applicationId: string,
    stage: ApplicationStage,
    outcome: ApplicationOutcome | null,
  ) {
    setApplications((prev) =>
      prev.map((app) =>
        app.id === applicationId ? { ...app, stage, outcome } : app,
      ),
    );
  }

  function showUndoToast(
    applicationId: string,
    eventId: string,
    newStage: ApplicationStage,
  ) {
    const key = `undo-${eventId}`;
    const label =
      STAGE_OPTIONS.find((s) => s.value === newStage)?.label ?? newStage;
    notification.open({
      key,
      message: "Stage updated",
      description: `Moved to ${label}.`,
      duration: 5,
      btn: (
        <a
          onClick={async () => {
            notification.destroy(key);
            try {
              const reverted = await ApplicationTrackerService.undoTransition(
                applicationId,
                eventId,
              );
              applyLocalStage(applicationId, reverted.stage, reverted.outcome);
            } catch (err) {
              notification.error({
                message: "Could not undo",
                description:
                  err instanceof Error ? err.message : "Please try again.",
              });
            }
          }}
        >
          Undo
        </a>
      ),
    });
  }

  async function commitStageChange(
    applicationId: string,
    targetStage: ApplicationStage,
    outcome?: ApplicationOutcome,
  ) {
    const previous = applications.find((app) => app.id === applicationId);
    if (!previous) return;

    // Optimistic move — reconciles on success, reverts on any non-2xx response (Risks table row 2).
    applyLocalStage(applicationId, targetStage, outcome ?? null);

    try {
      const result = await ApplicationTrackerService.transitionStage(
        applicationId,
        { stage: targetStage, outcome },
      );
      applyLocalStage(applicationId, result.stage, result.outcome);
      showUndoToast(applicationId, result.eventId, result.stage);
    } catch (err) {
      applyLocalStage(applicationId, previous.stage, previous.outcome);
      notification.error({
        message: "Could not update stage",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  }

  function requestStageChange(
    applicationId: string,
    targetStage: ApplicationStage,
  ) {
    const app = applications.find((a) => a.id === applicationId);
    if (!app || app.stage === targetStage) return;

    if (targetStage === "FINAL") {
      // Outcome prompt (FR-6, AC.4) — the transition does not complete (no API call, no local
      // move) until an outcome is selected.
      setSelectedOutcome(null);
      setPendingFinal({ applicationId });
      return;
    }

    commitStageChange(applicationId, targetStage);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    requestStageChange(String(active.id), over.id as ApplicationStage);
  }

  function handleConfirmOutcome() {
    if (!pendingFinal || !selectedOutcome) return;
    commitStageChange(pendingFinal.applicationId, "FINAL", selectedOutcome);
    setPendingFinal(null);
    setSelectedOutcome(null);
  }

  function handleCancelOutcome() {
    setPendingFinal(null);
    setSelectedOutcome(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message={error} showIcon />;
  }

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {STAGE_OPTIONS.map(({ value, label }) => (
            <KanbanColumn
              key={value}
              stage={value}
              label={label}
              applications={byStage[value]}
              onStageChange={requestStageChange}
              onOpenDetail={setDetailJobListingId}
            />
          ))}
        </div>
      </DndContext>

      <ApplicationDetailModal
        jobListingId={detailJobListingId}
        onClose={() => setDetailJobListingId(null)}
      />

      <Modal
        title="Select an outcome"
        open={pendingFinal !== null}
        onOk={handleConfirmOutcome}
        onCancel={handleCancelOutcome}
        okButtonProps={{ disabled: !selectedOutcome }}
      >
        <Select<ApplicationOutcome>
          style={{ width: "100%" }}
          placeholder="Outcome"
          options={OUTCOME_OPTIONS}
          value={selectedOutcome ?? undefined}
          onChange={setSelectedOutcome}
        />
      </Modal>
    </>
  );
}
