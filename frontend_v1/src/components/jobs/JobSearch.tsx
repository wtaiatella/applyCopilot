"use client";

import React, { useState, useEffect } from "react";
import { 
  Tabs, 
  Form, 
  Input, 
  Button, 
  Card, 
  Select, 
  Switch, 
  Slider, 
  Flex,
  Space, 
  Typography, 
  App,
  Divider,
  Checkbox,
  Tag,
  Tooltip
} from "antd";
import { 
  SearchOutlined, 
  PlusOutlined, 
  DeleteOutlined, 
  RocketOutlined,
  ImportOutlined,
  InfoCircleOutlined
} from "@ant-design/icons";
import type { JobSearchQueryInput } from "@/lib/validation/jobs";

const { Title, Text } = Typography;

interface JobSearchProps {
  onStartSearch: (values: JobSearchQueryInput) => Promise<void>;
  loading?: boolean;
}

export function JobSearch({ onStartSearch, loading }: JobSearchProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState("general");
  const [portals, setPortals] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    fetchPortals();
  }, []);

  const fetchPortals = async () => {
    try {
      const res = await fetch("/api/portals");
      if (res.ok) {
        const result = await res.json();
        // Ensure we handle the { success: true, data: [] } wrapper
        setPortals(Array.isArray(result.data) ? result.data : []);
      }
    } catch (error) {
      console.error("Failed to fetch portals", error);
      setPortals([]);
    }
  };

  const handleImportFromProfile = async () => {
    setIsImporting(true);
    try {
      const res = await fetch("/api/profile");
      if (res.ok) {
        const result = await res.json();
        // Access profile from the data property
        const profile = result.data;
        
        if (profile?.skills) {
          const hardSkills = profile.skills
            .filter((s: any) => s.category !== "SOFT_SKILL")
            .map((s: any) => ({ name: s.name, weight: 3 }));
          
          const softSkills = profile.skills
            .filter((s: any) => s.category === "SOFT_SKILL")
            .map((s: any) => ({ name: s.name, weight: 2 }));
          
          form.setFieldsValue({
            hardSkills,
            softSkills
          });
          message.success("Skills imported from your profile!");
        }
      }
    } catch (error) {
      message.error("Failed to import profile data");
    } finally {
      setIsImporting(false);
    }
  };

  const onFinish = async (values: any) => {
    try {
      await onStartSearch(values as JobSearchQueryInput);
    } catch (error) {
      message.error("Failed to start search");
    }
  };

  const WeightedList = ({ name, label, description, icon }: { name: string, label: string, description: string, icon: React.ReactNode }) => (
    <div className="py-2">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <Title level={5} className="mb-0">{icon} {label}</Title>
          <Text type="secondary">{description}</Text>
        </div>
        {name !== 'targetTitles' && (
          <Button 
            icon={<ImportOutlined />} 
            onClick={handleImportFromProfile}
            loading={isImporting}
            type="primary"
            ghost
          >
            Import from Profile
          </Button>
        )}
      </div>
      
      <Form.List name={name}>
        {(fields, { add, remove }) => (
          <>
            <Flex vertical gap="middle" className="w-full">
              {fields.map(({ key, ...fieldProps }) => (
                <div
                  key={key}
                  className="bg-black/5 dark:bg-white/5 rounded-xl p-5 border border-gray-200 dark:border-gray-800 relative group transition-all hover:border-blue-400"
                >
                  <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                    <div className="col-span-1 md:col-span-8">
                      <Text strong className="block mb-1 text-xs uppercase opacity-60">Name / Skill</Text>
                      <Form.Item
                        {...fieldProps}
                        name={[fieldProps.name, 'name']}
                        rules={[{ required: true, message: 'Required' }]}
                        className="mb-0"
                      >
                        <Input placeholder="e.g. Senior React Developer, Node.js, Agile..." size="large" />
                      </Form.Item>
                    </div>
                    <div className="col-span-1 md:col-span-3">
                      <Text strong className="block mb-1 text-xs uppercase opacity-60">Importance</Text>
                      <div className="flex items-center gap-4">
                        <Form.Item
                          {...fieldProps}
                          name={[fieldProps.name, 'weight']}
                          className="mb-0 flex-1"
                        >
                          <Slider 
                            min={1} 
                            max={5} 
                            marks={{ 1: '1', 3: '3', 5: '5' }}
                            step={1}
                          />
                        </Form.Item>
                      </div>
                    </div>
                    <div className="col-span-1 md:col-span-1 flex justify-end pt-4 md:pt-0">
                      <Button 
                        type="text" 
                        danger 
                        shape="circle"
                        icon={<DeleteOutlined />} 
                        onClick={() => remove(fieldProps.name)} 
                      />
                    </div>
                  </div>
                </div>
              ))}
            </Flex>
            <Button
              type="dashed"
              onClick={() => add({ weight: 3 })}
              block
              icon={<PlusOutlined />}
              className="mt-6 h-12"
            >
              Add {label}
            </Button>
          </>
        )}
      </Form.List>
    </div>
  );

  const items = [
    {
      key: "general",
      label: "General Configuration",
      children: (
        <div className="p-4 space-y-8">
          <Form.Item
            name="title"
            label="Search Profile Name"
            rules={[{ required: true, message: "Give this search a name" }]}
            tooltip="Example: Senior React Remote Worldwide"
          >
            <Input placeholder="e.g. Senior Frontend Engineer - Worldwide" size="large" />
          </Form.Item>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Form.Item
              name="keywords"
              label="Search Keywords"
              rules={[{ required: true, message: "Add at least one keyword" }]}
              tooltip="Terms sent to LinkedIn/WWR search engines"
            >
              <Select 
                mode="tags" 
                placeholder="Type and press enter (e.g. React, Node.js)" 
                style={{ width: '100%' }}
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="locations"
              label="Preferred Locations"
              tooltip="Used to filter results and construct search URLs"
            >
              <Select 
                mode="tags" 
                placeholder="e.g. Remote, Worldwide, USA" 
                style={{ width: '100%' }}
                size="large"
              />
            </Form.Item>
          </div>

          <Divider titlePlacement="left">Scraping Sources</Divider>
          
          <Form.Item name="portalIds" label="Select Portals to Search">
            <Checkbox.Group className="w-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {portals.map(p => (
                  <Card 
                    key={p.id} 
                    size="small" 
                    className="hover:border-blue-400 transition-all cursor-pointer bg-black/5 dark:bg-white/5 border-gray-200 dark:border-gray-800"
                  >
                    <Checkbox value={p.id}>
                      <span className="font-medium">{p.name}</span>
                      <Tag color="blue" className="ml-2">{p.type}</Tag>
                    </Checkbox>
                  </Card>
                ))}
              </div>
            </Checkbox.Group>
          </Form.Item>

          <div className="flex flex-col md:flex-row items-start md:items-center gap-8 bg-black/5 dark:bg-white/5 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
            <Form.Item name="remoteOnly" label="Remote Only" valuePropName="checked" className="mb-0">
              <Switch defaultChecked />
            </Form.Item>
            <Form.Item name="frequency" label="Search Frequency" className="mb-0 flex-1">
              <Select size="large" options={[
                { value: 'MANUAL', label: 'Manual Execution' },
                { value: 'DAILY', label: 'Daily Automated' },
                { value: 'WEEKLY', label: 'Weekly Automated' },
              ]} />
            </Form.Item>
          </div>
        </div>
      )
    },
    {
      key: "titles",
      label: "Job Titles",
      children: (
        <WeightedList 
          name="targetTitles" 
          label="Job Title" 
          icon={<RocketOutlined className="text-orange-500" />}
          description="Define which cargos match your seniority. Higher weight gives more points during Level 1 filtering."
        />
      )
    },
    {
      key: "hardSkills",
      label: "Hard Skills",
      children: (
        <WeightedList 
          name="hardSkills" 
          label="Hard Skill" 
          icon={<RocketOutlined className="text-blue-500" />}
          description="Technical skills that are mandatory or highly desired. Comparison is done against the full description."
        />
      )
    },
    {
      key: "softSkills",
      label: "Soft Skills",
      children: (
        <WeightedList 
          name="softSkills" 
          label="Soft Skill" 
          icon={<RocketOutlined className="text-green-500" />}
          description="Behavioral skills and methodologies (e.g. Agile, Leadership, Communication)."
        />
      )
    }
  ];

  return (
    <Card className="shadow-lg border-0 overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Title level={3} className="mb-1">
            <SearchOutlined className="mr-2 text-blue-600" />
            Configure Job Search
          </Title>
          <Text type="secondary">
            Set up your criteria and weights to fuel the 4-level AI filtering funnel.
          </Text>
        </div>
        <Tooltip title="Help about the funnel">
          <Button type="text" icon={<InfoCircleOutlined />} />
        </Tooltip>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          remoteOnly: true,
          frequency: "MANUAL",
          targetTitles: [{ name: "", weight: 4 }],
          hardSkills: [],
          softSkills: []
        }}
      >
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          items={items}
          className="search-config-tabs"
        />

        <Divider />
        
        <div className="flex justify-end gap-4 p-4">
          <Button size="large" onClick={() => form.resetFields()}>
            Reset
          </Button>
          <Button 
            type="primary" 
            htmlType="submit" 
            size="large" 
            icon={<RocketOutlined />}
            loading={loading}
            className="px-8 bg-blue-600 hover:bg-blue-700"
          >
            Start Autonomous Search
          </Button>
        </div>
      </Form>
    </Card>
  );
}
