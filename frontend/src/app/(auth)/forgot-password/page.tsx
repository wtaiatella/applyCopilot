"use client";

import { useState } from "react";
import Link from "next/link";
import { Form, Input, Button, message, Typography } from "antd";
import { Mail, KeyRound, ArrowLeft } from "lucide-react";

const { Title, Text } = Typography;

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const onFinish = async (values: { email: string }) => {
    setLoading(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: values.email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to submit request");
      }

      setSubmitted(true);
      message.success("Reset link generated successfully!");
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : "Something went wrong. Please try again.";
      message.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10 text-green-400 border border-green-500/20">
          <Mail className="h-6 w-6" />
        </div>
        <Title level={2} className="!mt-6 !mb-4 !text-white">
          Check your email
        </Title>
        <Text className="block text-sm leading-relaxed mb-8">
          If that email address exists in our database, we have sent a password reset link to it. Please check your inbox (and spam folder).
        </Text>
        <div>
          <Link href="/login" passHref legacyBehavior>
            <Typography.Link className="inline-flex items-center gap-2 text-sm font-semibold">
              <ArrowLeft className="h-4 w-4" />
              Back to login
            </Typography.Link>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Title Header */}
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10 text-blue-400 border border-blue-500/20">
          <KeyRound className="h-6 w-6" />
        </div>
        <Title level={2} className="!mt-6 !mb-2 !text-white">
          Forgot Password?
        </Title>
        <Text type="secondary" className="block text-sm">
          Enter your email address and we will send you a secure link to reset your password.
        </Text>
      </div>

      {/* Forgot Password Form */}
      <Form
        name="forgot-password"
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

        <Form.Item className="mb-0">
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            size="large"
            className="w-full font-semibold"
          >
            Send Reset Link
          </Button>
        </Form.Item>

        <div className="text-center mt-4">
          <Link href="/login" passHref legacyBehavior>
            <Typography.Link className="inline-flex items-center gap-2 text-sm font-semibold">
              <ArrowLeft className="h-4 w-4" />
              Back to login
            </Typography.Link>
          </Link>
        </div>
      </Form>
    </div>
  );
}
