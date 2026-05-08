"use client";

import React, { useEffect } from "react";
import { Form, Input, Button, message, Card, Checkbox } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ReferenceInput } from "@/lib/validation/profile";

const { TextArea } = Input;

interface ReferencesFormProps {
  initialData?: ReferenceInput[];
  onSubmit: (data: ReferenceInput[]) => Promise<void>;
  loading?: boolean;
}

export function ReferencesForm({
  initialData,
  onSubmit,
  loading,
}: ReferencesFormProps) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (initialData) {
      form.setFieldsValue({ references: initialData });
    }
  }, [initialData, form]);

  const onFinish = async (values: any) => {
    try {
      await onSubmit(values.references || []);
      message.success("References updated successfully!");
    } catch (error) {
      message.error("Failed to update references");
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      className="max-w-4xl"
    >
      <Form.List name="references">
        {(fields, { add, remove }) => (
          <div className="flex flex-col gap-4">
            {fields.map(({ key, name, ...restField }) => (
              <Card
                key={key}
                size="small"
                title={`Reference ${name + 1}`}
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
                    label="Name"
                    rules={[{ required: true, message: "Missing name" }]}
                  >
                    <Input placeholder="Jane Smith" />
                  </Form.Item>

                  <Form.Item
                    {...restField}
                    name={[name, "relationship"]}
                    label="Relationship"
                    rules={[{ required: true, message: "Missing relationship" }]}
                  >
                    <Input placeholder="Former Manager" />
                  </Form.Item>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Form.Item
                    {...restField}
                    name={[name, "email"]}
                    label="Email"
                    rules={[{ type: 'email', message: "Invalid email" }]}
                  >
                    <Input placeholder="jane@company.com" />
                  </Form.Item>

                  <Form.Item
                    {...restField}
                    name={[name, "phone"]}
                    label="Phone"
                  >
                    <Input placeholder="+1 234 567 890" />
                  </Form.Item>
                </div>

                <Form.Item
                  {...restField}
                  name={[name, "company"]}
                  label="Company"
                >
                  <Input placeholder="Company Name" />
                </Form.Item>

                <Form.Item
                  {...restField}
                  name={[name, "notes"]}
                  label="Notes"
                >
                  <TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="Any additional context..." />
                </Form.Item>

                <Form.Item
                  {...restField}
                  name={[name, "canContact"]}
                  valuePropName="checked"
                >
                  <Checkbox>Okay to contact</Checkbox>
                </Form.Item>
              </Card>
            ))}
            <Button type="dashed" onClick={() => add({ canContact: false })} block icon={<PlusOutlined />} size="large">
              Add New Reference
            </Button>
          </div>
        )}
      </Form.List>

      <div className="mt-6">
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} size="large">
            Save References
          </Button>
        </Form.Item>
      </div>
    </Form>
  );
}
