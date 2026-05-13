"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Input, 
  Switch, 
  Select, 
  Space, 
  Tag, 
  Card, 
  Empty, 
  Button, 
  Badge, 
  Divider,
  Typography,
  Tooltip,
  Flex,
  Spin
} from "antd";
import { 
  SearchOutlined, 
  EnvironmentOutlined, 
  ThunderboltOutlined, 
  StarOutlined, 
  StarFilled,
  GlobalOutlined,
  FilterOutlined,
  LoadingOutlined
} from "@ant-design/icons";

const { Text, Title } = Typography;

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  type: string;
  postedAt: string;
  technologies: string[];
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  score?: number;
}

export function JobList() {
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [suggestedOnly, setSuggestedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      // In a real app, this would be a fetch to /api/jobs with filters
      // For now, simulating the response
      const params = new URLSearchParams({
        search,
        remote: remoteOnly.toString(),
        suggested: suggestedOnly.toString()
      });
      
      const response = await fetch(`/api/jobs?${params.toString()}`);
      const result = await response.json();
      
      if (result.success) {
        setJobs(result.data);
      }
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
    } finally {
      setLoading(false);
    }
  }, [search, remoteOnly, suggestedOnly]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return (
    <div className="space-y-6">
      {/* Filters Section */}
      <Card className="shadow-sm border-gray-200 dark:border-gray-800 bg-black/5 dark:bg-white/5">
        <Flex vertical gap={16}>
          <Flex justify="space-between" align="center" wrap="wrap" gap={16}>
            <Title level={4} className="m-0 flex items-center gap-2">
              <FilterOutlined className="text-blue-500" />
              Quick Filters
            </Title>
            <Space wrap>
              <Flex align="center" gap={8} className="bg-blue-500/10 px-3 py-1.5 rounded-full border border-blue-500/20">
                <Text strong className="text-blue-600 dark:text-blue-400">Suggested for You</Text>
                <Tooltip title="Rank jobs using your weighted skill profile (TensorFlow Level 1)">
                  <Switch 
                    checked={suggestedOnly} 
                    onChange={setSuggestedOnly} 
                    size="small"
                  />
                </Tooltip>
              </Flex>
              <Divider orientation="vertical" className="h-8 border-gray-300 dark:border-gray-700" />
              <Space>
                <Text>Remote Only</Text>
                <Switch checked={remoteOnly} onChange={setRemoteOnly} size="small" />
              </Space>
            </Space>
          </Flex>

          <Flex gap={12} wrap="wrap">
            <Input 
              placeholder="Search by title, company, or keywords..." 
              prefix={<SearchOutlined className="text-gray-400" />} 
              className="max-w-md"
              size="large"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select 
              placeholder="Location" 
              style={{ width: 160 }} 
              size="large"
              options={[
                { label: 'Worldwide', value: 'worldwide' },
                { label: 'USA', value: 'usa' },
                { label: 'Europe', value: 'europe' },
                { label: 'Brazil', value: 'brazil' },
              ]}
              allowClear
            />
            <Select 
              placeholder="Job Type" 
              style={{ width: 160 }} 
              size="large"
              options={[
                { label: 'Full-time', value: 'full_time' },
                { label: 'Contract', value: 'contract' },
                { label: 'Freelance', value: 'freelance' },
              ]}
              allowClear
            />
          </Flex>
        </Flex>
      </Card>

      {/* Jobs Feed */}
      <div className="relative min-h-[400px]">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 dark:bg-black/50 backdrop-blur-sm rounded-xl">
            <Flex vertical align="center" gap={12}>
              <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
              <Text strong className="animate-pulse">Scoring jobs for your profile...</Text>
            </Flex>
          </div>
        )}

        {jobs.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} showScore={suggestedOnly} />
            ))}
          </div>
        ) : !loading && (
          <Empty 
            image={Empty.PRESENTED_IMAGE_SIMPLE} 
            description="No jobs found matching your criteria. Try adjusting your filters or Search Profile weights."
          />
        )}
      </div>
    </div>
  );
}

function JobCard({ job, showScore }: { job: Job, showScore: boolean }) {
  const [isFavorited, setIsFavorited] = useState(false);

  return (
    <Card 
      hoverable 
      className="border-gray-200 dark:border-gray-800 transition-all hover:border-blue-400/50 group bg-white dark:bg-[#1f1f1f]"
      bodyStyle={{ padding: '1.5rem' }}
    >
      <Flex justify="space-between" align="start">
        <Flex gap={16} align="start">
          <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center text-xl font-bold text-gray-400 shrink-0">
            {job.company.charAt(0)}
          </div>
          <div className="space-y-1">
            <Flex align="center" gap={8} wrap="wrap">
              <Title level={5} className="m-0 group-hover:text-blue-500 transition-colors">
                {job.title}
              </Title>
              <Tag color={job.remote ? 'green' : 'default'} icon={<GlobalOutlined />}>
                {job.remote ? 'Remote' : job.location}
              </Tag>
              <Tag className="bg-gray-100 dark:bg-gray-800 border-none opacity-80 uppercase text-[10px] font-bold">
                {job.type.replace('_', ' ')}
              </Tag>
            </Flex>
            <Text className="text-gray-500 dark:text-gray-400 block font-medium">
              {job.company}
            </Text>
            <Flex gap={8} className="mt-3" wrap="wrap">
              {job.technologies.slice(0, 5).map(tech => (
                <Tag key={tech} className="m-0 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                  {tech}
                </Tag>
              ))}
              {job.technologies.length > 5 && (
                <Text type="secondary" className="text-xs">+{job.technologies.length - 5} more</Text>
              )}
            </Flex>
          </div>
        </Flex>

        <Flex vertical align="end" gap={12}>
          {showScore && job.score && (
            <Badge.Ribbon 
              text={`${Math.round(job.score)}% Match`} 
              color={job.score > 80 ? 'green' : job.score > 50 ? 'blue' : 'orange'}
              className="-mt-1.5"
            >
              <div className="h-8" />
            </Badge.Ribbon>
          )}
          <Space>
            <Button 
              type="text" 
              icon={isFavorited ? <StarFilled className="text-yellow-500" /> : <StarOutlined />} 
              onClick={(e) => {
                e.stopPropagation();
                setIsFavorited(!isFavorited);
              }}
            />
            <Button type="primary" icon={<ThunderboltOutlined />} ghost>
              Analyze
            </Button>
            <Button type="primary" href={job.url} target="_blank">
              Apply
            </Button>
          </Space>
          <Text type="secondary" className="text-xs">
            Posted {job.postedAt}
          </Text>
        </Flex>
      </Flex>
    </Card>
  );
}
