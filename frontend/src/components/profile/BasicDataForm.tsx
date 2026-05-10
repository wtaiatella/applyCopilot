"use client";

import React, { useEffect } from "react";
import { Form, Input, Button, App, Space } from "antd";
import type { UserBasicDataInput } from "@/lib/validation/user";

interface BasicDataFormProps {
  initialData?: Partial<UserBasicDataInput>;
  onSubmit: (data: UserBasicDataInput) => Promise<void>;
  loading?: boolean;
}

export function BasicDataForm({
  initialData,
  onSubmit,
  loading,
}: BasicDataFormProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  useEffect(() => {
    if (initialData) {
      form.setFieldsValue(initialData);
    }
  }, [initialData, form]);

  const onFinish = async (values: any) => {
    try {
      await onSubmit(values);
      message.success("Basic data updated successfully!");
    } catch (error) {
      message.error("Failed to update basic data");
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      className="max-w-2xl"
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

      <Form.Item>
        <Button type="primary" htmlType="submit" loading={loading} size="large">
          Save Changes
        </Button>
      </Form.Item>
    </Form>
  );
}
