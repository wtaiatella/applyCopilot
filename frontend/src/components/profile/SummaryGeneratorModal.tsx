"use client";

import React, { useState } from "react";
import { Modal, Form, Input, Select, Button, Typography, Alert, Spin } from "antd";
import { SparklesOutlined, CheckOutlined, CloseOutlined } from "@ant-design/icons";

const { TextArea } = Input;
const { Option } = Select;
const { Paragraph, Text } = Typography;

interface SummaryGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (summary: { title: string; content: string }) => void;
}

export default function SummaryGeneratorModal({
  open,
  onClose,
  onSuccess,
}: SummaryGeneratorModalProps) {
  const [instructions, setInstructions] = useState("");
  const [tone, setTone] = useState("Professional");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null);

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setError(null);
      setPreview(null);

      const res = await fetch("/api/profile/summaries/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions, tone }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Request failed with status ${res.status}`);
      }

      const data = await res.json();
      setPreview(data);
    } catch (err) {
      console.error("AI Generation failed:", err);
      setError(err instanceof Error ? err.message : "Failed to generate summary.");
    } finally {
      setGenerating(false);
    }
  };

  const handleUseSummary = () => {
    if (preview) {
      onSuccess(preview);
      setInstructions("");
      setPreview(null);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      title={
        <span className="flex items-center gap-2 text-white font-semibold text-lg">
          <SparklesOutlined className="text-yellow-400" />
          <span>Generate Profile Summary with AI</span>
        </span>
      }
      onCancel={() => {
        if (!generating) onClose();
      }}
      footer={null}
      className="dark-modal"
      width={600}
      styles={{
        mask: {
          backgroundColor: "rgba(0, 0, 0, 0.75)",
        },
        body: {
          backgroundColor: "#18181b",
          color: "#fff",
        },
        header: {
          backgroundColor: "#18181b",
          borderBottom: "1px solid #27272a",
          paddingBottom: "12px",
        },
      }}
    >
      <div className="space-y-4 pt-4 text-zinc-300">
        {!preview ? (
          <Form layout="vertical" onFinish={handleGenerate}>
            <Form.Item
              label={<span className="text-zinc-300 font-medium">Instructions (Optional)</span>}
              help="e.g. Focus on my experience with Next.js, Docker, and team leadership. Highlight my years at Google."
            >
              <TextArea
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="What details or skills should the AI emphasize in your summary?"
                className="bg-zinc-950 border-zinc-800 text-white placeholder-zinc-600 hover:border-zinc-700 focus:border-blue-500"
              />
            </Form.Item>

            <Form.Item
              label={<span className="text-zinc-300 font-medium">Target Tone</span>}
              required
            >
              <Select
                value={tone}
                onChange={(value) => setTone(value)}
                className="bg-zinc-950 border-zinc-800 text-white"
                popupClassName="bg-zinc-900 border-zinc-800"
              >
                <Option value="Professional">Professional & Balanced</Option>
                <Option value="Technical">Technical & Skill-focused</Option>
                <Option value="Creative">Creative & Bold</Option>
                <Option value="Minimalist">Minimalist & Direct</Option>
              </Select>
            </Form.Item>

            {error && (
              <Alert
                message="Generation Error"
                description={error}
                type="error"
                showIcon
                className="bg-rose-950/20 border-rose-900/50 text-rose-300"
              />
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                onClick={onClose}
                className="bg-transparent border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
              >
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={generating}
                icon={<SparklesOutlined />}
                className="bg-blue-600 border-blue-600 hover:bg-blue-500"
              >
                {generating ? "Generating..." : "Generate"}
              </Button>
            </div>
          </Form>
        ) : (
          <div className="space-y-4">
            <div className="bg-zinc-950/80 border border-zinc-800 p-4 rounded-lg space-y-3">
              <div>
                <Text className="text-xs uppercase tracking-wider text-zinc-500 font-bold block">
                  Generated Title
                </Text>
                <Text className="text-white text-base font-semibold block pt-1">
                  {preview.title}
                </Text>
              </div>
              <hr className="border-zinc-900" />
              <div>
                <Text className="text-xs uppercase tracking-wider text-zinc-500 font-bold block">
                  Generated Content
                </Text>
                <Paragraph className="text-zinc-300 text-sm block pt-1 leading-relaxed !mb-0">
                  {preview.content}
                </Paragraph>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button
                icon={<CloseOutlined />}
                onClick={() => setPreview(null)}
                className="bg-transparent border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
              >
                Discard & Redo
              </Button>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={handleUseSummary}
                className="bg-emerald-600 border-emerald-600 hover:bg-emerald-500 text-white"
              >
                Use this Summary
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
