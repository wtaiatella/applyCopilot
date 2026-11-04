"use client";

import React, { useState, useEffect, useRef } from "react";
import { Input, Button, Tooltip } from "antd";
import type { InputRef } from "antd";
import { ExportOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";

export interface EditableSocialLinkProps {
  value?: string | null;
  onChange?: (value: string | null) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Normalizes URL protocol to ensure external navigation schemes (http/https).
 * Strips/rejects hazardous pseudo-protocols (javascript:, data:, vbscript:) to mitigate XSS vectors.
 * Prepends https:// if a protocol scheme is absent.
 */
export const ensureUrlProtocol = (url: string): string => {
  const trimmed = url?.trim() || "";
  if (!trimmed) return "";
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return "";
  }
  if (/^(https?:\/\/)/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

/**
 * EditableSocialLink
 * Dual-state component for social links:
 * - Empty State: Open <Input> with custom placeholder.
 * - Populated State: Hyperlink with external icon, edit, and delete action buttons.
 * - Active Edit State: <Input> with autofocus, commit on blur/Enter, cancel on Escape.
 * - Inline Deletion: Dispatches onChange(null) without confirmation modal.
 */
export default function EditableSocialLink({
  value,
  onChange,
  placeholder,
  ariaLabel,
  disabled = false,
  className = "",
}: EditableSocialLinkProps) {
  const hasValue = Boolean(value && value.trim() !== "");
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value || "");
  const inputRef = useRef<InputRef>(null);
  const isCancelingRef = useRef(false);
  const isCommittedRef = useRef(false);

  useEffect(() => {
    if (!isEditing) {
      setInputValue(value || "");
    }
  }, [value, isEditing]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus({ cursor: "all" });
    }
  }, [isEditing]);

  const handleCommit = () => {
    if (isCancelingRef.current) {
      isCancelingRef.current = false;
      return;
    }
    if (isCommittedRef.current) {
      isCommittedRef.current = false;
      return;
    }

    const trimmed = inputValue.trim();
    if (!trimmed) {
      setInputValue("");
      setIsEditing(false);
      onChange?.(null);
    } else {
      const normalized = ensureUrlProtocol(trimmed);
      setInputValue(normalized);
      setIsEditing(false);
      onChange?.(normalized);
    }
  };

  const handleCancel = () => {
    isCancelingRef.current = true;
    setInputValue(value || "");
    setIsEditing(false);
  };

  const handleStartEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isCancelingRef.current = false;
    isCommittedRef.current = false;
    setInputValue(value || "");
    setIsEditing(true);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isCancelingRef.current = false;
    isCommittedRef.current = false;
    setInputValue("");
    setIsEditing(false);
    onChange?.(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.stopPropagation();
      e.preventDefault();
      handleCommit();
      isCommittedRef.current = true;
    } else if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      handleCancel();
    }
  };

  if (hasValue && !isEditing) {
    const normalizedHref = ensureUrlProtocol(value!);

    return (
      <div
        className={`min-h-[36px] h-9 flex items-center justify-between gap-2 px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-md ${className}`.trim()}
      >
        <a
          href={normalizedHref || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-1.5 min-w-0 text-sm text-blue-400 hover:text-blue-300 hover:underline transition-colors ${
            disabled ? "pointer-events-none opacity-60" : ""
          }`}
          aria-label={ariaLabel ? `${ariaLabel}: ${value}` : value || "Social link"}
        >
          <span className="truncate">{value}</span>
          <ExportOutlined className="text-xs shrink-0 text-zinc-400" />
        </a>

        <div className="flex items-center gap-1 shrink-0">
          <Tooltip title="Edit link">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={handleStartEdit}
              aria-label="Edit link"
              disabled={disabled}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800 h-7 w-7 flex items-center justify-center p-0"
            />
          </Tooltip>
          <Tooltip title="Delete link">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={handleDelete}
              aria-label="Delete link"
              disabled={disabled}
              className="text-zinc-400 hover:text-red-400 hover:bg-zinc-800 h-7 w-7 flex items-center justify-center p-0"
            />
          </Tooltip>
        </div>
      </div>
    );
  }

  return (
    <Input
      ref={inputRef}
      value={inputValue}
      onChange={(e) => {
        isCancelingRef.current = false;
        isCommittedRef.current = false;
        setInputValue(e.target.value);
      }}
      onBlur={handleCommit}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      aria-label={ariaLabel || placeholder || "Social link"}
      disabled={disabled}
      className={`bg-zinc-950 border-zinc-800 text-white hover:border-zinc-700 ${className}`.trim()}
    />
  );
}
