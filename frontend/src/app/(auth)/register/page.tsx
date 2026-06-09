"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Form, Input, Button, message, Typography } from "antd";
import { Mail, Lock, UserPlus } from "lucide-react";

const { Title, Text } = Typography;

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [form] = Form.useForm();

  const onFinish = async (values: Record<string, string>) => {
    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Registration failed");
      }

      message.success("Account created successfully! Redirecting to login...");
      form.resetFields();
      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : "Something went wrong. Please try again.";
      message.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Title Header */}
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10 text-blue-400 border border-blue-500/20">
          <UserPlus className="h-6 w-6" />
        </div>
        <Title level={2} className="!mt-6 !mb-2 !text-white">
          Create your account
        </Title>
        <Text type="secondary" className="block text-sm">
          Or{" "}
          <Link href="/login" passHref legacyBehavior>
            <Typography.Link>
              sign in to your existing account
            </Typography.Link>
          </Link>
        </Text>
      </div>

      {/* Register Form */}
      <Form
        form={form}
        name="register"
        layout="vertical"
        onFinish={onFinish}
        requiredMark={false}
        className="mt-8 space-y-6"
      >
        <Form.Item
          name="email"
          label="Email Address"
          rules={[
            { required: true, message: "Please enter your email address" },
            { type: "email", message: "Please enter a valid email address" },
          ]}
        >
          <Input
            prefix={<Mail className="h-4 w-4 mr-2" />}
            placeholder="you@example.com"
            size="large"
          />
        </Form.Item>

        <Form.Item
          name="password"
          label="Password"
          rules={[
            { required: true, message: "Please enter a password" },
            { min: 6, message: "Password must be at least 6 characters" },
          ]}
        >
          <Input.Password
            prefix={<Lock className="h-4 w-4 mr-2" />}
            placeholder="••••••••"
            size="large"
          />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          label="Confirm Password"
          dependencies={["password"]}
          rules={[
            { required: true, message: "Please confirm your password" },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue("password") === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error("The two passwords that you entered do not match"));
              },
            }),
          ]}
        >
          <Input.Password
            prefix={<Lock className="h-4 w-4 mr-2" />}
            placeholder="••••••••"
            size="large"
          />
        </Form.Item>

        <Form.Item className="mb-0">
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            size="large"
            className="w-full font-semibold"
          >
            Sign Up
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
