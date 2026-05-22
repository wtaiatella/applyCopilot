"use client";

import React, { useEffect, useState } from "react";
import { Form, Input, Button, App, Space, Card, DatePicker, Select, Tabs } from "antd";
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
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [activeKey, setActiveKey] = useState<string>("0");

  useEffect(() => {
    if (initialData) {
      const formattedData = initialData.map((proj: any) => {
        const isPresent = proj.endDate === 'Present' || proj.current;
        return {
          ...proj,
          dates: [
            proj.startDate ? dayjs(proj.startDate) : undefined,
            isPresent ? dayjs() : (proj.endDate ? dayjs(proj.endDate) : undefined),
          ],
          bulletPoints: proj.bulletPoints || proj.description || [],
        };
      });
      form.setFieldsValue({ projects: formattedData });
    }
  }, [initialData, form]);

  const onFinish = async (values: any) => {
    try {
      const formattedData = (values.projects || []).map((proj: any) => {
        const startDate = proj.dates?.[0]?.toISOString() || new Date().toISOString();
        const endDate = proj.dates?.[1];
        const isCurrent = proj.current || (endDate && dayjs(endDate).isAfter(dayjs().subtract(1, 'day')));
        
        return {
          ...proj,
          startDate,
          endDate: isCurrent ? 'Present' : endDate?.toISOString(),
          current: isCurrent,
          bulletPoints: proj.bulletPoints || [],
          aiSuggestions: proj.aiSuggestions || [],
          technologies: proj.technologies || [],
        };
      });
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
          <div className="rounded-lg">
            <Tabs
              type="editable-card"
              activeKey={activeKey}
              onChange={setActiveKey}
              onEdit={(targetKey, action) => {
                if (action === "add") {
                  add();
                  setActiveKey(`${fields.length}`);
                } else if (action === "remove") {
                  const index = Number(targetKey);
                  remove(index);
                  if (activeKey === targetKey) {
                    setActiveKey(index > 0 ? `${index - 1}` : "0");
                  }
                }
              }}
              items={fields.map(({ key, name, ...restField }) => {
                const projects = form.getFieldValue("projects") || [];
                const projectName = projects[name]?.name || `Project ${name + 1}`;
                
                return {
                  label: projectName,
                  key: `${name}`,
                  closable: true,
                  children: (
                    <div className="pt-4 px-1">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Form.Item
                          {...restField}
                          name={[name, "name"]}
                          label="Project Name"
                          rules={[{ required: true, message: "Missing project name" }]}
                        >
                          <Input 
                            placeholder="ApplyCopilot" 
                            onChange={() => form.setFieldsValue({ _update: Date.now() })}
                          />
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
                            <div className="mb-2 font-medium text-sm text-gray-400">Bullet Points</div>
                            {bpFields.map(({ key: bpKey, ...bpField }) => {
                              return (
                                <div key={bpKey} className="flex items-start gap-2 mb-2 w-full">
                                  <Form.Item
                                    {...bpField}
                                    rules={[{ required: true, message: "Missing content" }]}
                                    className="mb-0 flex-grow"
                                  >
                                    <TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="Describe a project feature or achievement..." />
                                  </Form.Item>
                                  <Button type="text" danger onClick={() => removeBp(bpField.name)} icon={<DeleteOutlined />} className="mt-1" />
                                </div>
                              );
                            })}
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
                    </div>
                  ),
                };
              })}
            />
            {fields.length === 0 && (
              <div className="text-center py-12 bg-[#141414] rounded-lg border-2 border-dashed border-[#303030]">
                <p className="text-gray-500 mb-4">No projects added yet.</p>
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                  Add Your First Project
                </Button>
              </div>
            )}
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
