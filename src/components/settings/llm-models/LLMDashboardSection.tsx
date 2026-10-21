"use client";

import React from "react";
import { Card, Progress, Tag, Typography, Row, Col } from "antd";
import { AIDashboardResponseDTO } from "@/types/ai-manager";
import { Zap, ShieldAlert, AlertTriangle, RefreshCw } from "lucide-react";

const { Title, Text } = Typography;

interface LLMDashboardSectionProps {
  data: AIDashboardResponseDTO | null;
  loading: boolean;
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

export default function LLMDashboardSection({
  data,
  loading,
}: LLMDashboardSectionProps) {
  const summary = data?.summary || {
    totalCallsToday: 0,
    blockedModelsCount: 0,
    nearQuotaModelsCount: 0,
  };

  const models = data?.models || [];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <Title level={4} style={{ color: "#fff", margin: 0 }}>
              Usage & Quota Dashboard
            </Title>
            <Text type="secondary" className="text-sm">
              Live consumption against effective rate limits (with safety margin and wall-clock lazy resets).
            </Text>
          </div>
        </div>
      </div>

      {/* Aggregate Metric Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card
            className="bg-zinc-900 border-zinc-800 rounded-xl"
            styles={{ body: { padding: 20 } }}
          >
            <div className="flex items-center justify-between">
              <div>
                <Text type="secondary" className="text-xs uppercase font-semibold tracking-wider">
                  Total Calls Today
                </Text>
                <div className="text-2xl font-bold text-white mt-1">
                  {summary.totalCallsToday}
                </div>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                <Zap className="h-5 w-5" />
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card
            className="bg-zinc-900 border-zinc-800 rounded-xl"
            styles={{ body: { padding: 20 } }}
          >
            <div className="flex items-center justify-between">
              <div>
                <Text type="secondary" className="text-xs uppercase font-semibold tracking-wider">
                  Blocked Models
                </Text>
                <div className={`text-2xl font-bold mt-1 ${summary.blockedModelsCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {summary.blockedModelsCount}
                </div>
              </div>
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${summary.blockedModelsCount > 0 ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                <ShieldAlert className="h-5 w-5" />
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card
            className="bg-zinc-900 border-zinc-800 rounded-xl"
            styles={{ body: { padding: 20 } }}
          >
            <div className="flex items-center justify-between">
              <div>
                <Text type="secondary" className="text-xs uppercase font-semibold tracking-wider">
                  Near Quota (&gt;80%)
                </Text>
                <div className={`text-2xl font-bold mt-1 ${summary.nearQuotaModelsCount > 0 ? "text-amber-400" : "text-zinc-300"}`}>
                  {summary.nearQuotaModelsCount}
                </div>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Model Quota Gauges */}
      <Card
        className="bg-zinc-900 border-zinc-800 rounded-xl"
        styles={{ body: { padding: 24 } }}
        loading={loading}
      >
        <Title level={5} style={{ color: "#e4e4e7", marginBottom: 16 }}>
          Model Quota Windows
        </Title>

        {models.length === 0 ? (
          <div className="py-8 text-center text-zinc-500">
            No registered models to track. Add models in the registry below.
          </div>
        ) : (
          <div className="space-y-6">
            {models.map((m) => {
              const minPercent = Math.min(100, Math.round((m.usageMin / m.effectiveRpm) * 100));
              const dayPercent = Math.min(100, Math.round((m.usageDay / m.effectiveRpd) * 100));

              return (
                <div
                  key={m.id}
                  className="p-4 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-3"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-sm">
                        {m.displayName}
                      </span>
                      <Tag color="blue" className="text-xs">
                        {m.providerName}
                      </Tag>
                      {m.isBlocked ? (
                        <Tag color="error">Blocked</Tag>
                      ) : !m.isEnabled ? (
                        <Tag color="default">Disabled</Tag>
                      ) : (
                        <Tag color="success">Active</Tag>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-zinc-400">
                      <span>Minute reset: <strong className="text-zinc-200">{formatSeconds(m.resetsMinInSeconds)}</strong></span>
                      <span>Daily reset: <strong className="text-zinc-200">{formatSeconds(m.resetsDayInSeconds)}</strong></span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    {/* RPM bar */}
                    <div>
                      <div className="flex justify-between text-xs text-zinc-400 mb-1">
                        <span>Minute Window (RPM)</span>
                        <span>{m.usageMin} / {m.effectiveRpm} requests ({minPercent}%)</span>
                      </div>
                      <Progress
                        percent={minPercent}
                        status={minPercent >= 90 ? "exception" : minPercent >= 75 ? "normal" : "success"}
                        strokeColor={minPercent >= 90 ? "#ef4444" : minPercent >= 75 ? "#f59e0b" : "#3b82f6"}
                        showInfo={false}
                        size="small"
                      />
                    </div>

                    {/* RPD bar */}
                    <div>
                      <div className="flex justify-between text-xs text-zinc-400 mb-1">
                        <span>Day Window (RPD)</span>
                        <span>{m.usageDay} / {m.effectiveRpd} requests ({dayPercent}%)</span>
                      </div>
                      <Progress
                        percent={dayPercent}
                        status={dayPercent >= 90 ? "exception" : dayPercent >= 75 ? "normal" : "success"}
                        strokeColor={dayPercent >= 90 ? "#ef4444" : dayPercent >= 75 ? "#f59e0b" : "#10b981"}
                        showInfo={false}
                        size="small"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
