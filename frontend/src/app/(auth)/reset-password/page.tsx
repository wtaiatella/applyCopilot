"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Form, Input, Button, message, Typography } from "antd";
import { Lock, ShieldCheck, ArrowLeft } from "lucide-react";

const { Title, Text } = Typography;

function ResetPasswordForm() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const onFinish = async (values: Record<string, string>) => {
    if (!token) {
      message.error("Reset token is missing from the link");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          password: values.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to reset password");
      }

      message.success("Password reset successfully! Redirecting to login...");
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

  if (!token) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
          <Lock className="h-6 w-6" />
        </div>
        <Title level={2} className="!mt-6 !text-white">
          Invalid Reset Link
        </Title>
        <Text className="block text-sm leading-relaxed mt-4">
          The password reset token is missing or invalid. Please request a new password reset link.
        </Text>
        <div className="mt-8">
          <Link href="/forgot-password" passHref legacyBehavior>
            <Typography.Link className="inline-flex items-center gap-2 text-sm font-semibold">
              Request new link
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
          <ShieldCheck className="h-6 w-6" />
        </div>
        <Title level={2} className="!mt-6 !mb-2 !text-white">
          Reset Password
        </Title>
        <Text type="secondary" className="block text-sm">
          Please enter and confirm your new secure password below.
        </Text>
      </div>

      {/* Reset Password Form */}
      <Form
        name="reset-password"
        layout="vertical"
        onFinish={onFinish}
        requiredMark={false}
        className="mt-8 space-y-6"
      >
        <Form.Item
          name="password"
          label="New Password"
          rules={[
            { required: true, message: "Please enter your new password" },
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
          label="Confirm New Password"
          dependencies={["password"]}
          rules={[
            { required: true, message: "Please confirm your new password" },
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
            Reset Password
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="text-center text-slate-400">Loading reset form...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
