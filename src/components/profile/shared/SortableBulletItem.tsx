"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button, Switch, Tooltip, Input } from "antd";
import {
  DeleteOutlined,
  LockOutlined,
  MenuOutlined,
  StarOutlined,
} from "@ant-design/icons";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BulletDTO } from "../../../types/profile";

const { TextArea } = Input;

export interface SortableBulletItemProps {
  bullet: BulletDTO;
  onUpdate: (bulletId: string, data: Partial<BulletDTO>) => void;
  onDelete: (bulletId: string) => void;
  /** When true, a ✦ AI Review button appears on hover */
  showAIReview?: boolean;
  /** Called when the user clicks the AI Review button */
  onAIReview?: (bullet: BulletDTO) => void;
  /** When true, shows a spinner on the AI Review button and keeps it visible */
  aiReviewLoading?: boolean;
}

/**
 * A draggable, sortable bullet row used across Experience, Project, and Education forms.
 *
 * Key changes vs the original per-form component:
 * - Type toggle: the • / ¶ indicator is now a clickable <button> instead of a <Select>
 * - Hover AI Review: a ✦ button appears on hover when showAIReview + onAIReview are set
 *   The button is also keyboard-focusable via Tab for accessibility (AC-10)
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

  const [isHovered, setIsHovered] = useState(false);

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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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

      {/* Bullet type toggle — clickable button (replaces <Select>) */}
      <Tooltip
        title={`Switch to ${isBullet ? "Paragraph (¶)" : "Bullet (•)"} — click to toggle`}
      >
        <button
          type="button"
          onClick={handleTypeToggle}
          className="mt-2.5 text-zinc-400 shrink-0 select-none font-bold cursor-pointer hover:text-white transition-colors bg-transparent border-none p-0 leading-none"
          aria-label={`Toggle type: currently ${isBullet ? "bullet" : "paragraph"}`}
        >
          {isBullet ? "•" : "¶"}
        </button>
      </Tooltip>

      {/* Auto-expanding text area */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="items-start gap-1" style={{ display: "flex" }}>
          <TextArea
            value={bullet.text}
            onChange={(e) => onUpdate(bullet.id, { text: e.target.value })}
            readOnly={isUsed}
            autoSize={{ minRows: 1 }}
            className="bg-transparent border-none text-white focus:bg-zinc-900 focus:border-zinc-800 text-sm px-1.5 w-full resize-none"
            placeholder="Describe an achievement or responsibility..."
          />
          {isUsed && (
            <Tooltip title="Text is locked because this bullet is used in a generated CV — edits here would not change what was already sent">
              <LockOutlined
                className="mt-2.5 text-zinc-500 shrink-0"
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

      {/* AI Review hover button (AC-10) — visible on hover, always keyboard-focusable */}
      {showAIReview && onAIReview && (
        <Tooltip title="AI Review this bullet">
          <Button
            type="text"
            size="small"
            icon={<StarOutlined />}
            loading={aiReviewLoading}
            onClick={() => onAIReview(bullet)}
            className={`shrink-0 text-violet-400 hover:text-violet-300 hover:bg-violet-900/20 transition-opacity ${
              isHovered || aiReviewLoading
                ? "opacity-100"
                : "opacity-0 focus:opacity-100"
            }`}
            aria-label="AI Review this bullet"
          />
        </Tooltip>
      )}

      {/* Active toggle */}
      <Tooltip
        title={
          bullet.isActive ? "Active — shows on CV" : "Inactive — hidden from CV"
        }
      >
        <Switch
          checked={bullet.isActive}
          onChange={(checked) => onUpdate(bullet.id, { isActive: checked })}
          size="small"
          className="shrink-0 mt-1.5"
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
  );
}
