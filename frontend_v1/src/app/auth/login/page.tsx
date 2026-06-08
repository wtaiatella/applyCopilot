"use client";

import React, { useState } from "react";
import { Form, Input, Button, Card, Typography, Divider, App } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const { Title, Text } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { message } = App.useApp();

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: values.email,
        password: values.password,
      });

      if (result?.error) {
        message.error("Invalid email or password");
      } else {
        message.success("Logged in successfully");
        router.push("/dashboard");
        router.refresh();
      }
    } catch (error) {
      message.error("An error occurred during login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[#0a0a0a]">
      <Card className="w-full max-w-md shadow-lg rounded-xl">
        <div className="text-center mb-8">
          <Title level={2} className="m-0">Welcome Back</Title>
          <Text type="secondary">Sign in to ApplyCopilot</Text>
        </div>

        <Form
          name="login_form"
          initialValues={{ remember: true }}
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
            <Input prefix={<UserOutlined className="text-gray-400" />} placeholder="Email address" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please input your password!' }]}
          >
            <Input.Password
              prefix={<LockOutlined className="text-gray-400" />}
              placeholder="Password"
            />
          </Form.Item>

          <div className="flex justify-between items-center mb-6">
            <Link href="/auth/forgot-password" className="text-blue-500 hover:text-blue-400">
              Forgot your password?
            </Link>
          </div>

          <Form.Item className="mb-2">
            <Button type="primary" htmlType="submit" className="w-full" loading={loading}>
              Sign In
            </Button>
          </Form.Item>

          <Divider plain>
            <Text type="secondary" className="text-sm">Don't have an account?</Text>
          </Divider>

          <div className="text-center">
            <Link href="/auth/register">
              <Button type="default" className="w-full">
                Create an account
              </Button>
            </Link>
          </div>
        </Form>
      </Card>
    </div>
  );
}
