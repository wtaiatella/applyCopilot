"use client";

import React, { useState } from "react";
import { Modal, Input, Button, Typography, message } from "antd";
import {
  StarOutlined,
  CheckOutlined,
  CloseOutlined,
  ReloadOutlined,
} from "@ant-design/icons";

const { TextArea } = Input;
const { Text } = Typography;

export interface AIBulletModalProps {
  open: boolean;
  /** "generate" = Add with AI (Botão 2); "review" = per-bullet AI Review (Botão 3) */
  mode: "generate" | "review";
  /** The AI-suggested draft text to seed the editable area when the modal opens. */
  initialText?: string;
  /** The bullet's original text, shown read-only above the suggestion in "review" mode. */
  originalText?: string;
  /**
   * Whether the bullet under review is CV-referenced ("tagged"). When `true` in "review" mode,
   * the footer replaces the single "Accept" button with an explicit "Keep Original" / "Replace"
   * choice (US-3) instead of writing immediately.
   */
  isBulletUsed?: boolean;
  onClose: () => void;
  /**
   * Persists the (possibly edited) text. Should throw on failure.
   * `keepOriginal` is only meaningful for a tagged bullet in "review" mode: `true` = archive
   * original + create new (default/unchanged behavior), `false` = replace in place (US-3).
   */
  onAccept: (text: string, keepOriginal?: boolean) => Promise<void>;
  /** Re-runs the AI action with an optional user comment, returning the new suggested text. */
  onRegenerate: (comment: string) => Promise<string>;
}

/**
 * Shared modal for the two single-bullet AI flows: "Add with AI" (generate mode) and
 * per-bullet "AI Review" (review mode). Renders the current AI draft, an optional
 * comment field used to steer a Regenerate call, and Regenerate/Discard/Accept actions.
 */
export default function AIBulletModal({
  open,
  mode,
  initialText,
  originalText,
  isBulletUsed,
  onClose,
  onAccept,
  onRegenerate,
}: AIBulletModalProps) {
  const [generatedText, setGeneratedText] = useState(initialText || "");
  const [comment, setComment] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Reset the draft whenever the modal transitions to open (render-time state
  // adjustment, per https://react.dev/learn/you-might-not-need-an-effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setGeneratedText(initialText || "");
      setComment("");
    }
  }

  const handleRegenerate = async () => {
    setIsLoading(true);
    try {
      const newText = await onRegenerate(comment);
      setGeneratedText(newText);
    } catch (err) {
      message.error(
        err instanceof Error
          ? err.message
          : "Failed to regenerate. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = async (keepOriginal?: boolean) => {
    if (!generatedText.trim()) return;
    setIsLoading(true);
    try {
      if (keepOriginal === undefined) {
        await onAccept(generatedText);
      } else {
        await onAccept(generatedText, keepOriginal);
      }
      onClose();
    } catch (err) {
      message.error(
        err instanceof Error
          ? err.message
          : "Failed to save bullet. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const showKeepOrReplace = mode === "review" && isBulletUsed === true;

  const handleDiscard = () => {
    if (isLoading) return;
    onClose();
  };

  const title =
    mode === "generate" ? "Generate Bullet with AI" : "AI Review Suggestion";

  return (
    <Modal
      open={open}
      title={
        <span className="flex items-center gap-2 text-white font-semibold text-lg">
          <StarOutlined className="text-violet-400" />
          <span>{title}</span>
        </span>
      }
      onCancel={handleDiscard}
      footer={null}
      className="dark-modal"
      width={560}
      styles={{
        mask: { backgroundColor: "rgba(0, 0, 0, 0.75)" },
        body: { backgroundColor: "#18181b", color: "#fff" },
        header: {
          backgroundColor: "#18181b",
          borderBottom: "1px solid #27272a",
          paddingBottom: "12px",
        },
      }}
    >
      <div className="space-y-4 pt-4 text-zinc-300">
        {mode === "review" && originalText !== undefined && (
          <div>
            <Text className="text-xs uppercase tracking-wider text-zinc-500 font-bold block mb-1">
              Before
            </Text>
            <div className="bg-zinc-950/60 border border-zinc-800 rounded p-2 text-sm text-zinc-400">
              {originalText}
            </div>
          </div>
        )}
        <div>
          <Text className="text-xs uppercase tracking-wider text-zinc-500 font-bold block mb-1">
            {mode === "generate" ? "Suggested Bullet" : "After"}
          </Text>
          <TextArea
            value={generatedText}
            onChange={(e) => setGeneratedText(e.target.value)}
            autoSize={{ minRows: 2 }}
            disabled={isLoading}
            className="bg-zinc-950 border-zinc-800 text-white text-sm"
          />
        </div>

        <div>
          <Text className="text-xs uppercase tracking-wider text-zinc-500 font-bold block mb-1">
            Comment (optional)
          </Text>
          <TextArea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            disabled={isLoading}
            placeholder="e.g. Make it more concise, emphasize leadership..."
            className="bg-zinc-950 border-zinc-800 text-white placeholder-zinc-600 text-sm"
          />
        </div>

        <div className="flex justify-between items-center pt-2">
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRegenerate}
            loading={isLoading}
            className="bg-transparent border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
          >
            Regenerate
          </Button>
          <div className="flex gap-2">
            <Button
              icon={<CloseOutlined />}
              onClick={handleDiscard}
              disabled={isLoading}
              className="bg-transparent border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
            >
              Discard
            </Button>
            {showKeepOrReplace ? (
              <>
                <Button
                  icon={<CheckOutlined />}
                  onClick={() => handleAccept(true)}
                  loading={isLoading}
                  disabled={!generatedText.trim()}
                  className="bg-transparent border-emerald-600 text-emerald-400 hover:text-emerald-300 hover:border-emerald-500"
                >
                  Keep Original
                </Button>
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={() => handleAccept(false)}
                  loading={isLoading}
                  disabled={!generatedText.trim()}
                  className="bg-emerald-600 border-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Replace
                </Button>
              </>
            ) : (
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => handleAccept()}
                loading={isLoading}
                disabled={!generatedText.trim()}
                className="bg-emerald-600 border-emerald-600 hover:bg-emerald-500 text-white"
              >
                Accept
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
