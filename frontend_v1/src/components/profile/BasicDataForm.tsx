"use client";

import React, { useEffect, useState } from "react";
import { Form, Input, Button, App, Space, Card, Badge, Modal, Tag, Divider, Empty } from "antd";
import { PlusOutlined, DeleteOutlined, CheckOutlined, ThunderboltOutlined } from "@ant-design/icons";
import type { UserBasicDataInput } from "@/lib/validation/user";

interface BasicDataFormProps {
  initialData?: Partial<UserBasicDataInput> & { summaries?: any[] };
  onSubmit: (data: any) => Promise<void>;
  loading?: boolean;
}

export function BasicDataForm({
  initialData,
  onSubmit,
  loading,
}: BasicDataFormProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [summaries, setSummaries] = useState<any[]>([]);
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [refiningSummaryId, setRefiningSummaryId] = useState<string | null>(null);
  const [aiInstructions, setAiInstructions] = useState("");

  useEffect(() => {
    if (initialData) {
      form.setFieldsValue({
        firstName: initialData.firstName,
        lastName: initialData.lastName,
        title: initialData.title,
        phone: initialData.phone,
        location: initialData.location,
        website: initialData.website,
        github: initialData.github,
      });
      if (initialData.summaries) {
        setSummaries(initialData.summaries);
      }
    }
  }, [initialData, form]);

  const onFinish = async (values: any) => {
    try {
      const updatedSummaries = summaries.map(s =>
        s.isActive ? { ...s, title: values.title } : s
      );
      await onSubmit({ ...values, summaries: updatedSummaries });
    } catch (error) {
      // Error is handled in the page.tsx handler
    }
  };

  const handleActivateSummary = (index: number) => {
    const updated = summaries.map((s, idx) => ({
      ...s,
      isActive: idx === index,
    }));
    setSummaries(updated);
    
    // Auto-sync active summary title to the main professional title field
    const activeSummary = updated[index];
    if (activeSummary?.title) {
      form.setFieldsValue({
        title: activeSummary.title,
      });
    }
    message.info(`"${activeSummary.title}" is now set as the active summary.`);
  };

  const handleDeleteSummary = (index: number) => {
    const activeToDelete = summaries[index]?.isActive;
    const updated = summaries.filter((_, idx) => idx !== index);
    
    // If we deleted the active one, mark the first one as active
    if (activeToDelete && updated.length > 0) {
      updated[0].isActive = true;
      if (updated[0].title) {
        form.setFieldsValue({ title: updated[0].title });
      }
    }
    
    setSummaries(updated);
    message.success("Summary version removed.");
  };

  const handleSummaryFieldChange = (index: number, field: string, value: string) => {
    const updated = [...summaries];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    setSummaries(updated);
    
    // If modifying the active summary's title, sync it back to main title
    if (updated[index].isActive && field === "title") {
      form.setFieldsValue({
        title: value,
      });
    }
  };

  const handleGenerateOrRefineSummary = async () => {
    if (!aiInstructions.trim()) {
      message.error("Please enter guidelines for the AI");
      return;
    }

    setModalLoading(true);
    try {
      const isRevision = !!refiningSummaryId;
      let targetId: string | undefined = refiningSummaryId || undefined;

      // If we are refining but it's a local/unsaved summary, send undefined and we'll replace it
      if (targetId?.startsWith('local-')) {
        targetId = undefined;
      }

      const response = await fetch("/api/profile/summaries/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructions: aiInstructions,
          summaryId: targetId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to generate summary");
      }

      const resJson = await response.json();
      const generated = resJson.data; // { title: string, content: string }

      if (isRevision && refiningSummaryId) {
        // Find by id or local index
        const updated = summaries.map((s, idx) => {
          const isTarget = s.id === refiningSummaryId || `local-${idx}` === refiningSummaryId;
          if (isTarget) {
            return {
              ...s,
              title: generated.title,
              content: generated.content,
              isAIGenerated: true,
            };
          }
          return s;
        });
        setSummaries(updated);
        
        // Sync to main form if active
        const refinedSummary = updated.find((s, idx) => s.id === refiningSummaryId || `local-${idx}` === refiningSummaryId);
        if (refinedSummary?.isActive) {
          form.setFieldsValue({ title: refinedSummary.title });
        }
        message.success("Summary refined successfully!");
      } else {
        // Create new summary
        const isActive = summaries.length === 0; // Active if it's the first one
        const newSummary = {
          title: generated.title,
          content: generated.content,
          isAIGenerated: true,
          isActive,
        };
        const updated = [newSummary, ...summaries];
        setSummaries(updated);
        if (isActive) {
          form.setFieldsValue({ title: newSummary.title });
        }
        message.success("New summary generated!");
      }

      setAiModalVisible(false);
      setAiInstructions("");
      setRefiningSummaryId(null);
    } catch (err: any) {
      message.error(err.message || "AI summary generation failed");
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      className="max-w-4xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Form.Item
          name="firstName"
          label="First Name"
          rules={[{ required: true, message: "Please enter your first name" }]}
        >
          <Input placeholder="John" size="large" />
        </Form.Item>

        <Form.Item
          name="lastName"
          label="Last Name"
          rules={[{ required: true, message: "Please enter your last name" }]}
        >
          <Input placeholder="Doe" size="large" />
        </Form.Item>
      </div>

      <Form.Item
        name="title"
        label="Professional Title"
        rules={[{ required: true, message: "Please enter your professional title (e.g. Senior Frontend Developer)" }]}
      >
        <Input 
          placeholder="Senior React Developer" 
          size="large" 
          onChange={(e) => {
            const val = e.target.value;
            setSummaries(prev => prev.map(s => s.isActive ? { ...s, title: val } : s));
          }}
        />
      </Form.Item>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Form.Item
          name="phone"
          label="Phone Number"
        >
          <Input placeholder="+1 234 567 890" size="large" />
        </Form.Item>

        <Form.Item
          name="location"
          label="Location"
        >
          <Input placeholder="City, Country" size="large" />
        </Form.Item>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Form.Item
          name="website"
          label="Portfolio / Website"
          rules={[{ type: 'url', message: 'Must be a valid URL' }]}
        >
          <Input placeholder="https://wtaiatella.com.br" size="large" />
        </Form.Item>

        <Form.Item
          name="github"
          label="GitHub Profile"
          rules={[{ type: 'url', message: 'Must be a valid URL' }]}
        >
          <Input placeholder="https://github.com/wtaiatella" size="large" />
        </Form.Item>
      </div>

      <Divider titlePlacement="left" className="my-6">
        <Space>
          <ThunderboltOutlined style={{ color: '#1677ff' }} />
          <span>Professional Summaries (Version Manager)</span>
        </Space>
      </Divider>

      <div className="mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
          <span className="text-gray-400 text-sm">
            Manage multiple versions of your profile summary. The active version (green badge) is used for job match engines.
          </span>
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => {
              setRefiningSummaryId(null);
              setAiInstructions("");
              setAiModalVisible(true);
            }}
          >
            Generate with AI
          </Button>
        </div>

        {summaries.length === 0 ? (
          <Empty
            description="No professional summaries created yet. Click 'Generate with AI' to build one automatically from your work experience!"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            className="py-6 border border-dashed border-gray-800 rounded-lg"
          />
        ) : (
          <div className="flex flex-col gap-4">
            {summaries.map((summary, index) => (
              <Badge.Ribbon
                key={summary.id || index}
                text={summary.isActive ? "Active" : ""}
                color="green"
                placement="end"
              >
                <Card
                  size="small"
                  className={`relative border transition-all duration-200 ${
                    summary.isActive
                      ? "border-green-500 shadow-md bg-green-950/10"
                      : "border-gray-800 hover:border-gray-700"
                  }`}
                  title={
                    <Input
                      variant="borderless"
                      className="font-semibold p-0 text-white text-base max-w-md focus:bg-gray-800/40 rounded px-1"
                      value={summary.title}
                      placeholder="Summary Headline / Title"
                      onChange={(e) => handleSummaryFieldChange(index, "title", e.target.value)}
                    />
                  }
                  extra={
                    <Space size="middle" className="mr-16">
                      {summary.isAIGenerated && (
                        <Tag color="purple" icon={<ThunderboltOutlined />}>AI Generated</Tag>
                      )}
                      {!summary.isActive && (
                        <Button
                          type="link"
                          size="small"
                          icon={<CheckOutlined />}
                          onClick={() => handleActivateSummary(index)}
                          className="text-green-500 hover:text-green-400"
                        >
                          Activate
                        </Button>
                      )}
                      <Button
                        type="link"
                        size="small"
                        icon={<ThunderboltOutlined />}
                        onClick={() => {
                          setRefiningSummaryId(summary.id || `local-${index}`);
                          setAiInstructions("");
                          setAiModalVisible(true);
                        }}
                        className="text-purple-400 hover:text-purple-300"
                      >
                        Refine
                      </Button>
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteSummary(index)}
                      />
                    </Space>
                  }
                >
                  <Input.TextArea
                    rows={4}
                    variant="borderless"
                    className="p-0 text-gray-300 focus:bg-gray-800/40 rounded p-1 resize-none"
                    value={summary.content}
                    placeholder="Describe your professional achievements..."
                    onChange={(e) => handleSummaryFieldChange(index, "content", e.target.value)}
                  />
                </Card>
              </Badge.Ribbon>
            ))}
          </div>
        )}
      </div>

      <Form.Item className="mt-8">
        <Button type="primary" htmlType="submit" loading={loading} size="large">
          Save Profile Details
        </Button>
      </Form.Item>

      <Modal
        title={
          <Space>
            <ThunderboltOutlined style={{ color: '#722ed1' }} />
            <span>{refiningSummaryId ? "Refine Summary with AI" : "Generate New Summary with AI"}</span>
          </Space>
        }
        open={aiModalVisible}
        onOk={handleGenerateOrRefineSummary}
        onCancel={() => {
          setAiModalVisible(false);
          setRefiningSummaryId(null);
          setAiInstructions("");
        }}
        confirmLoading={modalLoading}
        okText={refiningSummaryId ? "Refine" : "Generate"}
        destroyOnHidden
      >
        <div className="py-4">
          <p className="text-gray-400 text-sm mb-4">
            {refiningSummaryId
              ? "Provide guidelines on how you want the AI to refine this specific summary version (e.g. highlight React experience, change tone to formal, focus on management)."
              : "Provide instructions for generating a new profile summary. The AI will read your entire CV profile (experiences, projects, skills, education) and generate a compelling 3-5 line introduction."}
          </p>
          <Input.TextArea
            rows={4}
            placeholder={
              refiningSummaryId
                ? "Example: Focus more on React/Node.js tech leadership and sound extremely professional."
                : "Example: Create a summary showing my strong experience in remote full-stack development and team mentoring."
            }
            value={aiInstructions}
            onChange={(e) => setAiInstructions(e.target.value)}
          />
        </div>
      </Modal>
    </Form>
  );
}
