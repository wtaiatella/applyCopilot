"use client";

import React from "react";
import { Button, Input } from "antd";
import { PlusOutlined, DeleteOutlined, BulbOutlined } from "@ant-design/icons";

const { TextArea } = Input;

export interface ContextNotesProps {
  notes: string[];
  onChange: (notes: string[]) => void;
  placeholder?: string;
}

/**
 * Displays and manages the free-form AI Context Notes list for a profile entity
 * (experience, project, or education). These notes are NOT shown on the CV —
 * they are used exclusively as AI context when generating bullets or summaries.
 */
export default function ContextNotesList({ notes, onChange, placeholder }: ContextNotesProps) {
  const safeNotes = notes ?? [];

  const handleAdd = () => onChange([...safeNotes, ""]);

  const handleUpdate = (idx: number, value: string) => {
    const updated = [...safeNotes];
    updated[idx] = value;
    onChange(updated);
  };

  const handleDelete = (idx: number) => {
    onChange(safeNotes.filter((_, i) => i !== idx));
  };

  return (
    <div className="rounded-lg border border-zinc-700/60 bg-zinc-950/60 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BulbOutlined className="text-amber-400 text-base" />
          <span className="text-amber-300 font-semibold text-sm">AI Context Notes</span>
          <span className="text-zinc-500 text-xs">— not displayed on the CV</span>
        </div>
        <Button
          size="small"
          type="dashed"
          icon={<PlusOutlined />}
          onClick={handleAdd}
          className="border-amber-700/60 text-amber-400 hover:border-amber-500 hover:text-amber-300"
        >
          Add Note
        </Button>
      </div>

      <p className="text-zinc-500 text-xs leading-relaxed">
        Write freely — stories, context, achievements, challenges, impact. This text feeds the AI
        when generating new bullet points, summaries, or cover letters, giving it richer context
        about this entry.
      </p>

      {/* Notes list */}
      {safeNotes.length === 0 ? (
        <div className="text-center text-zinc-600 py-3 border border-dashed border-zinc-800 rounded text-xs">
          No notes yet. Click &quot;Add Note&quot; to write free-form AI context.
        </div>
      ) : (
        <div className="space-y-2">
          {safeNotes.map((note, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <TextArea
                value={note}
                onChange={(e) => handleUpdate(idx, e.target.value)}
                autoSize={{ minRows: 2 }}
                placeholder={placeholder || "Write context, stories, or achievements freely..."}
                className="bg-zinc-900 border-zinc-700 text-white text-sm flex-1 resize-none"
              />
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleDelete(idx)}
                size="small"
                className="hover:bg-zinc-900 mt-1 shrink-0"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
