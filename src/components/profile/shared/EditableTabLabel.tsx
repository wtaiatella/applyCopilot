"use client";

import React, { useState, useEffect } from "react";
import { Input } from "antd";

export interface EditableTabLabelProps {
  value: string;
  onSave: (val: string) => void;
  /** Shown when value is empty (e.g. company name, project name) */
  fallback: string;
}

/**
 * Renders a tab label that turns into an inline <Input> on double-click.
 * Pressing Enter or losing focus commits the change; Escape cancels.
 *
 * Key events are stopped from bubbling so Ant Design Tabs don't intercept
 * ArrowLeft/Right (tab navigation) or Backspace/Delete (tab close).
 */
export default function EditableTabLabel({ value, onSave, fallback }: EditableTabLabelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  useEffect(() => { setTempValue(value); }, [value]);

  const handleBlur = () => {
    setIsEditing(false);
    const trimmed = tempValue.trim();
    if (trimmed !== value) onSave(trimmed); // save even if empty (clears label → fallback)
    else setTempValue(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Stop ALL key events from bubbling to Ant Design Tabs container.
    // Without this, ArrowLeft/Right navigate tabs and Backspace/Delete close them.
    e.stopPropagation();
    if (e.key === "Enter") handleBlur();
    else if (e.key === "Escape") { setIsEditing(false); setTempValue(value); }
  };

  if (isEditing) {
    return (
      <Input
        size="small"
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoFocus
        style={{ width: 140, height: 22, fontSize: 12 }}
        onClick={(e) => e.stopPropagation()}
        placeholder={fallback}
      />
    );
  }

  return (
    <span
      onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
      className="cursor-pointer select-none"
      title="Double-click to rename tab (does not change the underlying name)"
    >
      {value || fallback}
    </span>
  );
}
