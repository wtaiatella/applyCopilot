"use client";

import React from "react";
import { App, Breadcrumb, Typography, Flex } from "antd";
import { JobList } from "@/components/jobs/JobList";
import { SearchOutlined, ThunderboltOutlined } from "@ant-design/icons";

const { Title, Paragraph } = Typography;

export default function JobsDiscoveryPage() {
  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <Breadcrumb
          items={[
            { title: "Dashboard", href: "/" },
            { title: "Job Search", href: "/jobs" },
            { title: "Discovery" },
          ]}
          className="mb-4"
        />
        <Flex justify="space-between" align="end" wrap="wrap" gap={16}>
          <div>
            <Title level={2}>
              <SearchOutlined className="mr-2" />
              Job Discovery
            </Title>
            <Paragraph className="text-gray-600 dark:text-gray-400 text-lg m-0">
              Explore opportunities from our global job bank. Use the <ThunderboltOutlined className="text-blue-500" /> **Suggested** toggle to rank jobs based on your professional profile.
            </Paragraph>
          </div>
        </Flex>
      </div>

      <JobList />
    </div>
  );
}
