"use client";

import React, { useEffect, useState } from "react";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { message, Spin, Alert, Typography } from "antd";

const { Title, Paragraph } = Typography;

export default function ProfilePage() {
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/profile");
      if (!res.ok) {
        if (res.status === 404) {
          // No profile yet, that's fine
          setProfileData({});
          return;
        }
        throw new Error("Failed to fetch profile");
      }
      const data = await res.json();
      const rawData = data.data || {};
      
      // Map flat user/profile fields to basicData structure expected by forms
      const formattedData = {
        ...rawData,
        basicData: {
          firstName: rawData.firstName || rawData.user?.name?.split(' ')[0] || '',
          lastName: rawData.lastName || rawData.user?.name?.split(' ').slice(1).join(' ') || '',
          title: rawData.title,
          location: rawData.location,
          phone: rawData.phone,
          website: rawData.website,
        }
      };
      
      setProfileData(formattedData);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSection = async (section: string, data: any) => {
    // Basic implementation: send to a specific endpoint or general update endpoint
    // Assuming /api/profile handles a general update or we map to specific ones
    try {
      const res = await fetch("/api/profile", {
        method: "POST", // In a real app we might use PATCH /api/profile/basic-data etc
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [section]: data }),
      });
      
      if (!res.ok) {
        throw new Error(`Failed to update ${section}`);
      }
      
      // Update local state
      setProfileData((prev: any) => ({
        ...prev,
        [section]: data
      }));
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  };

  if (loading && !profileData) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <Title level={2}>My Profile</Title>
        <Paragraph type="secondary" className="text-lg">
          Manage your professional details. This information will be used by our AI to match you with jobs and generate personalized applications.
        </Paragraph>
      </div>

      {error && (
        <Alert
          message="Error loading profile"
          description={error}
          type="error"
          showIcon
          className="mb-6"
        />
      )}

      <ProfileTabs
        profileData={profileData}
        loading={false}
        onUpdateBasicData={(data) => handleUpdateSection("basicData", data)}
        onUpdateExperiences={(data) => handleUpdateSection("experiences", data)}
        onUpdateEducation={(data) => handleUpdateSection("education", data)}
        onUpdateProjects={(data) => handleUpdateSection("projects", data)}
        onUpdateSkills={(data) => handleUpdateSection("skills", data)}
        onUpdateReferences={(data) => handleUpdateSection("references", data)}
      />
    </div>
  );
}
