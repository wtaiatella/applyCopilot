"use client";

import React from "react";
import Link from "next/link";
import { Button, Switch, Tooltip, Input } from "antd";
import {
  DeleteOutlined,
  LockOutlined,
  MenuOutlined,
} from "@ant-design/icons";
import { Sparkles } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BulletDTO } from "../../../types/profile";

const { TextArea } = Input;

export interface SortableBulletItemProps {
  bullet: BulletDTO;
  onUpdate: (bulletId: string, data: Partial<BulletDTO>) => void;
  onDelete: (bulletId: string) => void;
  /** When true, the AI Review button is rendered */
  showAIReview?: boolean;
  /** Called when the user clicks the AI Review button */
  onAIReview?: (bullet: BulletDTO) => void;
  /** When true, displays loading spinner on the AI Review button */
  aiReviewLoading?: boolean;
}

/**
 * A draggable, sortable bullet row used across Experience, Project, and Education forms.
 *
 * Key changes vs the original per-form component:
 * - Type toggle: the • / ¶ indicator is now a clickable <button> instead of a <Select>
 * - Persistent AI Review: a Sparkles button rendered in Row 2 when showAIReview + onAIReview are set
 */
export default function SortableBulletItem({
  bullet,
  onUpdate,
  onDelete,
  showAIReview = false,
  onAIReview,
  aiReviewLoading = false,
}: SortableBulletItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bullet.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : undefined,
  };

  const isUsed = bullet.usedInCVs && bullet.usedInCVs.length > 0;
  const isBullet = bullet.type === "BULLET";

  const handleTypeToggle = () => {
    onUpdate(bullet.id, { type: isBullet ? "PARAGRAPH" : "BULLET" });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 p-2 rounded-md transition-colors border ${
        !bullet.isActive
          ? "opacity-60 border-dashed border-zinc-700 bg-zinc-950/20"
          : "border-zinc-800 bg-zinc-950/40"
      }`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="mt-2.5 cursor-grab text-zinc-600 hover:text-zinc-400 shrink-0"
      >
        <MenuOutlined style={{ fontSize: 11 }} />
      </div>

      {/* Auto-expanding text area with inline indicator inside text box */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="relative w-full">
          {isBullet && (
            <span
              data-testid="inline-bullet-marker"
              className="absolute left-2.5 top-[6px] text-zinc-400 select-none font-bold text-sm leading-none pointer-events-none z-10"
              aria-hidden="true"
            >
              •
            </span>
          )}
          <TextArea
            value={bullet.text}
            onChange={(e) => onUpdate(bullet.id, { text: e.target.value })}
            readOnly={isUsed}
            autoSize={{ minRows: 1 }}
            style={{
              paddingLeft: isBullet ? "24px" : undefined,
              paddingRight: isUsed ? "28px" : undefined,
            }}
            className="bg-transparent border-zinc-800 text-white focus:bg-zinc-900 focus:border-zinc-700 text-sm w-full resize-none"
            placeholder="Describe an achievement or responsibility..."
          />
          {isUsed && (
            <Tooltip title="Text is locked because this bullet is used in a generated CV — edits here would not change what was already sent">
              <LockOutlined
                className="absolute right-2.5 top-2.5 text-zinc-500"
                style={{ fontSize: 12 }}
                aria-label="Text locked — used in a CV"
              />
            </Tooltip>
          )}
        </div>
        {isUsed && (
          <div className="pl-1.5">
            <span className="text-[10px] bg-blue-900/30 text-blue-300 border border-blue-800/40 px-1.5 py-0.5 rounded font-medium">
              Used in:{" "}
              {bullet.usedInCVs.map((cv, index) => (
                <React.Fragment key={cv.id}>
                  {index > 0 && ", "}
                  <Link
                    href={`/jobs/${cv.jobListingId}/application`}
                    className="underline hover:text-blue-100"
                  >
                    {cv.name}
                  </Link>
                </React.Fragment>
              ))}
            </span>
          </div>
        )}
      </div>

      {/* Right-hand action column hierarchy */}
      <div className="flex flex-col items-end gap-1.5 shrink-0 pt-1">
        {/* Row 1: Lifecycle & Status (Active Switch + Delete Button) */}
        <div className="flex items-center gap-1.5">
          {/* Active toggle */}
          <Tooltip
            title={
              bullet.isActive
                ? "Active — shows on CV"
                : "Inactive — hidden from CV"
            }
          >
            <Switch
              checked={bullet.isActive}
              onChange={(checked) => onUpdate(bullet.id, { isActive: checked })}
              size="small"
              className="shrink-0"
            />
          </Tooltip>

          {/* Delete */}
          <Tooltip
            title={
              isUsed
                ? "Remove from active list — used in a CV, so this archives it instead of deleting"
                : "Delete bullet"
            }
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onDelete(bullet.id)}
              size="small"
              className="hover:bg-zinc-900 shrink-0"
              aria-label={isUsed ? "Remove from active list" : "Delete bullet"}
            />
          </Tooltip>
        </div>

        {/* Row 2: Content formatting & enhancement (Type Toggle + AI Review) */}
        <div className="flex items-center justify-end gap-1.5 w-full">
          <Tooltip
            title={`Switch to ${isBullet ? "Paragraph (¶)" : "Bullet (•)"} — click to toggle`}
          >
            <button
              type="button"
              onClick={handleTypeToggle}
              className="h-6 w-6 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer select-none font-bold flex items-center justify-center border border-zinc-800/80 bg-zinc-900/60 leading-none text-sm"
              aria-label={`Toggle type: currently ${isBullet ? "bullet" : "paragraph"}`}
              data-testid="bullet-type-toggle"
            >
              <span>{isBullet ? "•" : "¶"}</span>
            </button>
          </Tooltip>

          {showAIReview && onAIReview && (
            <Tooltip title="AI Review this bullet">
              <Button
                type="text"
                size="small"
                icon={<Sparkles size={14} className="shrink-0" />}
                loading={aiReviewLoading}
                onClick={() => onAIReview(bullet)}
                className="shrink-0 text-violet-400 hover:text-violet-300 hover:bg-violet-900/20 opacity-100"
                aria-label="AI Review this bullet"
                data-testid="ai-review-bullet-button"
              />
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}
