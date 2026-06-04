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
  const [statusMessage, setStatusMessage] = useState('Uploading CV...');

  const props: UploadProps = {
    name: 'file',
    multiple: false,
    accept: '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    action: '/api/profile/upload-cv',
    showUploadList: false,
    
    onChange(info) {
      const { status } = info.file;
      
      if (status === 'uploading') {
        setLoading(true);
        setStatusMessage('Uploading CV and extracting raw text...');
        setProgress(15);
      }
      
      if (status === 'done') {
        setProgress(25);
        setStatusMessage('Text extracted. Launching focused AI parsing pipeline...');
        
        if (info.file.response && info.file.response.data) {
          const { cvText, fileId, error, segments } = info.file.response.data;
          
          if (error || !cvText) {
            message.error(`Extraction Error: ${error || "No text extracted from CV."}`);
            setLoading(false);
            setProgress(0);
            return;
          }
          
          // Sequential parsing chain to avoid timeouts and optimize local LLM assertiveness
          (async () => {
            try {
              // Step 1: Parse Basic (40%)
              setProgress(40);
              setStatusMessage('AI Parsing [1/4]: Extracting basic contact info and summaries...');
              const basicText = [segments?.basicData, segments?.summary].filter(Boolean).join('\n\n') || cvText;
              const basicRes = await fetch('/api/profile/parse/basic', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cvText: basicText })
              });
              if (!basicRes.ok) throw new Error('Failed to parse basic contact details');
              const basicResult = await basicRes.json();
              const basicData = basicResult.data;

              // Step 2: Parse Experiences (60%)
              setProgress(60);
              setStatusMessage('AI Parsing [2/4]: Extracting structured job experiences...');
              const experiencesText = segments?.experiences || cvText;
              const expRes = await fetch('/api/profile/parse/experiences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cvText: experiencesText })
              });
              if (!expRes.ok) throw new Error('Failed to parse work experience list');
              const expResult = await expRes.json();
              const experiences = expResult.data?.experiences || [];

              // Step 3: Parse Projects (80%)
              setProgress(80);
              setStatusMessage('AI Parsing [3/4]: Extracting project details and technologies...');
              const projectsText = segments?.projects || cvText;
              const projRes = await fetch('/api/profile/parse/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cvText: projectsText })
              });
              if (!projRes.ok) throw new Error('Failed to parse project history');
              const projResult = await projRes.json();
              const projects = projResult.data?.projects || [];

              // Step 4: Parse Education & Skills (95%)
              setProgress(95);
              setStatusMessage('AI Parsing [4/4]: Extracting education history and categorized skills...');
              const eduSkillsText = [segments?.education, segments?.skills].filter(Boolean).join('\n\n') || cvText;
              const eduSkillsRes = await fetch('/api/profile/parse/education-skills', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cvText: eduSkillsText })
              });
              if (!eduSkillsRes.ok) throw new Error('Failed to parse education and skills sets');
              const eduSkillsResult = await eduSkillsRes.json();
              const education = eduSkillsResult.data?.education || [];
              const skills = eduSkillsResult.data?.skills || [];

              // Step 5: Complete (100%)
              setProgress(100);
              setStatusMessage('CV parsed completely. Ready to merge!');
              
              message.success(`${info.file.name} CV parsed completely.`);

              const completeParsedData = {
                basicData,
                experiences,
                projects,
                education,
                skills,
                fileId
              };

              modal.success({
                title: 'CV Parsing Complete',
                content: 'All profile sections have been parsed successfully using dedicated Ollama prompts. Click OK to merge with your active profile.',
                okText: 'Merge & Save Profile',
                onOk() {
                  onUploadSuccess(completeParsedData);
                }
              });
            } catch (err: any) {
              console.error('Client-side sequential CV parsing failed', err);
              message.error(`AI Parsing failed: ${err.message || 'Unknown processing error'}`);
            } finally {
              setTimeout(() => {
                setLoading(false);
                setProgress(0);
                setStatusMessage('');
              }, 1200);
            }
          })();
        }
      } else if (status === 'error') {
        setLoading(false);
        setProgress(0);
        setStatusMessage('');
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
