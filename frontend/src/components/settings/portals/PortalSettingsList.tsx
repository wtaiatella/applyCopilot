"use client";

import React, { useState, useEffect } from "react";
import { Form, Input, Select, Button, Radio, Progress, Table, Switch, Tag, InputNumber, Space, Typography, Popconfirm, Collapse, Tooltip } from "antd";
import { message as AntdMessage } from "antd";
import { Play, Plus, Trash2, RotateCw, Settings, Activity, ShieldAlert } from "lucide-react";

const { Text, Link } = Typography;

interface PortalSearchUrl {
  id: string;
  portalId: string;
  url: string;
  name: string;
  isActive: boolean;
  status: "ACTIVE" | "BROKEN" | "DISABLED";
  isRobotsBlocked: boolean;
}

interface StreamData {
  status: string;
  progress: number;
  resultsCount: number;
  errorMessage: string | null;
  error?: string;
}

export default function PortalSettingsList() {
  const [messageApi, contextHolder] = AntdMessage.useMessage();
  const message = messageApi; // Shadow imported static message with context-aware hook instance

  const [portals, setPortals] = useState<PortalSearchUrl[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingTest, setLoadingTest] = useState(false);
  const [addingToWorker, setAddingToWorker] = useState(false);
  const [mode, setMode] = useState<"sync" | "async">("sync");
  const [testResult, setTestResult] = useState<any>(null);

  // SSE states
  const [sseTask, setSseTask] = useState<StreamData | null>(null);
  const [sseLogs, setSseLogs] = useState<string[]>([]);

  const [testerForm] = Form.useForm();
  const [configForm] = Form.useForm();

  // Load database portal configurations and global settings
  const loadData = async () => {
    setLoadingList(true);
    setLoadingConfig(true);
    try {
      const pRes = await fetch("/api/settings/portals");
      if (pRes.ok) {
        const pData = await pRes.json();
        setPortals(pData);
      }

      const cRes = await fetch("/api/settings/config");
      if (cRes.ok) {
        const cData = await cRes.json();
        configForm.setFieldsValue(cData);
      }
    } catch (err) {
      message.error("Failed to load settings data.");
    } finally {
      setLoadingList(false);
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Run Test (synchronous or background queue with SSE)
  const handleRunTest = async () => {
    try {
      const values = await testerForm.validateFields();
      setTestResult(null);
      setSseTask(null);
      setSseLogs([]);

      const { url, portalId, type } = values;
      setLoadingTest(true);

      if (mode === "sync") {
        const res = await fetch("/api/scrape/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, portalId, type }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Synchronous test failed");
        }
        setTestResult(data);
        message.success("Synchronous strategy test complete!");
        setLoadingTest(false);
      } else {
        // Async / SSE Mode
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
        message.info("Background task enqueued. Connecting stream...");

        const eventSource = new EventSource(`/api/scrape/stream?taskId=${taskId}`);

        eventSource.onmessage = (event) => {
          const taskData: StreamData = JSON.parse(event.data);
          setSseTask(taskData);

          if (taskData.error) {
            setSseLogs((prev) => [...prev, `[Error] ${taskData.error}`]);
            eventSource.close();
            setLoadingTest(false);
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
            setLoadingTest(false);
            message.success("Manual scrape completed!");
          } else if (taskData.status === "FAILED") {
            setSseLogs((prev) => [...prev, `[SSE] Connection closed. Task failed: ${taskData.errorMessage}`]);
            eventSource.close();
            setLoadingTest(false);
            message.error("Manual scrape failed.");
          }
        };

        eventSource.onerror = (err) => {
          console.error("SSE Error:", err);
          setSseLogs((prev) => [...prev, "[SSE Error] Connection interrupted. Client closed."]);
          eventSource.close();
          setLoadingTest(false);
        };
      }
    } catch (err: any) {
      message.error(err.message || "Please check required fields.");
      setLoadingTest(false);
    }
  };

  // Add to Worker (saves search URL target configuration to Database)
  const handleAddToWorker = async () => {
    try {
      const values = await testerForm.validateFields();
      const { url, portalId } = values;
      setAddingToWorker(true);

      let host = "Target";
      try {
        host = new URL(url).hostname.replace("www.", "");
      } catch {}
      const derivedName = `${portalId.toUpperCase()} - ${host}`;

      const res = await fetch("/api/settings/portals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, portalId, name: derivedName }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to add target to database");
      }
      message.success("Search target added to worker queue!");
      loadData();
    } catch (err: any) {
      message.error(err.message || "Failed to register target.");
    } finally {
      setAddingToWorker(false);
    }
  };

  const handleToggleActive = async (id: string, checked: boolean) => {
    try {
      const portal = portals.find((p) => p.id === id);
      if (!portal) return;

      const res = await fetch(`/api/settings/portals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...portal,
          isActive: checked,
          status: checked ? "ACTIVE" : "DISABLED",
        }),
      });

      if (!res.ok) {
        throw new Error("Update failed");
      }
      message.success(`Target ${checked ? "activated" : "deactivated"}`);
      loadData();
    } catch (err) {
      message.error("Failed to update active state");
    }
  };

  const handleDeletePortal = async (id: string) => {
    try {
      const res = await fetch(`/api/settings/portals/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Delete failed");
      }
      message.success("Search target removed.");
      loadData();
    } catch (err) {
      message.error("Failed to delete target.");
    }
  };

  const handleRefreshRobots = async (id: string) => {
    message.loading({ content: "Re-checking robots.txt...", key: "robots" });
    try {
      const res = await fetch(`/api/settings/portals/${id}/refresh-robots`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Robots check failed");
      }
      const data = await res.json();
      message.success({
        content: data.isRobotsBlocked
          ? "Re-check complete: crawling is discouraged by robots.txt"
          : "Re-check complete: crawling is allowed!",
        key: "robots",
        duration: 4,
      });
      loadData();
    } catch (err) {
      message.error({ content: "Failed to refresh robots.txt", key: "robots" });
    }
  };

  const handleSaveConfig = async (values: any) => {
    setLoadingConfig(true);
    try {
      const res = await fetch("/api/settings/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        throw new Error("Failed to save global configurations");
      }
      message.success("Global settings saved successfully!");
      loadData();
    } catch (err) {
      message.error("Failed to update configurations");
    } finally {
      setLoadingConfig(false);
    }
  };

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: "URL",
      dataIndex: "url",
      key: "url",
      render: (text: string) => (
        <Link href={text} target="_blank" ellipsis style={{ maxWidth: 300 }}>
          {text}
        </Link>
      ),
    },
    {
      title: "Health",
      dataIndex: "status",
      key: "status",
      render: (status: string, record: PortalSearchUrl) => {
        let color = "green";
        let label = "Healthy";
        
        if (status === "BROKEN") {
          color = "red";
          label = "Broken";
        } else if (status === "DISABLED" || !record.isActive) {
          color = "orange";
          label = "Disabled";
        }
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: "Active",
      key: "isActive",
      render: (_: any, record: PortalSearchUrl) => (
        <Space>
          <Switch
            checked={record.isActive}
            onChange={(checked) => handleToggleActive(record.id, checked)}
          />
          {record.isRobotsBlocked && (
            <Tooltip title="Crawling discouraged by robots.txt. The worker will still attempt, but proceed with caution.">
              <ShieldAlert size={16} className="text-amber-500 cursor-pointer" />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: any, record: PortalSearchUrl) => (
        <Space size="middle">
          <Button
            size="small"
            icon={<RotateCw size={14} />}
            onClick={() => handleRefreshRobots(record.id)}
          >
            Check Robots
          </Button>
          <Popconfirm
            title="Remove this target config?"
            onConfirm={() => handleDeletePortal(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button size="small" danger icon={<Trash2 size={14} />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Define the collapsible items matching Settings General
  const collapseItems = [
    {
      key: "global-config",
      label: (
        <span className="flex items-center gap-2 text-white font-semibold text-base">
          <Settings size={18} />
          Global Worker Configuration
        </span>
      ),
      children: (
        <Form
          form={configForm}
          layout="vertical"
          onFinish={handleSaveConfig}
          disabled={loadingConfig}
          className="pt-2"
        >
          <Form.Item
            label="Worker User-Agent"
            name="userAgent"
            rules={[{ required: true, message: "Required" }]}
            style={{ maxWidth: 600 }}
          >
            <Input placeholder="ApplyCopilot/1.0" />
          </Form.Item>

          <Form.Item
            label="Wellfound Cookie (Bypass Datadome)"
            name="wellfoundCookie"
            style={{ maxWidth: 600 }}
          >
            <Input.TextArea placeholder="notice_preferences=2:; notice_gdpr_prefs=0|1|2:; ... datadome=..." rows={3} />
          </Form.Item>

          <Form.Item
            label="Wellfound User-Agent (Must match browser of Cookie)"
            name="wellfoundUserAgent"
            style={{ maxWidth: 600 }}
          >
            <Input placeholder="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ..." />
          </Form.Item>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Form.Item
              label="Max Retries"
              name="maxExtractionRetries"
              rules={[{ required: true, message: "Required" }]}
            >
              <InputNumber min={1} max={5} style={{ width: "100%" }} />
            </Form.Item>

            <Form.Item
              label="Auto-Scrape Interval (Minutes)"
              name="globalScrapeInterval"
              rules={[{ required: true, message: "Required" }]}
            >
              <InputNumber min={5} max={1440} style={{ width: "100%" }} />
            </Form.Item>

            <Form.Item
              label="Rate Limit Delay (ms)"
              name="rateLimitDelay"
              rules={[{ required: true, message: "Required" }]}
            >
              <InputNumber min={100} max={10000} style={{ width: "100%" }} />
            </Form.Item>

            <Form.Item
              label="Max Concurrency"
              name="maxConcurrency"
              rules={[{ required: true, message: "Required" }]}
            >
              <InputNumber min={1} max={10} style={{ width: "100%" }} />
            </Form.Item>
          </div>

          <Form.Item style={{ marginTop: 16, marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loadingConfig}>
              Save Global Settings
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: "tester",
      label: (
        <span className="flex items-center gap-2 text-white font-semibold text-base">
          <Play size={18} />
          Scraper Tester
        </span>
      ),
      children: (
        <Form
          form={testerForm}
          layout="vertical"
          initialValues={{ portalId: "example", type: "LIST" }}
          className="pt-2"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Form.Item
              label="Portal Strategy"
              name="portalId"
              rules={[{ required: true, message: "Required" }]}
            >
              <Select>
                <Select.Option value="example">example</Select.Option>
                <Select.Option value="workable">workable</Select.Option>
                <Select.Option value="linkedin">linkedin</Select.Option>
                <Select.Option value="wellfound">wellfound</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              label="Logic Type"
              name="type"
              rules={[{ required: true, message: "Required" }]}
            >
              <Select>
                <Select.Option value="LIST">Job List</Select.Option>
                <Select.Option value="DEEP">Job Detail</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              label="Search URL"
              name="url"
              rules={[{ required: true, message: "Required" }]}
            >
              <Input placeholder="https://..." />
            </Form.Item>
          </div>

          <div style={{ marginBottom: 16 }}>
            <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
              <Radio.Button value="sync">Synchronous Test</Radio.Button>
              <Radio.Button value="async">Queue Task (SSE Stream)</Radio.Button>
            </Radio.Group>
          </div>

          <Space>
            <Button
              type="primary"
              onClick={handleRunTest}
              loading={loadingTest}
              icon={<Play size={16} />}
            >
              {mode === "sync" ? "Run Test" : "Trigger Scrape"}
            </Button>
            <Button
              onClick={handleAddToWorker}
              loading={addingToWorker}
              icon={<Plus size={16} />}
            >
              Add to Worker
            </Button>
          </Space>

          {/* SSE log display */}
          {sseTask && (
            <div style={{ marginTop: 20, padding: 15, background: "#111", borderRadius: 8 }} className="border border-zinc-800">
              <Text strong style={{ color: "#fff" }}>Manual Task Progress</Text>
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
                <Text style={{ color: "#aaa" }}>Status: <strong style={{ color: "#fff", textTransform: "uppercase" }}>{sseTask.status}</strong></Text>
                {sseTask.resultsCount > 0 && (
                  <Text type="success">| Processed Count: <strong style={{ color: "#52c41a" }}>{sseTask.resultsCount}</strong></Text>
                )}
              </Space>
            </div>
          )}

          {sseLogs.length > 0 && (
            <div
              style={{ marginTop: 15, maxHeight: 180, overflowY: "auto", background: "#0c0c0e", padding: 10, borderRadius: 8 }}
              className="border border-zinc-800"
            >
              {sseLogs.map((log, index) => (
                <pre key={index} style={{ margin: 0, color: "#4ade80", fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
                  {log}
                </pre>
              ))}
            </div>
          )}

          {/* Sync result code output */}
          {testResult && (
            <div style={{ marginTop: 20, background: "#0c0c0e", padding: 15, borderRadius: 8 }} className="border border-zinc-800">
              <pre
                style={{
                  margin: 0,
                  color: "#f8f8f2",
                  maxHeight: 300,
                  overflowY: "auto",
                  fontFamily: "monospace",
                  fontSize: 11,
                  whiteSpace: "pre-wrap",
                }}
              >
                {JSON.stringify(testResult, null, 2)}
              </pre>
            </div>
          )}
        </Form>
      ),
    },
    {
      key: "portals",
      label: (
        <span className="flex items-center gap-2 text-white font-semibold text-base">
          <Activity size={18} />
          Portal Management
        </span>
      ),
      children: (
        <div className="pt-2">
          <Table
            dataSource={portals}
            columns={columns}
            rowKey="id"
            loading={loadingList}
            pagination={false}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      {contextHolder}
      <Collapse
        defaultActiveKey={["global-config", "tester", "portals"]}
        items={collapseItems}
        className="bg-transparent border-0"
        expandIconPosition="start"
      />
    </>
  );
}
