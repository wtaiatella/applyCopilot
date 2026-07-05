"use client";

import React, { useState, useEffect } from "react";
import { Table, Button, Form, Input, InputNumber, Select, Switch, Tag, Tooltip, Card, Space, Typography, Popconfirm, message } from "antd";
import { ShieldAlert, Trash2, RotateCw, Settings, Plus } from "lucide-react";

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

interface ScraperConfig {
  globalScrapeInterval: number;
  maxConcurrency: number;
  rateLimitDelay: number;
  maxExtractionRetries: number;
  userAgent: string;
}

export default function PortalSettingsList() {
  const [portals, setPortals] = useState<PortalSearchUrl[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [submittingPortal, setSubmittingPortal] = useState(false);
  
  const [portalForm] = Form.useForm();
  const [configForm] = Form.useForm();

  // Load configs and portal search URLs
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

  const handleAddPortal = async (values: any) => {
    setSubmittingPortal(true);
    try {
      const res = await fetch("/api/settings/portals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create portal search URL");
      }
      message.success("Portal search URL registered!");
      portalForm.resetFields();
      loadData();
    } catch (err: any) {
      message.error(err.message || "Failed to add portal URL");
    } finally {
      setSubmittingPortal(false);
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
      message.success(`Portal ${checked ? "enabled" : "disabled"}`);
      loadData();
    } catch (err) {
      message.error("Failed to toggle active state");
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
      message.success("Search URL deleted!");
      loadData();
    } catch (err) {
      message.error("Failed to delete search URL");
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
          ? "Re-check complete: Crawling is discouraged by robots.txt (warning displayed)"
          : "Re-check complete: Crawling is allowed!",
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
      message.success("Global scraper configuration updated!");
      loadData();
    } catch (err) {
      message.error("Failed to update global configurations");
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
      title: "Portal Strategy",
      dataIndex: "portalId",
      key: "portalId",
      render: (text: string) => <Tag color="blue">{text.toUpperCase()}</Tag>,
    },
    {
      title: "Search URL",
      dataIndex: "url",
      key: "url",
      render: (text: string) => (
        <Link href={text} target="_blank" ellipsis style={{ maxWidth: 250 }}>
          {text}
        </Link>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string) => {
        let color = "green";
        if (status === "BROKEN") color = "red";
        if (status === "DISABLED") color = "orange";
        return <Tag color={color}>{status}</Tag>;
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
            title="Are you sure you want to delete this configuration?"
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

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {/* Global Configuration Card */}
      <Card title="Global Scraper Parameters" extra={<Settings size={18} />}>
        <Form
          form={configForm}
          layout="vertical"
          onFinish={handleSaveConfig}
          disabled={loadingConfig}
        >
          <Space size="large" style={{ display: "flex", flexWrap: "wrap", width: "100%", marginBottom: 0 }}>
            <Form.Item
              label="Scraping Cycle Interval (Minutes)"
              name="globalScrapeInterval"
              rules={[{ required: true, message: "Required" }]}
              style={{ marginBottom: 16 }}
            >
              <InputNumber min={5} max={1440} placeholder="360" />
            </Form.Item>

            <Form.Item
              label="Rate Limit Delay (ms)"
              name="rateLimitDelay"
              rules={[{ required: true, message: "Required" }]}
              style={{ marginBottom: 16 }}
            >
              <InputNumber min={100} max={10000} placeholder="1000" />
            </Form.Item>

            <Form.Item
              label="Max Concurrency"
              name="maxConcurrency"
              rules={[{ required: true, message: "Required" }]}
              style={{ marginBottom: 16 }}
            >
              <InputNumber min={1} max={10} placeholder="3" />
            </Form.Item>

            <Form.Item
              label="Max Extraction Retries"
              name="maxExtractionRetries"
              rules={[{ required: true, message: "Required" }]}
              style={{ marginBottom: 16 }}
            >
              <InputNumber min={1} max={5} placeholder="3" />
            </Form.Item>
          </Space>

          <Form.Item
            label="User-Agent String"
            name="userAgent"
            rules={[{ required: true, message: "Required" }]}
            style={{ maxWidth: 600, marginBottom: 16 }}
          >
            <Input placeholder="ApplyCopilot/1.0" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loadingConfig}>
              Save Scraper Configurations
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* Add New Portal Card */}
      <Card title="Register Portal Search Target">
        <Form
          form={portalForm}
          layout="vertical"
          onFinish={handleAddPortal}
          style={{ maxWidth: 800 }}
        >
          <Space size="large" style={{ display: "flex", flexWrap: "wrap", width: "100%", marginBottom: 16 }}>
            <Form.Item
              label="Configuration Name"
              name="name"
              rules={[{ required: true, message: "Please input a configuration name!" }]}
              style={{ minWidth: 250, marginBottom: 0 }}
            >
              <Input placeholder="e.g. Workable React Jobs" />
            </Form.Item>

            <Form.Item
              label="Portal Strategy"
              name="portalId"
              rules={[{ required: true, message: "Select strategy!" }]}
              style={{ minWidth: 180, marginBottom: 0 }}
            >
              <Select>
                <Select.Option value="example">Example Strategy</Select.Option>
                <Select.Option value="workable">Workable Strategy</Select.Option>
                <Select.Option value="linkedin">LinkedIn Strategy</Select.Option>
              </Select>
            </Form.Item>
          </Space>

          <Form.Item
            label="Scraping Search URL"
            name="url"
            rules={[{ required: true, message: "Please input the target search URL!" }]}
          >
            <Input placeholder="https://jobs.workable.com/api/v1/jobs?query=react" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={submittingPortal}
              icon={<Plus size={16} />}
            >
              Register URL Target
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* Registered Targets List */}
      <Card title="Registered Search Targets">
        <Table
          dataSource={portals}
          columns={columns}
          rowKey="id"
          loading={loadingList}
          pagination={false}
        />
      </Card>
    </Space>
  );
}
