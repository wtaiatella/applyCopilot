"use client";

import React, { useState } from "react";
import { Card, Table, Segmented, Typography, message, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { AIRoutePreferenceDTO, AITier } from "@/types/ai-manager";
import { Layers, Bot } from "lucide-react";

const { Title, Text } = Typography;

interface LLMRoutePreferencesSectionProps {
  routes: AIRoutePreferenceDTO[];
  loading: boolean;
  onRefresh: () => void;
}

export default function LLMRoutePreferencesSection({
  routes,
  loading,
  onRefresh,
}: LLMRoutePreferencesSectionProps) {
  const [updatingRouteId, setUpdatingRouteId] = useState<string | null>(null);

  const handleTierChange = async (routeId: string, preferredTier: AITier) => {
    try {
      setUpdatingRouteId(routeId);
      const res = await fetch("/api/admin/llm-routes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routes: [{ routeId, preferredTier }],
        }),
      });

      if (!res.ok) throw new Error("Failed to update route preference");
      message.success(`Updated ${routeId} preference to ${preferredTier}`);
      onRefresh();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setUpdatingRouteId(null);
    }
  };

  const columns: ColumnsType<AIRoutePreferenceDTO> = [
    {
      title: "Category",
      dataIndex: "groupName",
      key: "groupName",
      render: (val) => (
        <span className="font-semibold text-zinc-300 text-xs tracking-wide">
          {val}
        </span>
      ),
    },
    {
      title: "Call Site & Route",
      key: "routeInfo",
      render: (_, record) => (
        <div>
          <div className="font-medium text-white text-sm">
            {record.displayName}
          </div>
          <div className="text-xs text-zinc-500 font-mono">
            {record.routeId}
          </div>
        </div>
      ),
    },
    {
      title: "Execution Type",
      dataIndex: "isWorker",
      key: "isWorker",
      render: (isWorker) =>
        isWorker ? (
          <Tag color="orange">Background Worker (Backoff on exhaustion)</Tag>
        ) : (
          <Tag color="cyan">Synchronous (HTTP 503 on exhaustion)</Tag>
        ),
    },
    {
      title: "Preferred Option (Unselected is Fallback)",
      dataIndex: "preferredTier",
      key: "preferredTier",
      render: (val, record) => (
        <Segmented
          options={[
            {
              label: (
                <div className="flex items-center gap-1 px-1">
                  <Layers className="h-3.5 w-3.5" />
                  <span>Free Tier Pool</span>
                </div>
              ),
              value: "FREE",
            },
            {
              label: (
                <div className="flex items-center gap-1 px-1">
                  <Bot className="h-3.5 w-3.5" />
                  <span>Local Llama</span>
                </div>
              ),
              value: "LOCAL",
            },
          ]}
          value={val}
          disabled={updatingRouteId === record.routeId}
          onChange={(newVal) =>
            handleTierChange(record.routeId, newVal as AITier)
          }
        />
      ),
    },
  ];

  return (
    <Card
      className="bg-zinc-900 border-zinc-800 rounded-xl"
      styles={{ body: { padding: 24 } }}
    >
      <div className="mb-6">
        <Title level={4} style={{ color: "#fff", margin: 0 }}>
          Model Routing Preferences
        </Title>
        <Text type="secondary" className="text-sm">
          For each route, choose whether it should prefer the Free Tier rotation pool or the Local Llama fallback.
        </Text>
      </div>

      <Table
        columns={columns}
        dataSource={routes}
        rowKey="routeId"
        loading={loading}
        pagination={false}
        className="overflow-x-auto"
      />
    </Card>
  );
}
