"use client";

import React, { useEffect, useState } from "react";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { CVUploader } from "@/components/profile/CVUploader";
import { App, Spin, Alert, Typography } from "antd";

const { Title, Paragraph } = Typography;

export default function ProfilePage() {
  const { message } = App.useApp();
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
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
          github: rawData.github,
          summaries: rawData.summaries || [],
        },
        skills: (rawData.skills || []).map((s: any) => ({
          ...s,
          level: s.proficiency || s.level || 'INTERMEDIATE',
          yearsOfExperience: s.yearsExperience || s.yearsOfExperience || 0
        }))
      };
      
      setProfileData(formattedData);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSection = async (section: string, data: any) => {
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [section]: data }),
      });
      
      if (!res.ok) {
        throw new Error(`Failed to update ${section}`);
      }
      
      message.success(`${section === "basicData" ? "Basic data" : section.charAt(0).toUpperCase() + section.slice(1)} saved successfully!`);
      await fetchProfile(); // Reload complete profile from server
    } catch (err: any) {
      console.error(err);
      message.error(err.message || `Failed to update ${section}`);
      throw err;
    }
  };

  const handleCVExtractedData = (extractedData: any) => {
    console.log("handleCVExtractedData received:", extractedData);
    if (!extractedData) return;

    // Fix for Gemma model hallucinating the schema wrapper around the data
    let dataToUse = extractedData;
    if (dataToUse.properties) {
      dataToUse = {
        basicData: dataToUse.properties.basicData?.properties || dataToUse.properties.basicData,
        experiences: dataToUse.properties.experiences,
        education: dataToUse.properties.education,
        skills: dataToUse.properties.skills,
        projects: dataToUse.properties.projects,
      };
    }
    
    // Merge the AI extracted data with our current profile data
    setProfileData((prev: any) => {
      // Basic Data merging (if AI found something, use it, otherwise keep prev)
      const basicData = { 
        ...prev?.basicData,
        summaries: prev?.basicData?.summaries || prev?.summaries || []
      };

      if (dataToUse.basicData) {
        const aiInfo = dataToUse.basicData;
        const normalizeUrl = (url?: string) => {
          if (!url) return undefined;
          if (url.startsWith('http')) return url;
          return `https://${url}`;
        };

        if (aiInfo.firstName && !basicData.firstName) basicData.firstName = aiInfo.firstName;
        if (aiInfo.lastName && !basicData.lastName) basicData.lastName = aiInfo.lastName;
        if (aiInfo.title && !basicData.title) basicData.title = aiInfo.title;
        if (aiInfo.location && !basicData.location) basicData.location = aiInfo.location;
        if (aiInfo.phone && !basicData.phone) basicData.phone = aiInfo.phone;
        
        const website = normalizeUrl(aiInfo.website);
        if (website && !basicData.website) basicData.website = website;
        
        const github = normalizeUrl(aiInfo.github);
        if (github && !basicData.github) basicData.github = github;
      }
      
      // Ensure bulletPoints are mapped from description for compatibility
      const experiences = (dataToUse.experiences || []).map((exp: any) => ({
        ...exp,
        bulletPoints: exp.bulletPoints || exp.description || [],
      }));

      const education = (dataToUse.education || []).map((edu: any) => ({
        ...edu,
        bulletPoints: edu.bulletPoints || edu.description || [],
      }));

      const projects = (dataToUse.projects || []).map((proj: any) => ({
        ...proj,
        bulletPoints: proj.bulletPoints || proj.description || [],
        description: proj.description && typeof proj.description === 'string' ? proj.description : (proj.name || 'Project'),
      }));

      const mergedData = {
        basicData,
        experiences: experiences.length > 0 ? experiences : prev?.experiences || [],
        education: education.length > 0 ? education : prev?.education || [],
        projects: projects.length > 0 ? projects : prev?.projects || [],
        skills: dataToUse.skills && dataToUse.skills.length > 0 ? dataToUse.skills : prev?.skills || [],
        references: dataToUse.references && dataToUse.references.length > 0 ? dataToUse.references : prev?.references || [],
      };

      // Automatically save the extracted data so it's not lost on refresh
      fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mergedData),
      })
        .then(() => fetchProfile())
        .catch(err => console.error("Failed to auto-save profile:", err));

      return mergedData;
    });
    
    message.success("Profile updated and automatically saved with CV data! Please review the details.");
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

      <CVUploader onUploadSuccess={handleCVExtractedData} />

      {error && (
        <Alert
          title="Error loading profile"
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
