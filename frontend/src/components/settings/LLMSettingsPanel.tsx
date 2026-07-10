"use client";

import { useState } from "react";
import { Form, Select, Button, Collapse, Tag, Tooltip, App } from "antd";
import { AlertCircle } from "lucide-react";
import { LLMProviderConfig, CredentialStatus } from "@/types/admin";

interface LLMSettingsPanelProps {
  config: LLMProviderConfig;
  credentialStatus: CredentialStatus;
  blockedStatus: Record<string, string | null>;
}

export default function LLMSettingsPanel({ config, credentialStatus, blockedStatus }: LLMSettingsPanelProps) {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [currentBlockedStatus, setCurrentBlockedStatus] = useState<Record<string, string | null>>(
    blockedStatus || {}
  );
  const [resetting, setResetting] = useState<Record<string, boolean>>({});
  const [form] = Form.useForm();

  const handleResetBlock = async (capabilityKey: string, dbKey: string) => {
    setResetting((prev) => ({ ...prev, [capabilityKey]: true }));
    try {
      const res = await fetch("/api/admin/llm-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: dbKey }),
      });
      if (!res.ok) throw new Error("Failed to reset provider block");

      setCurrentBlockedStatus((prev) => ({ ...prev, [capabilityKey]: null }));
      message.success("LLM provider block cleared successfully!");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to reset provider block";
      message.error(errMsg);
    } finally {
      setResetting((prev) => ({ ...prev, [capabilityKey]: false }));
    }
  };

  const renderBlockedStatus = (capabilityKey: string, dbKey: string) => {
    const blockedUntil = currentBlockedStatus[capabilityKey];
    if (!blockedUntil) return null;

    const untilDate = new Date(blockedUntil);
    return (
      <div className="mt-1.5 mb-3 flex items-center justify-between bg-red-950/20 border border-red-900/60 p-2.5 rounded-lg text-xs text-red-300">
        <span className="flex items-center gap-1.5 font-medium">
          <AlertCircle size={14} className="text-red-400" />
          Provider is BLOCKED by circuit breaker until {untilDate.toLocaleTimeString()} ({untilDate.toLocaleDateString()})
        </span>
        <Button
          type="primary"
          danger
          size="small"
          loading={resetting[capabilityKey]}
          onClick={() => handleResetBlock(capabilityKey, dbKey)}
          className="text-xs h-7 px-3 bg-red-600 hover:bg-red-500 border-0"
        >
          Reset Block
        </Button>
      </div>
    );
  };

  const saveConfig = async (values: LLMProviderConfig) => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/llm-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error("Failed to save LLM configuration");
      }

      message.success("LLM configuration saved successfully!");
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : "Failed to save configuration";
      message.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const onFinish = async (values: LLMProviderConfig) => {
    const unconfigured: string[] = [];
    if (values.defaultProvider === "gemini" && !credentialStatus.gemini) unconfigured.push("Gemini (Default)");
    if (values.defaultProvider === "claude" && !credentialStatus.claude) unconfigured.push("Claude (Default)");
    if (values.defaultProvider === "ollama" && !credentialStatus.ollama) unconfigured.push("Ollama (Default)");

    if (values.parsingProvider === "gemini" && !credentialStatus.gemini) unconfigured.push("Gemini (Parsing)");
    if (values.parsingProvider === "claude" && !credentialStatus.claude) unconfigured.push("Claude (Parsing)");
    if (values.parsingProvider === "ollama" && !credentialStatus.ollama) unconfigured.push("Ollama (Parsing)");

    if (values.summariesProvider === "gemini" && !credentialStatus.gemini) unconfigured.push("Gemini (Summaries)");
    if (values.summariesProvider === "claude" && !credentialStatus.claude) unconfigured.push("Claude (Summaries)");
    if (values.summariesProvider === "ollama" && !credentialStatus.ollama) unconfigured.push("Ollama (Summaries)");

    if (unconfigured.length > 0) {
      modal.confirm({
        title: "Warning: Missing Credentials",
        content: `You have selected providers that do not have their API keys or endpoints configured in the environment:\n- ${unconfigured.join("\n- ")}\n\nThese providers may not function correctly. Do you want to save anyway?`,
        okText: "Save Anyway",
        cancelText: "Cancel",
        okButtonProps: { danger: true },
        onOk: () => saveConfig(values),
      });
    } else {
      await saveConfig(values);
    }
  };

  const getProviderLabel = (value: string, name: string) => {
    let isConfigured = false;
    let badgeText = "";
    let badgeColor = "";
    let tooltipText = "";

    if (value === "ollama") {
      isConfigured = credentialStatus.ollama;
      badgeText = isConfigured ? "✓ Configured" : "❌ Not configured";
      badgeColor = isConfigured ? "success" : "error";
      tooltipText = "Requires OLLAMA_BASE_URL (default: http://localhost:11434) to be configured and local service running.";
    } else if (value === "gemini") {
      isConfigured = credentialStatus.gemini;
      badgeText = isConfigured ? "✓ Configured" : "⚠️ API key not set";
      badgeColor = isConfigured ? "success" : "warning";
      tooltipText = "Requires GEMINI_API_KEY from Google AI Studio. The current value must not be the default placeholder.";
    } else if (value === "claude") {
      isConfigured = credentialStatus.claude;
      badgeText = isConfigured ? "✓ Configured" : "❌ Not configured";
      badgeColor = isConfigured ? "success" : "error";
      tooltipText = "Requires CLAUDE_API_KEY from Anthropic Console to be added to environment variables.";
    }

    return (
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <span>{name}</span>
        <Tooltip title={tooltipText} mouseEnterDelay={0.1}>
          <Tag color={badgeColor} style={{ marginLeft: 8, marginRight: 0 }} className="cursor-help">
            {badgeText}
          </Tag>
        </Tooltip>
      </span>
    );
  };

  const providerOptions = [
    { value: "ollama", label: getProviderLabel("ollama", "Ollama (Local)") },
    { value: "gemini", label: getProviderLabel("gemini", "Gemini") },
    { value: "claude", label: getProviderLabel("claude", "Claude") },
  ];

  const collapseItems = [
    {
      key: "llm-models",
      label: <span className="text-white font-semibold text-base">LLM Models</span>,
      children: (
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            defaultProvider: config.defaultProvider,
            parsingProvider: config.parsingProvider,
            summariesProvider: config.summariesProvider,
          }}
          onFinish={onFinish}
          requiredMark={false}
          className="pt-2"
        >
          <Form.Item
            name="defaultProvider"
            label={<span className="text-zinc-300">Default Provider</span>}
            tooltip="The fallback provider used for generic AI tasks when a task-specific provider is not specified"
            className="mb-2"
          >
            <Select options={providerOptions} size="large" />
          </Form.Item>
          {renderBlockedStatus("defaultProvider", "AI_PROVIDER_DEFAULT")}

          <Form.Item
            name="parsingProvider"
            label={<span className="text-zinc-300">Parsing Provider</span>}
            tooltip="The provider used for extracting data from uploaded CVs"
            className="mb-2"
          >
            <Select options={providerOptions} size="large" />
          </Form.Item>
          {renderBlockedStatus("parsingProvider", "AI_PROVIDER_PARSING")}

          <Form.Item
            name="summariesProvider"
            label={<span className="text-zinc-300">Summaries Provider</span>}
            tooltip="The provider used for generating summaries"
            className="mb-2"
          >
            <Select options={providerOptions} size="large" />
          </Form.Item>
          {renderBlockedStatus("summariesProvider", "AI_PROVIDER_SUMMARIES")}

          <Form.Item className="mb-0 mt-6">
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              size="large"
              className="w-full sm:w-auto font-semibold px-8"
            >
              Save Configuration
            </Button>
          </Form.Item>
        </Form>
      ),
    },
  ];

  return (
    <div className="max-w-2xl">
      <Collapse
        defaultActiveKey={[]}
        items={collapseItems}
        className="bg-zinc-900 border border-zinc-800"
      />
    </div>
  );
}
