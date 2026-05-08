"use client";

import React, { useEffect } from "react";
import { Form, Input, Button, message, Space, Card, DatePicker, Select } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ProjectInput } from "@/lib/validation/profile";
import dayjs from "dayjs";

const { TextArea } = Input;
const { RangePicker } = DatePicker;

interface ProjectsFormProps {
  initialData?: ProjectInput[];
  onSubmit: (data: ProjectInput[]) => Promise<void>;
  loading?: boolean;
}

export function ProjectsForm({
  initialData,
  onSubmit,
  loading,
}: ProjectsFormProps) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (initialData) {
      const formattedData = initialData.map((proj: any) => ({
        ...proj,
        dates: [
          proj.startDate ? dayjs(proj.startDate) : undefined,
          proj.endDate ? dayjs(proj.endDate) : undefined,
        ],
      }));
      form.setFieldsValue({ projects: formattedData });
    }
  }, [initialData, form]);

  const onFinish = async (values: any) => {
    try {
      const formattedData = (values.projects || []).map((proj: any) => ({
        ...proj,
        startDate: proj.dates?.[0]?.toISOString() || new Date().toISOString(),
        endDate: proj.dates?.[1]?.toISOString() || undefined,
        bulletPoints: proj.bulletPoints || [],
        aiSuggestions: proj.aiSuggestions || [],
        technologies: proj.technologies || [],
      }));
      await onSubmit(formattedData);
      message.success("Projects updated successfully!");
    } catch (error) {
      message.error("Failed to update projects");
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      className="max-w-4xl"
    >
      <Form.List name="projects">
        {(fields, { add, remove }) => (
          <div className="flex flex-col gap-4">
            {fields.map(({ key, name, ...restField }) => (
              <Card
                key={key}
                size="small"
                title={`Project ${name + 1}`}
                extra={
                  <Button type="text" danger onClick={() => remove(name)} icon={<DeleteOutlined />}>
                    Remove
                  </Button>
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Form.Item
                    {...restField}
                    name={[name, "name"]}
                    label="Project Name"
                    rules={[{ required: true, message: "Missing project name" }]}
                  >
                    <Input placeholder="ApplyCopilot" />
                  </Form.Item>

                  <Form.Item
                    {...restField}
                    name={[name, "dates"]}
                    label="Dates"
                    rules={[{ required: true, message: "Missing dates" }]}
                  >
                    <RangePicker style={{ width: '100%' }} />
                  </Form.Item>
                </div>

                <Form.Item
                  {...restField}
                  name={[name, "technologies"]}
                  label="Technologies"
                >
                  <Select
                    mode="tags"
                    style={{ width: '100%' }}
                    placeholder="Typescript, React, Node.js"
                  />
                </Form.Item>

                <Form.Item
                  {...restField}
                  name={[name, "description"]}
                  label="Description"
                  rules={[{ required: true, message: "Missing description" }]}
                >
                  <TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="Project description..." />
                </Form.Item>

                <Form.List name={[name, "bulletPoints"]}>
                  {(bpFields, { add: addBp, remove: removeBp }) => (
                    <div className="mb-4">
                      <div className="mb-2 font-medium text-sm text-gray-700">Bullet Points</div>
                      {bpFields.map((bpField) => (
                        <Space key={bpField.key} style={{ display: "flex", marginBottom: 8 }} align="start">
                          <Form.Item
                            {...bpField}
                            rules={[{ required: true, message: "Missing content" }]}
                            className="mb-0"
                          >
                            <TextArea autoSize={{ minRows: 2, maxRows: 6 }} style={{ width: '100%', minWidth: '400px' }} />
                          </Form.Item>
                          <Button type="text" danger onClick={() => removeBp(bpField.name)} icon={<DeleteOutlined />} />
                        </Space>
                      ))}
                      <Button type="dashed" onClick={() => addBp()} block icon={<PlusOutlined />}>
                        Add Bullet Point
                      </Button>
                    </div>
                  )}
                </Form.List>

                <Form.Item
                  {...restField}
                  name={[name, "freeFormContext"]}
                  label="Context / Additional Details"
                >
                  <TextArea autoSize={{ minRows: 3, maxRows: 6 }} placeholder="Role, impact..." />
                </Form.Item>
              </Card>
            ))}
            <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} size="large">
              Add New Project
            </Button>
          </div>
        )}
      </Form.List>

      <div className="mt-6">
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} size="large">
            Save Projects
          </Button>
        </Form.Item>
      </div>
    </Form>
  );
}
