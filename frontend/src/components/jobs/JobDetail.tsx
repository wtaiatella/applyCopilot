"use client";

import React from "react";
import { Card, Space, Tag, Typography, Spin } from "antd";
import { MapPin, Briefcase, Calendar, Globe, AlertCircle } from "lucide-react";

const { Title, Text, Paragraph } = Typography;

interface JobListing {
  id: string;
  title: string;
  company: string;
  url: string;
  location?: string | null;
  locationType?: string | null;
  jobType?: string | null;
  experienceLevel?: string | null;
  fullDescription?: string | null;
  isFullDescriptionFetched: boolean;
  postedAt?: Date | string | null;
}

interface JobDetailProps {
  job: JobListing;
}

export default function JobDetail({ job }: JobDetailProps) {
  return (
    <Card className="bg-zinc-950 border-zinc-800 text-white shadow-xl rounded-2xl p-4">
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <div>
          <Title level={2} style={{ color: "#fff", margin: 0 }}>
            {job.title}
          </Title>
          <Text className="text-blue-400 text-lg font-medium block mt-1">
            {job.company}
          </Text>
        </div>

        <Space size="middle" wrap className="text-zinc-400 text-sm">
          {job.location && (
            <span className="flex items-center gap-1.5">
              <MapPin size={16} />
              {job.location}
            </span>
          )}
          {job.locationType && (
            <span className="flex items-center gap-1.5">
              <Globe size={16} />
              <Tag color="cyan" className="m-0 border-0 bg-cyan-950/50 text-cyan-400 uppercase text-xs">
                {job.locationType}
              </Tag>
            </span>
          )}
          {job.jobType && (
            <span className="flex items-center gap-1.5">
              <Briefcase size={16} />
              <Tag color="blue" className="m-0 border-0 bg-blue-950/50 text-blue-400 uppercase text-xs">
                {job.jobType}
              </Tag>
            </span>
          )}
          {job.postedAt && (
            <span className="flex items-center gap-1.5">
              <Calendar size={16} />
              {new Date(job.postedAt).toLocaleDateString()}
            </span>
          )}
        </Space>

        <Card className="bg-zinc-900 border-zinc-800 p-2 rounded-xl">
          <Title level={4} style={{ color: "#fff", marginTop: 0, marginBottom: 16 }}>
            Job Description
          </Title>

          {!job.isFullDescriptionFetched ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <Spin size="large" />
              <div className="space-y-1">
                <Paragraph style={{ color: "#fff", fontWeight: 600, fontSize: 16 }} className="flex items-center justify-center gap-2 m-0">
                  <AlertCircle size={18} className="text-blue-400 animate-pulse" />
                  Description Pending Retrieval
                </Paragraph>
                <Paragraph style={{ color: "#a1a1aa", fontSize: 12 }} className="max-w-sm m-0">
                  The full job description is currently being retrieved from the portal. Please check back shortly.
                </Paragraph>
              </div>
            </div>
          ) : (
            <Paragraph style={{ color: "#d4d4d8", fontSize: 14 }} className="whitespace-pre-wrap leading-relaxed">
              {job.fullDescription || "No description available."}
            </Paragraph>
          )}
        </Card>
      </Space>
    </Card>
  );
}
