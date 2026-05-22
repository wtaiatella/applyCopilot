"use client";

import React, { useEffect, useState } from "react";
import { Form, Input, Button, App, Space, Card, DatePicker, Tabs } from "antd";
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
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [activeKey, setActiveKey] = useState<string>("0");

  useEffect(() => {
    if (initialData) {
      const formattedData = initialData.map((edu: any) => {
        const isPresent = edu.endDate === 'Present' || edu.current;
        return {
          ...edu,
          dates: [
            edu.startDate ? dayjs(edu.startDate) : undefined,
            isPresent ? dayjs() : (edu.endDate ? dayjs(edu.endDate) : undefined),
          ],
          bulletPoints: edu.bulletPoints || edu.description || [],
        };
      });
      form.setFieldsValue({ education: formattedData });
    }
  }, [initialData, form]);

  const onFinish = async (values: any) => {
    try {
      const formattedData = (values.education || []).map((edu: any) => {
        const startDate = edu.dates?.[0]?.toISOString() || new Date().toISOString();
        const endDate = edu.dates?.[1];
        const isCurrent = edu.current || (endDate && dayjs(endDate).isAfter(dayjs().subtract(1, 'day')));
        
        return {
          ...edu,
          startDate,
          endDate: isCurrent ? 'Present' : endDate?.toISOString(),
          current: isCurrent,
          bulletPoints: edu.bulletPoints || [],
          aiSuggestions: edu.aiSuggestions || [],
        };
      });
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
                const education = form.getFieldValue("education") || [];
                const institutionName = education[name]?.institution || `Education ${name + 1}`;
                
                return {
                  label: institutionName,
                  key: `${name}`,
                  closable: true,
                  children: (
                    <div className="pt-4 px-1">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Form.Item
                          {...restField}
                          name={[name, "institution"]}
                          label="Institution"
                          rules={[{ required: true, message: "Missing institution name" }]}
                        >
                          <Input 
                            placeholder="University Name" 
                            onChange={() => form.setFieldsValue({ _update: Date.now() })}
                          />
                        </Form.Item>

                        <Form.Item
                          {...restField}
                          name={[name, "degree"]}
                          label="Degree"
                          rules={[{ required: true, message: "Missing degree" }]}
                        >
                          <Input placeholder="Bachelor's, Master's, etc." />
                        </Form.Item>
                      </div>

                      <Form.Item
                        {...restField}
                        name={[name, "field"]}
                        label="Field of Study"
                        rules={[{ required: true, message: "Missing field of study" }]}
                      >
                        <Input placeholder="Computer Science, Business, etc." />
                      </Form.Item>

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
                            <div className="mb-2 font-medium text-sm text-gray-400">Bullet Points / Achievements</div>
                            {bpFields.map(({ key: bpKey, ...bpField }) => {
                              return (
                                <div key={bpKey} className="flex items-start gap-2 mb-2 w-full">
                                  <Form.Item
                                    {...bpField}
                                    rules={[{ required: true, message: "Missing content" }]}
                                    className="mb-0 flex-grow"
                                  >
                                    <TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="Describe an achievement..." />
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
                        <TextArea autoSize={{ minRows: 3, maxRows: 6 }} placeholder="Any extra information..." />
                      </Form.Item>
                    </div>
                  ),
                };
              })}
            />
            {fields.length === 0 && (
              <div className="text-center py-12 bg-[#141414] rounded-lg border-2 border-dashed border-[#303030]">
                <p className="text-gray-500 mb-4">No education records added yet.</p>
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>
                  Add Your First Education
                </Button>
              </div>
            )}
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
