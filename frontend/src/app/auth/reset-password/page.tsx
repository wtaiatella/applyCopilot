"use client";

import React, { useState, useEffect } from "react";
import { Form, Input, Button, Card, Typography, message, Alert } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const { Title, Text } = Typography;

export default function ResetPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      setError("Invalid or missing password reset token.");
    }
  }, [token]);

  const onFinish = async (values: any) => {
    if (!token) return;
    
    if (values.password !== values.confirmPassword) {
      message.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          token,
          password: values.password 
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to reset password");
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
          <Title level={2} className="m-0">Set New Password</Title>
          <Text type="secondary">Enter your new password below</Text>
        </div>

        {error ? (
          <div className="text-center">
            <Alert
              message="Error"
              description={error}
              type="error"
              showIcon
              className="mb-6 text-left"
            />
            <Link href="/auth/forgot-password">
              <Button type="primary" className="w-full">
                Request New Link
              </Button>
            </Link>
          </div>
        ) : success ? (
          <div className="text-center">
            <Alert
              message="Password Reset Successful"
              description="Your password has been successfully reset. You can now log in with your new password."
              type="success"
              showIcon
              className="mb-6 text-left"
            />
            <Link href="/auth/login">
              <Button type="primary" className="w-full">
                Proceed to Login
              </Button>
            </Link>
          </div>
        ) : (
          <Form
            name="reset_password_form"
            onFinish={onFinish}
            layout="vertical"
            size="large"
          >
            <Form.Item
              name="password"
              rules={[
                { required: true, message: 'Please input your new password!' },
                { min: 8, message: 'Password must be at least 8 characters' },
                { pattern: /[A-Z]/, message: 'Password must contain at least one uppercase letter' },
                { pattern: /[a-z]/, message: 'Password must contain at least one lowercase letter' },
                { pattern: /[0-9]/, message: 'Password must contain at least one number' }
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-gray-400" />}
                placeholder="New Password"
              />
            </Form.Item>
            
            <Form.Item
              name="confirmPassword"
              dependencies={['password']}
              rules={[
                { required: true, message: 'Please confirm your new password!' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('The two passwords do not match!'));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-gray-400" />}
                placeholder="Confirm New Password"
              />
            </Form.Item>

            <Form.Item className="mt-6 mb-4">
              <Button type="primary" htmlType="submit" className="w-full" loading={loading}>
                Reset Password
              </Button>
            </Form.Item>
          </Form>
        )}
      </Card>
    </div>
  );
}
