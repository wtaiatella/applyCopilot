"use client";

import { Card, Select, Tag } from "antd";
import { GripVertical } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type {
  ApplicationBoardRow,
  ApplicationStage,
  ApplicationOutcome,
} from "@/types/application";

export const STAGE_OPTIONS: { value: ApplicationStage; label: string }[] = [
  { value: "APPLIED", label: "Applied" },
  { value: "SCREENING", label: "Screening" },
  { value: "TECH_INTERVIEW", label: "Tech Interview" },
  { value: "OFFER", label: "Offer" },
  { value: "FINAL", label: "Final" },
];

const OUTCOME_LABEL: Record<ApplicationOutcome, string> = {
  NOT_APPROVED: "Not Approved",
  NO_RESPONSE: "No Response",
  DECLINED_BY_COMPANY: "Declined by Company",
  DECLINED_BY_CANDIDATE: "Declined by Candidate",
  HIRED: "Hired",
};

export interface ApplicationCardProps {
  application: ApplicationBoardRow;
  /**
   * Owned by `KanbanBoard` — funnels both this dropdown and `KanbanBoard`'s own `onDragEnd`
   * into the same `requestStageChange` → `ApplicationTrackerService.transitionStage` path
   * (FR-5, Implementation Notes).
   */
  onStageChange: (applicationId: string, stage: ApplicationStage) => void;
  /**
   * Opens `ApplicationDetailModal` for this card's job (FR-16, US-5). Fired on a click of the
   * card body — never on the drag handle or the stage `Select`, which have their own listeners.
   */
  onOpenDetail: (jobListingId: string) => void;
}

/**
 * One Kanban card: drag handle (`useDraggable`) + stage dropdown, both driving the identical
 * `onStageChange` callback, plus an outcome badge once the Application has one (FR-6, FR-16).
 * Clicking anywhere on the card body (outside the drag handle/dropdown) opens the detail modal.
 */
export default function ApplicationCard({
  application,
  onStageChange,
  onOpenDetail,
}: ApplicationCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: application.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`application-card-${application.id}`}
    >
      <Card
        size="small"
        className="mb-2 cursor-pointer"
        onClick={() => onOpenDetail(application.jobListingId)}
      >
        <div className="flex items-start gap-2">
          <span
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 cursor-grab text-zinc-500 hover:text-zinc-300 shrink-0"
            aria-label="Drag to move stage"
            data-testid={`application-card-handle-${application.id}`}
          >
            <GripVertical size={14} />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="truncate text-sm font-medium text-zinc-200">
              {application.jobTitle}
            </div>
            <div className="truncate text-xs text-zinc-500">
              {application.company}
            </div>
            <Select<ApplicationStage>
              size="small"
              value={application.stage}
              options={STAGE_OPTIONS}
              style={{ width: "100%" }}
              onClick={(e) => e.stopPropagation()}
              onChange={(stage) => onStageChange(application.id, stage)}
            />
            {application.outcome && (
              <Tag color="green">{OUTCOME_LABEL[application.outcome]}</Tag>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
