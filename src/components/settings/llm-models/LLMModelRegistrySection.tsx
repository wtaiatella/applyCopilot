"use client";

import React, { useState } from "react";
import {
  Card,
  Table,
  Button,
  Tag,
  Switch,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Typography,
  message,
  Popconfirm,
  Space,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { AIModelDTO, AIProviderDTO } from "@/types/ai-manager";
import { Plus, Edit2, Trash2, RotateCcw } from "lucide-react";

const { Title, Text } = Typography;
const { Option } = Select;

interface LLMModelRegistrySectionProps {
  models: AIModelDTO[];
  providers: AIProviderDTO[];
  loading: boolean;
  onRefresh: () => void;
}

export default function LLMModelRegistrySection({
  models,
  providers,
  loading,
  onRefresh,
}: LLMModelRegistrySectionProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModelDTO | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const handleOpenAddModal = () => {
    setEditingModel(null);
    form.resetFields();
    form.setFieldsValue({
      tier: "FREE",
      rpm: 15,
      rpd: 500,
      tpm: 250000,
      tpd: 1000000,
      safetyMargin: 0.9,
      isEnabled: true,
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (model: AIModelDTO) => {
    setEditingModel(model);
    form.setFieldsValue({
      providerId: model.providerId,
      displayName: model.displayName,
      modelId: model.modelId,
      tier: model.tier,
      rpm: model.rpm,
      rpd: model.rpd,
      tpm: model.tpm,
      tpd: model.tpd,
      safetyMargin: model.safetyMargin,
      isEnabled: model.isEnabled,
    });
    setModalOpen(true);
  };

  const handleToggleEnabled = async (model: AIModelDTO, checked: boolean) => {
    try {
      const res = await fetch(`/api/admin/llm-models/${model.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: checked }),
      });
      if (!res.ok) throw new Error("Failed to update model status");
      message.success(`Model ${checked ? "enabled" : "disabled"}`);
      onRefresh();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const handleResetBlock = async (modelId: string) => {
    try {
      const res = await fetch(`/api/admin/llm-models/${modelId}/reset-block`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to unblock model");
      message.success("Model unblocked successfully");
      onRefresh();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    try {
      const res = await fetch(`/api/admin/llm-models/${modelId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete model");
      message.success("Model deleted from registry");
      onRefresh();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const handleSaveForm = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      if (editingModel) {
        // Update
        const res = await fetch(`/api/admin/llm-models/${editingModel.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Failed to update model");
        }
        message.success("Model updated successfully");
      } else {
        // Create
        const res = await fetch("/api/admin/llm-models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Failed to add model");
        }
        message.success("Model registered successfully");
      }

      setModalOpen(false);
      onRefresh();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<AIModelDTO> = [
    {
      title: "Provider",
      dataIndex: "providerName",
      key: "providerName",
      render: (val) => <Tag color="blue">{val}</Tag>,
    },
    {
      title: "Model Name",
      dataIndex: "displayName",
      key: "displayName",
      render: (val, record) => (
        <div>
          <div className="font-semibold text-white">{val}</div>
          <div className="text-xs text-zinc-500 font-mono">{record.modelId}</div>
        </div>
      ),
    },
    {
      title: "Tier",
      dataIndex: "tier",
      key: "tier",
      render: (val) => (
        <Tag color={val === "FREE" ? "green" : "purple"}>{val}</Tag>
      ),
    },
    {
      title: "RPM",
      dataIndex: "rpm",
      key: "rpm",
      render: (val) => <span className="text-zinc-300 font-mono text-xs">{val}</span>,
    },
    {
      title: "RPD",
      dataIndex: "rpd",
      key: "rpd",
      render: (val) => (
        <span className="text-zinc-300 font-mono text-xs">{val.toLocaleString()}</span>
      ),
    },
    {
      title: "Safety",
      dataIndex: "safetyMargin",
      key: "safetyMargin",
      render: (val) => <span className="text-zinc-400 text-xs">{Math.round(val * 100)}%</span>,
    },
    {
      title: "Status",
      dataIndex: "isBlocked",
      key: "status",
      render: (_, record) => {
        if (record.isBlocked) {
          return <Tag color="error">Blocked</Tag>;
        }
        return record.isEnabled ? (
          <Tag color="success">Active</Tag>
        ) : (
          <Tag color="default">Disabled</Tag>
        );
      },
    },
    {
      title: "Enabled",
      dataIndex: "isEnabled",
      key: "isEnabled",
      render: (val, record) => (
        <Switch
          size="small"
          checked={val}
          onChange={(checked) => handleToggleEnabled(record, checked)}
        />
      ),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <Space size="small">
          {record.isBlocked && (
            <Button
              type="text"
              size="small"
              icon={<RotateCcw className="h-3.5 w-3.5 text-amber-400" />}
              onClick={() => handleResetBlock(record.id)}
              title="Reset Circuit Breaker Block"
            />
          )}
          <Button
            type="text"
            size="small"
            icon={<Edit2 className="h-3.5 w-3.5 text-blue-400" />}
            onClick={() => handleOpenEditModal(record)}
            title="Edit Model"
          />
          <Popconfirm
            title="Delete this model from registry?"
            onConfirm={() => handleDeleteModel(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              type="text"
              danger
              size="small"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              title="Delete Model"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      className="bg-zinc-900 border-zinc-800 rounded-xl"
      styles={{ body: { padding: 24 } }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <Title level={4} style={{ color: "#fff", margin: 0 }}>
            AI Provider & Model Registry
          </Title>
          <Text type="secondary" className="text-sm">
            Manage registered models, rate limits, safety margins, and active rotation status.
          </Text>
        </div>
        <Button
          type="primary"
          icon={<Plus className="h-4 w-4" />}
          onClick={handleOpenAddModal}
          className="bg-blue-600 hover:bg-blue-500 font-medium"
        >
          Add Model
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={models}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        className="overflow-x-auto"
      />

      <Modal
        title={editingModel ? "Edit AI Model" : "Add Model to Registry"}
        open={modalOpen}
        onOk={handleSaveForm}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText="Save Model"
      >
        <Form form={form} layout="vertical" className="pt-2">
          <Form.Item
            name="providerId"
            label="Provider"
            rules={[{ required: true, message: "Select a provider" }]}
          >
            <Select placeholder="Select provider" disabled={Boolean(editingModel)}>
              {providers.map((p) => (
                <Option key={p.id} value={p.id}>
                  {p.name} ({p.sdkType})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="displayName"
            label="Display Name"
            rules={[{ required: true, message: "Enter friendly display name" }]}
          >
            <Input placeholder="e.g. Meta Llama 3.3 70B" />
          </Form.Item>

          <Form.Item
            name="modelId"
            label="API Model ID"
            rules={[{ required: true, message: "Enter API model ID" }]}
          >
            <Input placeholder="e.g. meta-llama/llama-3.3-70b-instruct:free" />
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="rpm"
              label="RPM (Requests / Min)"
              rules={[{ required: true, message: "Required" }]}
            >
              <InputNumber min={1} className="w-full" />
            </Form.Item>

            <Form.Item
              name="rpd"
              label="RPD (Requests / Day)"
              rules={[{ required: true, message: "Required" }]}
            >
              <InputNumber min={1} className="w-full" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="tpm" label="TPM (Tokens / Min)">
              <InputNumber min={1} className="w-full" />
            </Form.Item>

            <Form.Item name="tpd" label="TPD (Tokens / Day)">
              <InputNumber min={1} className="w-full" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="safetyMargin"
              label="Safety Margin (Fraction)"
              rules={[{ required: true, message: "Required" }]}
            >
              <InputNumber min={0.1} max={1.0} step={0.05} className="w-full" />
            </Form.Item>

            <Form.Item name="tier" label="Tier">
              <Select>
                <Option value="FREE">FREE</Option>
                <Option value="LOCAL">LOCAL</Option>
              </Select>
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </Card>
  );
}
