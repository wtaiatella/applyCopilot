"use client";

import React, { useState, useEffect } from "react";
import { Form, Input, Select, Button, Radio, Card, Progress, Alert, Space, Typography, message } from "antd";
import { Play, Activity, AlertTriangle } from "lucide-react";

const { Paragraph, Text } = Typography;

interface StreamData {
  status: string;
  progress: number;
  resultsCount: number;
  errorMessage: string | null;
  error?: string;
}

export default function ManualScrapeTrigger() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"sync" | "async">("sync");
  const [result, setResult] = useState<any>(null);
  
  // SSE states
  const [sseTask, setSseTask] = useState<StreamData | null>(null);
  const [sseLogs, setSseLogs] = useState<string[]>([]);

  useEffect(() => {
    // Cleanup logic on unmount if any
  }, []);

  const onFinish = async (values: any) => {
    setLoading(true);
    setResult(null);
    setSseTask(null);
    setSseLogs([]);

    const { url, portalId, type } = values;

    if (mode === "sync") {
      try {
        const res = await fetch("/api/scrape/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, portalId, type }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Testing failed");
        }
        setResult(data);
        message.success("Synchronous strategy test complete!");
      } catch (err: any) {
        message.error(err.message || "Failed to test strategy");
        setResult({ error: err.message || String(err) });
      } finally {
        setLoading(false);
      }
    } else {
      // Async (SSE) Mode
      try {
        const res = await fetch("/api/scrape/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, portalId, type }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to trigger manual background task");
        }

        const taskId = data.taskId;
        setSseLogs((prev) => [...prev, `[SSE] Created background task: ${taskId}`]);
        message.info("Background task queued. Connecting stream...");

        // Connect Server-Sent Events
        const eventSource = new EventSource(`/api/scrape/stream?taskId=${taskId}`);

        eventSource.onmessage = (event) => {
          const taskData: StreamData = JSON.parse(event.data);
          setSseTask(taskData);

          if (taskData.error) {
            setSseLogs((prev) => [...prev, `[Error] ${taskData.error}`]);
            eventSource.close();
            setLoading(false);
            message.error("Task failed to process.");
            return;
          }

          setSseLogs((prev) => [
            ...prev,
            `[Update] Status: ${taskData.status} | Progress: ${taskData.progress}%` +
            (taskData.resultsCount ? ` | Results: ${taskData.resultsCount}` : "") +
            (taskData.errorMessage ? ` | Error: ${taskData.errorMessage}` : ""),
          ]);

          if (taskData.status === "COMPLETED") {
            setSseLogs((prev) => [...prev, "[SSE] Connection closed. Task completed successfully!"]);
            eventSource.close();
            setLoading(false);
            message.success("Manual scrape completed!");
          } else if (taskData.status === "FAILED") {
            setSseLogs((prev) => [...prev, `[SSE] Connection closed. Task failed: ${taskData.errorMessage}`]);
            eventSource.close();
            setLoading(false);
            message.error("Manual scrape failed.");
          }
        };

        eventSource.onerror = (err) => {
          console.error("SSE Error:", err);
          setSseLogs((prev) => [...prev, "[SSE Error] Connection interrupted. Client closed."]);
          eventSource.close();
          setLoading(false);
        };
      } catch (err: any) {
        message.error(err.message || "Failed to enqueue task");
        setSseLogs((prev) => [...prev, `[Error] ${err.message || String(err)}`]);
        setLoading(false);
      }
    }
  };

  return (
    <Card title="Scraper Tester & Manual Trigger" style={{ width: "100%" }}>
      <Paragraph>
        Use this playground to test developer-defined strategies against URLs or trigger background scrape tasks manually.
      </Paragraph>

      <Form
        form={form}
        layout="vertical"
        initialValues={{ portalId: "example", type: "LIST" }}
        onFinish={onFinish}
        style={{ maxWidth: 800 }}
      >
        <Form.Item
          label="Target Scrape URL"
          name="url"
          rules={[{ required: true, message: "Please input the target URL!" }]}
        >
          <Input placeholder="https://example.com/jobs..." />
        </Form.Item>

        <Space size="large" style={{ display: "flex", flexWrap: "wrap", marginBottom: 16 }}>
          <Form.Item label="Portal Strategy" name="portalId" style={{ minWidth: 200, marginBottom: 0 }}>
            <Select>
              <Select.Option value="example">Example Strategy</Select.Option>
              <Select.Option value="workable">Workable Strategy</Select.Option>
              <Select.Option value="linkedin">LinkedIn Strategy</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="Extraction Mode" name="type" style={{ marginBottom: 0 }}>
            <Radio.Group>
              <Radio.Button value="LIST">Step 1: List Extraction</Radio.Button>
              <Radio.Button value="DEEP">Step 2: Deep Description</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item label="Execution Flow" style={{ marginBottom: 0 }}>
            <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
              <Radio.Button value="sync">Synchronous Test</Radio.Button>
              <Radio.Button value="async">Queue Task (SSE Stream)</Radio.Button>
            </Radio.Group>
          </Form.Item>
        </Space>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            icon={mode === "sync" ? <Play size={16} /> : <Activity size={16} />}
          >
            {mode === "sync" ? "Run Sync Test" : "Queue Background Scrape"}
          </Button>
        </Form.Item>
      </Form>

      {/* Progress display for async tasks */}
      {sseTask && (
        <Card size="small" style={{ marginTop: 20, background: "#fafafa" }}>
          <Text strong>Task Progress Indicator</Text>
          <div style={{ margin: "10px 0" }}>
            <Progress
              percent={sseTask.progress}
              status={
                sseTask.status === "FAILED"
                  ? "exception"
                  : sseTask.status === "COMPLETED"
                  ? "success"
                  : "active"
              }
            />
          </div>
          <Space>
            <Text>Status: <strong style={{ textTransform: "uppercase" }}>{sseTask.status}</strong></Text>
            {sseTask.resultsCount > 0 && (
              <Text type="success">| Jobs Processed: <strong>{sseTask.resultsCount}</strong></Text>
            )}
          </Space>
          {sseTask.errorMessage && (
            <Alert
              message="Task Processing Error"
              description={sseTask.errorMessage}
              type="error"
              showIcon
              icon={<AlertTriangle size={16} />}
              style={{ marginTop: 10 }}
            />
          )}
        </Card>
      )}

      {/* SSE logs */}
      {sseLogs.length > 0 && (
        <Card
          size="small"
          title="Server-Sent Events Stream Logs"
          style={{ marginTop: 20, maxHeight: 200, overflowY: "auto", background: "#1e1e1e" }}
        >
          {sseLogs.map((log, index) => (
            <pre key={index} style={{ margin: 0, color: "#a9ffaa", fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
              {log}
            </pre>
          ))}
        </Card>
      )}

      {/* Results output for sync testing */}
      {result && (
        <Card size="small" title="Synchronous Tester Extraction Result" style={{ marginTop: 20 }}>
          <pre
            style={{
              background: "#1e1e1e",
              color: "#f8f8f2",
              padding: 15,
              borderRadius: 6,
              maxHeight: 400,
              overflowY: "auto",
              fontFamily: "monospace",
              fontSize: 12,
              whiteSpace: "pre-wrap",
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        </Card>
      )}
    </Card>
  );
}
