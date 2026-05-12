"use client";

import React, { useState } from "react";
import { App, Breadcrumb, Typography } from "antd";
import { JobSearch } from "@/components/jobs/JobSearch";
import { SearchOutlined } from "@ant-design/icons";
import type { JobSearchQueryInput } from "@/lib/validation/jobs";

const { Title, Paragraph } = Typography;

export default function JobsPage() {
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
        message: "Search Initiated",
        description: `Your autonomous search "${values.title}" has started. We are now scraping and filtering jobs through the 4-level funnel.`,
        placement: "topRight",
      });
      
      // We could redirect to a results view or status page here
    } catch (error) {
      console.error("Search error:", error);
      message.error("An error occurred while starting the search.");
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
            { title: "Job Discovery" },
          ]}
          className="mb-4"
        />
        <Title level={2}>
          <SearchOutlined className="mr-2" />
          Job Discovery & AI Filtering
        </Title>
        <Paragraph className="text-gray-600 dark:text-gray-400 text-lg">
          Configure your search profile with weighted skills and job titles. 
          Our autonomous agents will scrape portals, filter results using TensorFlow, 
          and present the best matches for your profile.
        </Paragraph>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <JobSearch onStartSearch={handleStartSearch} loading={loading} />
      </div>
    </div>
  );
}
