"use client";

import React, { useEffect, useState } from "react";
import { Form, Input, Button, App, Space, DatePicker, Select, Tabs, Checkbox, Popover, Badge } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ProjectInput } from "@/lib/validation/profile";
import dayjs from "dayjs";

const { TextArea } = Input;
const { RangePicker } = DatePicker;

interface ProjectsFormProps {
  initialData?: ProjectInput[];
  cvs?: any[];
  onSubmit: (data: any[]) => Promise<void>;
  loading?: boolean;
}

export function ProjectsForm({
  initialData,
  cvs = [],
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
        
        // Normalize bullet points to structured object format
        const rawBullets = proj.bulletPoints || proj.description || [];
        const formattedBullets = rawBullets.map((bp: any) => {
          if (typeof bp === 'string') {
            return {
              text: bp,
              isActive: true,
              isArchived: false,
              type: 'bullet',
              cvIds: [],
            };
          }
          return {
            id: bp.id,
            text: bp.text || '',
            isActive: bp.isActive !== undefined ? bp.isActive : true,
            isArchived: bp.isArchived || false,
            type: bp.type || 'bullet',
            cvIds: bp.cvIds || [],
          };
        });

        return {
          ...proj,
          dates: [
            proj.startDate ? dayjs(proj.startDate) : undefined,
            isPresent ? dayjs() : (proj.endDate ? dayjs(proj.endDate) : undefined),
          ],
          bulletPoints: formattedBullets,
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
        
        // Clean up and structured bullets formatting
        const bulletPoints = (proj.bulletPoints || []).map((bp: any) => ({
          id: bp.id,
          text: bp.text || '',
          isActive: bp.isActive !== undefined ? bp.isActive : true,
          type: bp.type || 'bullet',
          cvIds: bp.cvIds || [],
        }));

        return {
          id: proj.id,
          name: proj.name || 'Unknown Project',
          startDate,
          endDate: isCurrent ? 'Present' : endDate?.toISOString(),
          current: isCurrent,
          bulletPoints,
          technologies: proj.technologies || [],
          freeFormContext: proj.freeFormContext || '',
        };
      });

      await onSubmit(formattedData);
      message.success("Projects updated successfully!");
    } catch (error) {
      message.error("Failed to update projects");
    }
  };

  const getCvNames = (cvIds: string[] = []) => {
    if (!cvs || cvs.length === 0) return [];
    return cvIds.map(id => cvs.find(c => c.id === id)?.name || "Resume Version");
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
                  add({
                    name: "",
                    dates: [],
                    current: false,
                    technologies: [],
                    bulletPoints: [{ text: "", isActive: true, type: "bullet", cvIds: [] }],
                    freeFormContext: "",
                  });
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
                      {/* Hidden field for project ID */}
                      <Form.Item
                        {...restField}
                        name={[name, "id"]}
                        className="hidden"
                        style={{ display: 'none' }}
                      >
                        <Input type="hidden" />
                      </Form.Item>

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

                      <div className="mb-4">
                        <div className="mb-2 font-medium text-sm text-gray-400">Highlights & Features</div>
                        <Form.List name={[name, "bulletPoints"]}>
                          {(bpFields, { add: addBp, remove: removeBp }) => (
                            <div>
                              {bpFields.map(({ key: bpKey, name: bpName, ...bpField }) => {
                                const bulletData = form.getFieldValue(["projects", name, "bulletPoints", bpName]) || {};
                                const isBullet = bulletData.type !== "paragraph";
                                const cvList = getCvNames(bulletData.cvIds);

                                return (
                                  <div key={bpKey} className="flex items-center gap-2 mb-3 w-full bg-gray-900/10 p-2 rounded-lg border border-gray-800/40 hover:border-gray-850 transition-all">
                                    {/* Visual prefix symbol */}
                                    {isBullet && (
                                      <div className="text-lg font-bold w-6 text-center text-gray-500 flex items-center justify-center">
                                        •
                                      </div>
                                    )}

                                    {/* Hidden fields to preserve id and cvIds */}
                                    <Form.Item
                                      {...bpField}
                                      name={[bpName, "id"]}
                                      className="hidden"
                                      style={{ display: 'none' }}
                                    >
                                      <Input type="hidden" />
                                    </Form.Item>
                                    <Form.Item
                                      {...bpField}
                                      name={[bpName, "cvIds"]}
                                      className="hidden"
                                      style={{ display: 'none' }}
                                    >
                                      <Select mode="multiple" style={{ display: 'none' }} />
                                    </Form.Item>

                                    {/* Text Content */}
                                    <Form.Item
                                      {...bpField}
                                      name={[bpName, "text"]}
                                      rules={[{ required: true, message: "Missing content" }]}
                                      className="mb-0 flex-grow"
                                      style={{ marginBottom: 0 }}
                                    >
                                      <TextArea 
                                        autoSize={{ minRows: 1, maxRows: 4 }} 
                                        placeholder="Describe a project feature or achievement..."
                                        className="w-full bg-transparent border-none focus:bg-gray-800/20 mb-0 py-1"
                                      />
                                    </Form.Item>

                                    {/* Right Actions */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      {/* Type selector */}
                                      <Form.Item
                                        {...bpField}
                                        name={[bpName, "type"]}
                                        className="mb-0"
                                        style={{ marginBottom: 0 }}
                                      >
                                        <Select
                                          size="small"
                                          style={{ width: 110 }}
                                          options={[
                                            { value: "bullet", label: "Bullet" },
                                            { value: "paragraph", label: "Paragraph" }
                                          ]}
                                          onChange={() => form.setFieldsValue({ _update: Date.now() })}
                                        />
                                      </Form.Item>

                                      {/* Active checkbox */}
                                      <Form.Item
                                        {...bpField}
                                        name={[bpName, "isActive"]}
                                        valuePropName="checked"
                                        className="mb-0"
                                        style={{ marginBottom: 0 }}
                                      >
                                        <Checkbox>Active</Checkbox>
                                      </Form.Item>

                                      {/* CV Count Badge with Popover */}
                                      {cvList.length > 0 && (
                                        <Popover
                                          title="Used in Resume Versions"
                                          content={
                                            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                                              {cvList.map((cvName, idx) => (
                                                <a 
                                                  key={idx} 
                                                  href="#"
                                                  className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1 py-1 px-2 hover:bg-gray-800/40 rounded transition-all"
                                                  onClick={(e) => {
                                                    e.preventDefault();
                                                    message.info(`Navigating to customize CV "${cvName}" (future feature).`);
                                                  }}
                                                >
                                                  📄 {cvName}
                                                </a>
                                              ))}
                                            </div>
                                          }
                                          trigger="hover"
                                        >
                                          <Badge 
                                            count={cvList.length} 
                                            style={{ backgroundColor: '#722ed1', cursor: 'pointer' }} 
                                            title=""
                                            className="flex items-center"
                                          />
                                        </Popover>
                                      )}

                                      {/* Delete Button */}
                                      <Button 
                                        type="text" 
                                        danger 
                                        size="small"
                                        onClick={() => removeBp(bpName)} 
                                        icon={<DeleteOutlined />} 
                                        className="flex items-center justify-center self-center"
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                              <Button type="dashed" onClick={() => addBp({ text: "", isActive: true, type: "bullet", cvIds: [] })} block icon={<PlusOutlined />}>
                                Add Highlight
                              </Button>
                            </div>
                          )}
                        </Form.List>
                      </div>

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
