"use client";

import React, { useState } from "react";
import { Drawer, Button, Input, Tag, Typography, Empty } from "antd";
import {
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  WarningOutlined,
  SwapOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import type { BulletSuggestion } from "../../services/profileBulletAIService";

const { TextArea } = Input;
const { Text } = Typography;

export interface ReviewAllDrawerProps {
  open: boolean;
  onClose: () => void;
  suggestions: BulletSuggestion[];
  /** Persists the (possibly edited) suggestion. Should throw on failure — the card stays put. */
  onAccept: (
    suggestion: BulletSuggestion,
    editedText?: string,
  ) => Promise<void>;
  onSkip: (suggestion: BulletSuggestion) => void;
  onAcceptAll: () => Promise<void>;
}

function suggestedTextOf(s: BulletSuggestion): string {
  if (s.type === "REWRITE") return s.revisedText;
  if (s.type === "MERGE") return s.combinedText;
  return s.text;
}

/**
 * Sequential review drawer for the "Review All" (Botão 1) flow. Shows one suggestion
 * card at a time, styled by type (REWRITE/MERGE/NEW), with per-card Accept/Skip/Edit&Accept
 * plus a footer for bulk Accept All / Skip All / Close.
 */
export default function ReviewAllDrawer({
  open,
  onClose,
  suggestions,
  onAccept,
  onSkip,
  onAcceptAll,
}: ReviewAllDrawerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  // Reset to the first card whenever the drawer transitions to open, or a fresh
  // suggestions batch arrives while open (render-time state adjustment, per
  // https://react.dev/learn/you-might-not-need-an-effect).
  const [prevResetKey, setPrevResetKey] = useState<
    [boolean, BulletSuggestion[]]
  >([open, suggestions]);
  if (open !== prevResetKey[0] || suggestions !== prevResetKey[1]) {
    setPrevResetKey([open, suggestions]);
    if (open) {
      setCurrentIndex(0);
      setIsEditing(false);
      setEditedText("");
    }
  }

  const current = suggestions[currentIndex];
  const remaining = Math.max(suggestions.length - currentIndex, 0);

  const advance = () => {
    setIsEditing(false);
    setEditedText("");
    setCurrentIndex((i) => i + 1);
  };

  const handleAccept = async (
    suggestion: BulletSuggestion,
    useEdited: boolean,
  ) => {
    setIsBusy(true);
    try {
      await onAccept(suggestion, useEdited ? editedText : undefined);
      advance();
    } finally {
      setIsBusy(false);
    }
  };

  const handleSkip = (suggestion: BulletSuggestion) => {
    onSkip(suggestion);
    advance();
  };

  const handleEditAndAccept = (suggestion: BulletSuggestion) => {
    if (!isEditing) {
      setEditedText(suggestedTextOf(suggestion));
      setIsEditing(true);
      return;
    }
    void handleAccept(suggestion, true);
  };

  const handleAcceptAll = async () => {
    setIsBusy(true);
    try {
      await onAcceptAll();
      setCurrentIndex(suggestions.length);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSkipAll = () => {
    suggestions.slice(currentIndex).forEach((s) => onSkip(s));
    setCurrentIndex(suggestions.length);
  };

  const renderActions = (
    suggestion: BulletSuggestion,
    acceptLabel: string,
    skipLabel: string,
  ) => (
    <div className="flex justify-end gap-2 pt-1">
      <Button
        icon={<CloseOutlined />}
        onClick={() => handleSkip(suggestion)}
        disabled={isBusy}
        className="bg-transparent border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
      >
        {skipLabel}
      </Button>
      <Button
        icon={<EditOutlined />}
        onClick={() => handleEditAndAccept(suggestion)}
        disabled={isBusy}
        className="bg-transparent border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
      >
        {isEditing ? "Save & Accept" : "Edit & Accept"}
      </Button>
      <Button
        type="primary"
        icon={<CheckOutlined />}
        onClick={() => handleAccept(suggestion, false)}
        loading={isBusy}
        disabled={isEditing}
        className="bg-emerald-600 border-emerald-600 hover:bg-emerald-500 text-white"
      >
        {acceptLabel}
      </Button>
    </div>
  );

  const renderCard = () => {
    if (!current) {
      return (
        <Empty
          description={
            <span className="text-zinc-400">All suggestions reviewed.</span>
          }
          className="py-12"
        />
      );
    }

    if (current.type === "REWRITE") {
      return (
        <div className="border border-blue-800/50 bg-blue-950/10 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <SwapOutlined className="text-blue-400" />
            <Text className="text-blue-300 font-semibold text-sm">
              Rewrite Suggestion
            </Text>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Text className="text-xs uppercase tracking-wider text-zinc-500 font-bold block mb-1">
                Before
              </Text>
              <div className="bg-zinc-950/60 border border-zinc-800 rounded p-2 text-sm text-zinc-400">
                {current.originalText}
              </div>
            </div>
            <div>
              <Text className="text-xs uppercase tracking-wider text-zinc-500 font-bold block mb-1">
                After
              </Text>
              {isEditing ? (
                <TextArea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  autoSize={{ minRows: 2 }}
                  className="bg-zinc-950 border-blue-800 text-white text-sm"
                />
              ) : (
                <div className="bg-zinc-950/60 border border-blue-800/40 rounded p-2 text-sm text-white">
                  {current.revisedText}
                </div>
              )}
            </div>
          </div>
          {renderActions(current, "Accept", "Skip")}
        </div>
      );
    }

    if (current.type === "MERGE") {
      return (
        <div className="border border-amber-800/50 bg-amber-950/10 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <WarningOutlined className="text-amber-400" />
            <Text className="text-amber-300 font-semibold text-sm">
              Merge Suggestion
            </Text>
            <Tag className="bg-amber-900/40 border-amber-700 text-amber-300 ml-auto">
              {current.bulletIds.length} bullets
            </Tag>
          </div>
          <div>
            <Text className="text-xs uppercase tracking-wider text-zinc-500 font-bold block mb-1">
              Before
            </Text>
            <ul className="space-y-1 list-none m-0 p-0">
              {current.originalTexts.map((t, i) => (
                <li
                  key={i}
                  className="bg-zinc-950/60 border border-zinc-800 rounded p-2 text-sm text-zinc-400"
                >
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <Text className="text-xs uppercase tracking-wider text-zinc-500 font-bold block mb-1">
              After (Combined)
            </Text>
            {isEditing ? (
              <TextArea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                autoSize={{ minRows: 2 }}
                className="bg-zinc-950 border-amber-800 text-white text-sm"
              />
            ) : (
              <div className="bg-zinc-950/60 border border-amber-800/40 rounded p-2 text-sm text-white">
                {current.combinedText}
              </div>
            )}
          </div>
          {renderActions(current, "Accept Merge", "Keep Separate")}
        </div>
      );
    }

    // NEW
    return (
      <div className="border border-emerald-800/50 bg-emerald-950/10 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <PlusOutlined className="text-emerald-400" />
          <Text className="text-emerald-300 font-semibold text-sm">
            New Bullet Suggestion
          </Text>
        </div>
        {isEditing ? (
          <TextArea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            autoSize={{ minRows: 2 }}
            className="bg-zinc-950 border-emerald-800 text-white text-sm"
          />
        ) : (
          <div className="bg-zinc-950/60 border border-emerald-800/40 rounded p-2 text-sm text-white">
            {current.text}
          </div>
        )}
        {renderActions(current, "Add", "Discard")}
      </div>
    );
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="right"
      width={640}
      title={
        <span className="text-white font-semibold">
          Review All Suggestions
          {suggestions.length > 0
            ? ` (${Math.min(currentIndex + 1, suggestions.length)}/${suggestions.length})`
            : ""}
        </span>
      }
      className="dark-drawer"
      styles={{
        header: {
          backgroundColor: "#18181b",
          borderBottom: "1px solid #27272a",
        },
        body: { backgroundColor: "#18181b", color: "#fff" },
        footer: {
          backgroundColor: "#18181b",
          borderTop: "1px solid #27272a",
        },
      }}
      footer={
        <div className="flex justify-between">
          <Button
            onClick={onClose}
            className="bg-transparent border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
          >
            Close
          </Button>
          <div className="flex gap-2">
            <Button
              onClick={handleSkipAll}
              disabled={isBusy || remaining <= 0}
              className="bg-transparent border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
            >
              Skip All
            </Button>
            <Button
              type="primary"
              onClick={handleAcceptAll}
              loading={isBusy}
              disabled={remaining <= 0}
              className="bg-blue-600 border-blue-600 hover:bg-blue-500"
            >
              Accept All
            </Button>
          </div>
        </div>
      }
    >
      {renderCard()}
    </Drawer>
  );
}
