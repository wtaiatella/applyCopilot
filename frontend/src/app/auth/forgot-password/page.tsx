"use client";

import React, { useState } from "react";
import { Form, Input, Button, Card, Typography, message, Alert } from "antd";
import { MailOutlined } from "@ant-design/icons";
import Link from "next/link";

const { Title, Text } = Typography;

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const onFinish = async (values: { email: string }) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to request password reset");
      }

      setSuccess(true);
    } catch (error: any) {
      message.error(error.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[#0a0a0a]">
      <Card className="w-full max-w-md shadow-lg rounded-xl">
        <div className="text-center mb-8">
          <Title level={2} className="m-0">Forgot Password</Title>
          <Text type="secondary">Enter your email to receive a reset link</Text>
        </div>

        {success ? (
          <div className="text-center">
            <Alert
              title="Check your email"
              description="If an account exists for that email, we've sent a password reset link."
              type="success"
              showIcon
              className="mb-6"
            />
            <Link href="/auth/login">
              <Button type="primary" className="w-full">
                Return to Login
              </Button>
            </Link>
          </div>
        ) : (
          <Form
            name="forgot_password_form"
            onFinish={onFinish}
            layout="vertical"
            size="large"
          >
            <Form.Item
              name="email"
              rules={[
                { required: true, message: 'Please input your email!' },
                { type: 'email', message: 'Please enter a valid email!' }
              ]}
            >
              <Input prefix={<MailOutlined className="text-gray-400" />} placeholder="Email address" />
            </Form.Item>

            <Form.Item className="mt-6 mb-4">
              <Button type="primary" htmlType="submit" className="w-full" loading={loading}>
                Send Reset Link
              </Button>
            </Form.Item>

            <div className="text-center">
              <Link href="/auth/login" className="text-blue-500 hover:text-blue-400">
                Back to sign in
              </Link>
            </div>
          </Form>
        )}
      </Card>
    </div>
  );
}
