"use client";

import React, { useState } from "react";
import { Upload, App, Card, Typography, Space, Progress } from "antd";
import type { UploadProps } from "antd";
import { InboxOutlined, FilePdfOutlined, FileWordOutlined } from "@ant-design/icons";
import { ProfileService } from "../../services/profileService";
import { ParseProgressEvent } from "../../types/profile";

const { Dragger } = Upload;
const { Title, Text, Paragraph } = Typography;

interface CVUploaderProps {
  onUploadSuccess: () => void;
}

export const CVUploader: React.FC<CVUploaderProps> = ({ onUploadSuccess }) => {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");

  const handleCustomRequest = async (options: Parameters<NonNullable<UploadProps["customRequest"]>>[0]) => {
    const { file, onSuccess, onError } = options;
    setLoading(true);
    setProgress(20);
    setStatusMessage("Uploading and starting text extraction...");

    try {
      await ProfileService.parseCV(
        file as File,
        (event: ParseProgressEvent) => {
          setProgress(event.progress);
          if (event.phase !== "error") {
            setStatusMessage(event.status);
          } else {
            setStatusMessage(event.error);
          }
        },
        (errorMsg: string) => {
          message.error(`Parsing Error: ${errorMsg}`);
          onError?.(new Error(errorMsg));
          resetState();
        },
        () => {
          // Success
          setProgress(100);
          setStatusMessage("CV parsed and merged successfully!");
          onSuccess?.("ok");
          
          modal.success({
            title: "CV Parsing Complete",
            content: "Your resume has been successfully parsed and merged into your profile.",
            okText: "View Profile",
            onOk: () => {
              onUploadSuccess();
              resetState();
            },
          });
        }
      );
    } catch (err) {
      const error = err as Error;
      const msg = error.message || "An error occurred during CV upload.";
      message.error(msg);
      onError?.(error);
      resetState();
    }
  };

  const resetState = () => {
    setLoading(false);
    setProgress(0);
    setStatusMessage("");
  };

  const beforeUpload = (file: File) => {
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) {
      message.error("CV must be smaller than 5MB!");
      return Upload.LIST_IGNORE;
    }
    
    const ext = file.name.split(".").pop()?.toLowerCase();
    const isAccepted = ext === "pdf" || ext === "docx";
    if (!isAccepted) {
      message.error("Only PDF and DOCX files are allowed!");
      return Upload.LIST_IGNORE;
    }

    return true;
  };

  return (
    <Card className="mb-8 overflow-hidden shadow-sm border border-[#303030] bg-[#141414]" styles={{ body: { padding: 24 } }}>
      <div className="flex flex-col md:flex-row gap-8 items-center">
        <div className="flex-1 w-full">
          <Title level={4} className="mt-0 text-white">Fast-track your Profile</Title>
          <Paragraph type="secondary" className="mb-0 text-gray-400">
            Upload your existing CV or Resume. Our AI will automatically extract your experience, education, and skills to populate your profile in seconds.
          </Paragraph>
          <Space className="mt-4" size="middle">
            <Text type="secondary" className="text-gray-400"><FilePdfOutlined /> PDF</Text>
            <Text type="secondary" className="text-gray-400"><FileWordOutlined /> DOCX</Text>
            <Text type="secondary" className="text-gray-400">Max 5MB</Text>
          </Space>
        </div>
        
        <div className="flex-1 w-full">
          <Dragger
            customRequest={handleCustomRequest}
            beforeUpload={beforeUpload}
            multiple={false}
            showUploadList={false}
            disabled={loading}
            className="bg-[#1f1f1f] hover:border-blue-500 transition-colors border-[#303030]"
          >
            {loading ? (
              <div className="p-4 flex flex-col items-center justify-center min-h-[120px]">
                <Progress type="circle" percent={progress} size="small" />
                <Text className="mt-4 text-blue-400 font-medium text-center px-4">{statusMessage}</Text>
              </div>
            ) : (
              <div className="p-4">
                <p className="ant-upload-drag-icon text-blue-500 text-3xl mb-2">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text text-white font-medium">Click or drag CV file to this area</p>
                <p className="ant-upload-hint text-gray-400 text-xs mt-2">
                  Support for PDF and DOCX files. Files are processed locally.
                </p>
              </div>
            )}
          </Dragger>
        </div>
      </div>
    </Card>
  );
};
