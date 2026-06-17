"use client";

import React from "react";
import { ProfileProvider, useProfileContext } from "@/contexts/ProfileContext";
import { CVUploader } from "@/components/profile/CVUploader";
import ProfileTabs from "@/components/profile/ProfileTabs";
import { Typography, App } from "antd";

const { Paragraph } = Typography;

function ProfileContent() {
  const { refreshProfile, handlePartialData } = useProfileContext();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-extrabold text-white">Profile Settings</h1>
          <Paragraph type="secondary" className="text-zinc-400 mt-2">
            Build and optimize your master CV. Manual edits are auto-saved in the background.
          </Paragraph>
        </div>
      </div>

      {/* CV Uploader for progressive parsing */}
      <CVUploader 
        onUploadSuccess={refreshProfile}
        onPartialData={handlePartialData}
      />

      {/* Profile Form Tabs */}
      <ProfileTabs />
    </div>
  );
}

export default function ProfilePage() {
  return (
    // Wrap page in App context for notifications/modals, and ProfileProvider
    <App>
      <ProfileProvider>
        <ProfileContent />
      </ProfileProvider>
    </App>
  );
}
