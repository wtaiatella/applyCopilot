"use client";

import React, { useState } from "react";
import { Form, Input, Button, Card, Typography, Divider, App } from "antd";
import { UserOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

const { Title, Text } = Typography;

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { message } = App.useApp();

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          password: values.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to register");
      }

      message.success("Account created successfully! Logging you in...");
      
      // Auto login after registration
      const signInResult = await signIn("credentials", {
        redirect: false,
        email: values.email,
        password: values.password,
      });

      if (signInResult?.error) {
        router.push("/auth/login");
      } else {
        router.push("/profile");
        router.refresh();
      }
    } catch (error: any) {
      message.error(error.message || "An error occurred during registration");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[#0a0a0a]">
      <Card className="w-full max-w-md shadow-lg rounded-xl">
        <div className="text-center mb-8">
          <Title level={2} className="m-0">Create Account</Title>
          <Text type="secondary">Join ApplyCopilot to automate your job search</Text>
        </div>

        <Form
          name="register_form"
          onFinish={onFinish}
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="name"
            rules={[{ required: true, message: 'Please input your full name!' }]}
          >
            <Input prefix={<UserOutlined className="text-gray-400" />} placeholder="Full Name" />
          </Form.Item>

          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Please input your email!' },
              { type: 'email', message: 'Please enter a valid email!' }
            ]}
          >
            <Input prefix={<MailOutlined className="text-gray-400" />} placeholder="Email address" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: 'Please input your password!' },
              { min: 8, message: 'Password must be at least 8 characters' }
            ]}
          >
            <Input.Password
              prefix={<LockOutlined className="text-gray-400" />}
              placeholder="Password"
            />
          </Form.Item>

          <Form.Item className="mt-6 mb-2">
            <Button type="primary" htmlType="submit" className="w-full" loading={loading}>
              Create Account
            </Button>
          </Form.Item>

          <Divider plain>
            <Text type="secondary" className="text-sm">Already have an account?</Text>
          </Divider>

          <div className="text-center">
            <Link href="/auth/login">
              <Button type="default" className="w-full">
                Sign in instead
              </Button>
            </Link>
          </div>
        </Form>
      </Card>
    </div>
  );
}
