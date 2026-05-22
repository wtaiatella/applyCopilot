"use client";

import React, { useEffect, useState } from "react";
import { Form, Input, Button, App, Space, Card, DatePicker, Checkbox, Tabs } from "antd";
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
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [activeKey, setActiveKey] = useState<string>("0");

  useEffect(() => {
    if (initialData) {
      // Map string dates to dayjs objects for DatePicker
      const formattedData = initialData.map((exp: any) => {
        const isPresent = exp.endDate === 'Present' || exp.current;
        return {
          ...exp,
          dates: [
            exp.startDate ? dayjs(exp.startDate) : undefined,
            isPresent ? dayjs() : (exp.endDate ? dayjs(exp.endDate) : undefined),
          ],
          bulletPoints: exp.bulletPoints || exp.description || [],
        };
      });
      form.setFieldsValue({ experiences: formattedData });
    }
  }, [initialData, form]);

  const onFinish = async (values: any) => {
    try {
      // Map dates back to strings
      const formattedData = (values.experiences || []).map((exp: any) => {
        const startDate = exp.dates?.[0]?.toISOString() || new Date().toISOString();
        const endDate = exp.dates?.[1];
        const isCurrent = exp.current || (endDate && dayjs(endDate).isAfter(dayjs().subtract(1, 'day')));
        
        return {
          ...exp,
          startDate,
          endDate: isCurrent ? 'Present' : endDate?.toISOString(),
          current: isCurrent,
          bulletPoints: exp.bulletPoints || [],
          aiSuggestions: exp.aiSuggestions || [],
        };
      });
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
                const experiences = form.getFieldValue("experiences") || [];
                const companyName = experiences[name]?.company || `Experience ${name + 1}`;
                
                return {
                  label: companyName,
                  key: `${name}`,
                  closable: true,
                  children: (
                    <div className="pt-4 px-1">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Form.Item
                          {...restField}
                          name={[name, "company"]}
                          label="Company"
                          rules={[{ required: true, message: "Missing company name" }]}
                        >
                          <Input 
                            placeholder="Company Name" 
                            onChange={() => form.setFieldsValue({ _update: Date.now() })}
                          />
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
                            <div className="mb-2 font-medium text-sm text-gray-400">Bullet Points</div>
                            {bpFields.map(({ key: bpKey, ...bpField }) => {
                               return (
                                <div key={bpKey} className="flex items-start gap-2 mb-2 w-full">
                                  <Form.Item
                                    {...bpField}
                                    rules={[{ required: true, message: "Missing content" }]}
                                    className="mb-0 flex-grow"
                                  >
                                    <TextArea 
                                      autoSize={{ minRows: 2, maxRows: 6 }} 
                                      placeholder="Describe an achievement or responsibility..."
                                      className="w-full"
                                    />
                                  </Form.Item>
                                  <Button 
                                    type="text" 
                                    danger 
                                    onClick={() => removeBp(bpField.name)} 
                                    icon={<DeleteOutlined />} 
                                    className="mt-1"
                                  />
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
                        <TextArea autoSize={{ minRows: 3, maxRows: 6 }} placeholder="Any extra information..." />
                      </Form.Item>
                    </div>
                  ),
                };
              })}
            />
            {fields.length === 0 && (
              <div className="text-center py-12 bg-[#141414] rounded-lg border-2 border-dashed border-[#303030]">
                <p className="text-gray-500 mb-4">No experiences added yet.</p>
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                  Add Your First Experience
                </Button>
              </div>
            )}
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
