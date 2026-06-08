"use client";

import React, { useState } from "react";
import { App, Breadcrumb, Typography } from "antd";
import { JobSearch } from "@/components/jobs/JobSearch";
import { SettingOutlined } from "@ant-design/icons";
import type { JobSearchQueryInput } from "@/lib/validation/jobs";

const { Title, Paragraph } = Typography;

export default function JobConfigPage() {
  const { message, notification } = App.useApp();
  const [loading, setLoading] = useState(false);

  const handleStartSearch = async (values: JobSearchQueryInput) => {
    setLoading(true);
    try {
      const response = await fetch("/api/search/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error("Failed to start search");
      }

      const data = await response.json();
      
      notification.success({
        message: "Search Profile Saved",
        description: `Your search profile "${values.title}" has been saved and initiated. You can see the results in the Discovery tab.`,
        placement: "topRight",
      });
    } catch (error) {
      console.error("Search error:", error);
      message.error("An error occurred while saving the search profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <Breadcrumb
          items={[
            { title: "Dashboard", href: "/" },
            { title: "Job Search", href: "/jobs" },
            { title: "Search Profiles" },
          ]}
          className="mb-4"
        />
        <Title level={2}>
          <SettingOutlined className="mr-2" />
          Search Profile Configuration
        </Title>
        <Paragraph className="text-gray-600 dark:text-gray-400 text-lg">
          Define your target job titles and skills with weights. These parameters drive the 
          AI filtering funnel to identify the best opportunities from the global job bank.
        </Paragraph>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <JobSearch onStartSearch={handleStartSearch} loading={loading} />
      </div>
    </div>
  );
}
