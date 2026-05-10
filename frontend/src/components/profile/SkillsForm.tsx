"use client";

import React, { useEffect } from "react";
import { Form, Input, Button, App, Space, Select, InputNumber } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { SkillInput } from "@/lib/validation/profile";

interface SkillsFormProps {
  initialData?: SkillInput[];
  onSubmit: (data: SkillInput[]) => Promise<void>;
  loading?: boolean;
}

export function SkillsForm({
  initialData,
  onSubmit,
  loading,
}: SkillsFormProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  useEffect(() => {
    if (initialData) {
      form.setFieldsValue({ skills: initialData });
    }
  }, [initialData, form]);

  const onFinish = async (values: any) => {
    try {
      await onSubmit(values.skills || []);
      message.success("Skills updated successfully!");
    } catch (error) {
      message.error("Failed to update skills");
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      className="max-w-3xl"
    >
      <Form.List name="skills">
        {(fields, { add, remove }) => (
          <>
            <div className="grid grid-cols-12 gap-2 mb-2 font-medium text-gray-700 hidden md:grid">
              <div className="col-span-5">Skill Name</div>
              <div className="col-span-3">Proficiency Level</div>
              <div className="col-span-3">Years of Experience</div>
              <div className="col-span-1"></div>
            </div>
            {fields.map(({ key, name, ...restField }) => (
              <div key={key} className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-4 items-start">
                <div className="col-span-1 md:col-span-5">
                  <Form.Item
                    {...restField}
                    name={[name, "name"]}
                    rules={[{ required: true, message: "Missing skill name" }]}
                    className="mb-0"
                  >
                    <Input placeholder="e.g. React" />
                  </Form.Item>
                </div>
                <div className="col-span-1 md:col-span-3">
                  <Form.Item
                    {...restField}
                    name={[name, "level"]}
                    rules={[{ required: true, message: "Missing level" }]}
                    className="mb-0"
                  >
                    <Select
                      options={[
                        { value: 'BEGINNER', label: 'Beginner' },
                        { value: 'INTERMEDIATE', label: 'Intermediate' },
                        { value: 'ADVANCED', label: 'Advanced' },
                        { value: 'EXPERT', label: 'Expert' },
                      ]}
                      placeholder="Level"
                    />
                  </Form.Item>
                </div>
                <div className="col-span-1 md:col-span-3">
                  <Form.Item
                    {...restField}
                    name={[name, "yearsOfExperience"]}
                    className="mb-0"
                  >
                    <InputNumber min={0} max={50} placeholder="Years" style={{ width: '100%' }} />
                  </Form.Item>
                </div>
                <div className="col-span-1 md:col-span-1 flex justify-end md:justify-center mt-1 md:mt-0">
                  <Button type="text" danger onClick={() => remove(name)} icon={<DeleteOutlined />} />
                </div>
              </div>
            ))}
            <Form.Item>
              <Button type="dashed" onClick={() => add({ level: 'INTERMEDIATE' })} block icon={<PlusOutlined />}>
                Add Skill
              </Button>
            </Form.Item>
          </>
        )}
      </Form.List>

      <div className="mt-6">
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} size="large">
            Save Skills
          </Button>
        </Form.Item>
      </div>
    </Form>
  );
}
