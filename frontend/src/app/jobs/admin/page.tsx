"use client";

import React, { useState, useEffect } from "react";
import { 
  App, 
  Breadcrumb, 
  Typography, 
  Card, 
  Table, 
  Button, 
  Tag, 
  Space, 
  Modal, 
  Form, 
  Input, 
  InputNumber, 
  Select, 
  Switch,
  Statistic,
  Row,
  Col,
  Result,
  Flex
} from "antd";
import { 
  SafetyCertificateOutlined, 
  PlusOutlined, 
  ReloadOutlined, 
  EditOutlined, 
  DeleteOutlined,
  PlayCircleOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ThunderboltOutlined
} from "@ant-design/icons";
import { useSession } from "next-auth/react";

const { Title, Paragraph, Text } = Typography;

interface PortalMonitor {
  id: string;
  name: string;
  url: string;
  type: string;
  intervalHours: number;
  lastRun: string | null;
  nextRun: string | null;
  enabled: boolean;
  totalJobsFound: number;
  lastError: string | null;
}

export default function JobAdminPage() {
  const { data: session } = useSession();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [monitors, setMonitors] = useState<PortalMonitor[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [editingId, setEditingId] = useState<string | null>(null);

  const isAdmin = session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  useEffect(() => {
    if (isAdmin) {
      fetchMonitors();
    }
  }, [isAdmin]);

  const fetchMonitors = async () => {
    setLoading(true);
    try {
      // Simulation: In a real app, fetch /api/admin/monitors
      const response = await fetch("/api/admin/monitors");
      const result = await response.json();
      if (result.success) {
        setMonitors(result.data);
      }
    } catch (error) {
      console.error("Failed to fetch monitors:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values: any) => {
    try {
      const method = editingId ? "PUT" : "POST";
      const url = editingId ? `/api/admin/monitors/${editingId}` : "/api/admin/monitors";
      
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        message.success(`Monitor ${editingId ? "updated" : "created"} successfully`);
        setIsModalOpen(false);
        form.resetFields();
        fetchMonitors();
      }
    } catch (error) {
      message.error("Failed to save monitor");
    }
  };

  const handleTriggerNow = async (id: string) => {
    try {
      message.loading("Triggering worker ingestion...");
      await fetch(`/api/admin/monitors/${id}/run`, { method: "POST" });
      message.success("Ingestion started in background");
      fetchMonitors();
    } catch (error) {
      message.error("Failed to trigger monitor");
    }
  };

  if (!isAdmin) {
    return (
      <Result
        status="403"
        title="403"
        subTitle="Sorry, you are not authorized to access this page. This area is reserved for system administrators."
        extra={<Button type="primary" href="/">Back Home</Button>}
        className="py-20"
      />
    );
  }

  const columns = [
    {
      title: "Portal Name",
      dataIndex: "name",
      key: "name",
      render: (text: string, record: PortalMonitor) => (
        <Flex vertical gap={0}>
          <Text strong>{text}</Text>
          <Text type="secondary" className="text-xs">{record.url}</Text>
        </Flex>
      ),
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      render: (type: string) => <Tag color="blue">{type}</Tag>,
    },
    {
      title: "Interval",
      dataIndex: "intervalHours",
      key: "interval",
      render: (hours: number) => `${hours}h`,
    },
    {
      title: "Last Run",
      dataIndex: "lastRun",
      key: "lastRun",
      render: (date: string | null) => date ? new Date(date).toLocaleString() : "Never",
    },
    {
      title: "Status",
      key: "status",
      render: (_: any, record: PortalMonitor) => (
        <Space>
          {record.enabled ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>Active</Tag>
          ) : (
            <Tag color="default">Disabled</Tag>
          )}
          {record.lastError && (
            <Tooltip title={record.lastError}>
              <Tag color="error" icon={<ExclamationCircleOutlined />}>Error</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: "Metrics",
      dataIndex: "totalJobsFound",
      key: "metrics",
      render: (count: number) => <Text strong>{count} jobs</Text>,
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: any, record: PortalMonitor) => (
        <Space>
          <Button 
            type="primary" 
            ghost 
            size="small" 
            icon={<PlayCircleOutlined />} 
            onClick={() => handleTriggerNow(record.id)}
          >
            Run
          </Button>
          <Button 
            icon={<EditOutlined />} 
            size="small" 
            onClick={() => {
              setEditingId(record.id);
              form.setFieldsValue(record);
              setIsModalOpen(true);
            }}
          />
          <Button 
            danger 
            icon={<DeleteOutlined />} 
            size="small" 
          />
        </Space>
      ),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <Breadcrumb
          items={[
            { title: "Dashboard", href: "/" },
            { title: "Job Search", href: "/jobs" },
            { title: "Admin Monitor" },
          ]}
          className="mb-4"
        />
        <Flex justify="space-between" align="end">
          <div>
            <Title level={2}>
              <SafetyCertificateOutlined className="mr-2 text-blue-500" />
              Global Monitor Admin
            </Title>
            <Paragraph className="text-gray-600 dark:text-gray-400 text-lg m-0">
              Manage system-wide job ingestion. Configure portal URLs, scraping intervals, and monitor worker health.
            </Paragraph>
          </div>
          <Button 
            type="primary" 
            size="large" 
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingId(null);
              form.resetFields();
              setIsModalOpen(true);
            }}
          >
            Add New Monitor
          </Button>
        </Flex>
      </div>

      <Row gutter={[16, 16]} className="mb-8">
        <Col span={6}>
          <Card className="bg-blue-500/5 border-blue-200 dark:border-blue-800">
            <Statistic 
              title="Active Monitors" 
              value={monitors.filter(m => m.enabled).length} 
              prefix={<ClockCircleOutlined />} 
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="bg-green-500/5 border-green-200 dark:border-green-800">
            <Statistic 
              title="Total Jobs Bank" 
              value={monitors.reduce((acc, curr) => acc + curr.totalJobsFound, 0)} 
              prefix={<ThunderboltOutlined />} 
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Worker Status" value="Healthy" styles={{ content: { color: '#3f8600' } }} />
          </Card>
        </Col>
        <Col span={6}>
          <Button block className="h-full flex flex-col items-center justify-center gap-2" onClick={fetchMonitors}>
            <ReloadOutlined />
            Refresh Metrics
          </Button>
        </Col>
      </Row>

      <Card className="shadow-sm border-gray-200 dark:border-gray-800">
        <Table 
          columns={columns} 
          dataSource={monitors} 
          loading={loading}
          rowKey="id"
          pagination={false}
        />
      </Card>

      <Modal
        title={editingId ? "Edit Portal Monitor" : "Add New Portal Monitor"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={() => form.submit()}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{ intervalHours: 24, enabled: true, type: 'WEREMOTE' }}
        >
          <Form.Item
            name="name"
            label="Portal Name"
            rules={[{ required: true, message: "Please enter portal name" }]}
          >
            <Input placeholder="e.g. WWR Global" />
          </Form.Item>
          
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item
                name="url"
                label="Base URL"
                rules={[{ required: true, message: "Please enter monitoring URL" }]}
              >
                <Input placeholder="https://weworkremotely.com/remote-jobs" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="type"
                label="Provider Type"
                rules={[{ required: true }]}
              >
                <Select options={[
                  { label: "WWR", value: "WEREMOTE" },
                  { label: "LinkedIn", value: "LINKEDIN" },
                  { label: "Custom", value: "CUSTOM" },
                ]} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="intervalHours"
                label="Check Interval (Hours)"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} max={168} className="w-full" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="enabled"
                label="Enabled"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name={["selectors", "jobItem"]}
            label="Custom Job Item Selector (for CUSTOM type)"
          >
            <Input placeholder=".job-item" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
