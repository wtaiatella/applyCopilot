"use client";

import React, { useEffect } from "react";
import { Form, Input, Button, message, Space, Card, DatePicker } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { EducationInput } from "@/lib/validation/profile";
import dayjs from "dayjs";

const { TextArea } = Input;
const { RangePicker } = DatePicker;

interface EducationFormProps {
  initialData?: EducationInput[];
  onSubmit: (data: EducationInput[]) => Promise<void>;
  loading?: boolean;
}

export function EducationForm({
  initialData,
  onSubmit,
  loading,
}: EducationFormProps) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (initialData) {
      const formattedData = initialData.map((edu: any) => ({
        ...edu,
        dates: [
          edu.startDate ? dayjs(edu.startDate) : undefined,
          edu.endDate ? dayjs(edu.endDate) : undefined,
        ],
      }));
      form.setFieldsValue({ education: formattedData });
    }
  }, [initialData, form]);

  const onFinish = async (values: any) => {
    try {
      const formattedData = (values.education || []).map((edu: any) => ({
        ...edu,
        startDate: edu.dates?.[0]?.toISOString() || new Date().toISOString(),
        endDate: edu.dates?.[1]?.toISOString() || undefined,
        bulletPoints: edu.bulletPoints || [],
        aiSuggestions: edu.aiSuggestions || [],
      }));
      await onSubmit(formattedData);
      message.success("Education updated successfully!");
    } catch (error) {
      message.error("Failed to update education");
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      className="max-w-4xl"
    >
      <Form.List name="education">
        {(fields, { add, remove }) => (
          <div className="flex flex-col gap-4">
            {fields.map(({ key, name, ...restField }) => (
              <Card
                key={key}
                size="small"
                title={`Education ${name + 1}`}
                extra={
                  <Button type="text" danger onClick={() => remove(name)} icon={<DeleteOutlined />}>
                    Remove
                  </Button>
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Form.Item
                    {...restField}
                    name={[name, "institution"]}
                    label="Institution"
                    rules={[{ required: true, message: "Missing institution" }]}
                  >
                    <Input placeholder="University Name" />
                  </Form.Item>

                  <Form.Item
                    {...restField}
                    name={[name, "degree"]}
                    label="Degree"
                    rules={[{ required: true, message: "Missing degree" }]}
                  >
                    <Input placeholder="B.S. Computer Science" />
                  </Form.Item>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Form.Item
                    {...restField}
                    name={[name, "field"]}
                    label="Field of Study"
                    rules={[{ required: true, message: "Missing field" }]}
                  >
                    <Input placeholder="Computer Science" />
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
                  <TextArea autoSize={{ minRows: 3, maxRows: 6 }} placeholder="Extracurriculars, honors..." />
                </Form.Item>
              </Card>
            ))}
            <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} size="large">
              Add New Education
            </Button>
          </div>
        )}
      </Form.List>

      <div className="mt-6">
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} size="large">
            Save Education
          </Button>
        </Form.Item>
      </div>
    </Form>
  );
}
