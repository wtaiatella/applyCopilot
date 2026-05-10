"use client";

import React, { useState } from 'react';
import { Upload, App, Button, Card, Typography, Space, Progress } from 'antd';
import { InboxOutlined, FilePdfOutlined, FileWordOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';

const { Dragger } = Upload;
const { Title, Text, Paragraph } = Typography;

interface CVUploaderProps {
  onUploadSuccess: (extractedData: any) => void;
}

export const CVUploader: React.FC<CVUploaderProps> = ({ onUploadSuccess }) => {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const props: UploadProps = {
    name: 'file', // Changed to match API expectation formData.get('file')
    multiple: false,
    accept: '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    action: '/api/profile/upload-cv',
    showUploadList: false,
    
    onChange(info) {
      const { status } = info.file;
      
      if (status === 'uploading') {
        setLoading(true);
        // Simulate progress for UX
        setProgress(prev => {
          if (prev >= 90) return 90;
          return prev + 10;
        });
      }
      
      if (status === 'done') {
        setProgress(100);
        message.success(`${info.file.name} file uploaded successfully.`);
        
        // The API returns the extracted data inside info.file.response.data.extractedData
        if (info.file.response && info.file.response.data) {
          const { extractedData, error } = info.file.response.data;
          
          console.log("Upload response data:", info.file.response.data);
          
          if (error || !extractedData) {
            message.error(`AI Parsing Error: ${error || "No data extracted."}`);
            return;
          }
          
          modal.success({
            title: 'CV Processed Successfully',
            content: 'Your CV has been parsed. The AI is now filling out your profile sections based on your resume.',
            onOk() {
              onUploadSuccess(extractedData);
            }
          });
        }
        
        setTimeout(() => {
          setLoading(false);
          setProgress(0);
        }, 1000);
      } else if (status === 'error') {
        setLoading(false);
        setProgress(0);
        message.error(`${info.file.name} file upload failed. ${info.file.response?.error || 'Unknown error'}`);
      }
    },
    
    beforeUpload(file) {
      const isLt5M = file.size / 1024 / 1024 < 5;
      if (!isLt5M) {
        message.error('CV must be smaller than 5MB!');
        return Upload.LIST_IGNORE;
      }
      return true;
    },
  };

  return (
    <Card className="mb-8 overflow-hidden shadow-sm border border-[#303030]">
      <div className="flex flex-col md:flex-row gap-8 items-center">
        <div className="flex-1 w-full">
          <Title level={4} className="mt-0">Fast-track your Profile</Title>
          <Paragraph type="secondary" className="mb-0">
            Upload your existing CV or Resume. Our AI will automatically extract your experience, education, and skills to populate your profile in seconds.
          </Paragraph>
          <Space className="mt-4" size="middle">
            <Text type="secondary"><FilePdfOutlined /> PDF</Text>
            <Text type="secondary"><FileWordOutlined /> DOCX</Text>
            <Text type="secondary">Max 5MB</Text>
          </Space>
        </div>
        
        <div className="flex-1 w-full">
          <Dragger {...props} className="bg-[#1f1f1f] hover:border-blue-500 transition-colors" disabled={loading}>
            {loading ? (
              <div className="p-4 flex flex-col items-center justify-center min-h-[120px]">
                <Progress type="circle" percent={progress} size="small" />
                <Text className="mt-4 text-blue-400 font-medium">Processing your CV...</Text>
              </div>
            ) : (
              <div className="p-4">
                <p className="ant-upload-drag-icon text-blue-500 text-3xl mb-2">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text text-white font-medium">Click or drag CV file to this area</p>
                <p className="ant-upload-hint text-gray-400 text-xs mt-2">
                  Support for a single or bulk upload. Strictly prohibited from uploading company data or other
                  banned files.
                </p>
              </div>
            )}
          </Dragger>
        </div>
      </div>
    </Card>
  );
};
