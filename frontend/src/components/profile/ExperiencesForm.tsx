"use client";

import React, { useEffect } from "react";
import { Form, Input, Button, message, Space, Card, DatePicker, Checkbox } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ExperienceInput } from "@/lib/validation/profile";
import dayjs from "dayjs";

const { TextArea } = Input;
const { RangePicker } = DatePicker;

interface ExperiencesFormProps {
  initialData?: ExperienceInput[];
  onSubmit: (data: ExperienceInput[]) => Promise<void>;
  loading?: boolean;
}

export function ExperiencesForm({
  initialData,
  onSubmit,
  loading,
}: ExperiencesFormProps) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (initialData) {
      // Map string dates to dayjs objects for DatePicker
      const formattedData = initialData.map((exp: any) => ({
        ...exp,
        dates: [
          exp.startDate ? dayjs(exp.startDate) : undefined,
          exp.endDate ? dayjs(exp.endDate) : undefined,
        ],
      }));
      form.setFieldsValue({ experiences: formattedData });
    }
  }, [initialData, form]);

  const onFinish = async (values: any) => {
    try {
      // Map dates back to strings
      const formattedData = (values.experiences || []).map((exp: any) => ({
        ...exp,
        startDate: exp.dates?.[0]?.toISOString() || new Date().toISOString(),
        endDate: exp.dates?.[1]?.toISOString() || undefined,
        bulletPoints: exp.bulletPoints || [],
        aiSuggestions: exp.aiSuggestions || [],
      }));
      await onSubmit(formattedData);
      message.success("Experiences updated successfully!");
    } catch (error) {
      message.error("Failed to update experiences");
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      className="max-w-4xl"
    >
      <Form.List name="experiences">
        {(fields, { add, remove }) => (
          <div className="flex flex-col gap-4">
            {fields.map(({ key, name, ...restField }) => (
              <Card
                key={key}
                size="small"
                title={`Experience ${name + 1}`}
                extra={
                  <Button type="text" danger onClick={() => remove(name)} icon={<DeleteOutlined />}>
                    Remove
                  </Button>
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Form.Item
                    {...restField}
                    name={[name, "company"]}
                    label="Company"
                    rules={[{ required: true, message: "Missing company name" }]}
                  >
                    <Input placeholder="Company Name" />
                  </Form.Item>

                  <Form.Item
                    {...restField}
                    name={[name, "position"]}
                    label="Position"
                    rules={[{ required: true, message: "Missing position" }]}
                  >
                    <Input placeholder="Job Title" />
                  </Form.Item>
                </div>

                <Form.Item
                  {...restField}
                  name={[name, "dates"]}
                  label="Dates"
                  rules={[{ required: true, message: "Missing dates" }]}
                >
                  <RangePicker style={{ width: '100%' }} />
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
                  <TextArea autoSize={{ minRows: 3, maxRows: 6 }} placeholder="Any extra information..." />
                </Form.Item>
              </Card>
            ))}
            <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} size="large">
              Add New Experience
            </Button>
          </div>
        )}
      </Form.List>

      <div className="mt-6">
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} size="large">
            Save Experiences
          </Button>
        </Form.Item>
      </div>
    </Form>
  );
}
