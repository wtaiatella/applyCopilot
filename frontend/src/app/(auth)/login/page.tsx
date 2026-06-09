"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Form, Input, Button, message, Typography } from "antd";
import { Mail, Lock, LogIn } from "lucide-react";

const { Title, Text } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onFinish = async (values: Record<string, string>) => {
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
      });

      if (result?.error) {
        throw new Error("Invalid email or password");
      }

      message.success("Logged in successfully! Redirecting...");
      router.push("/dashboard");
      router.refresh();
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : "Failed to log in. Please try again.";
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
          <LogIn className="h-6 w-6" />
        </div>
        <Title level={2} className="!mt-6 !mb-2 !text-white">
          Welcome back
        </Title>
        <Text type="secondary" className="block text-sm">
          Or{" "}
          <Link href="/register" passHref legacyBehavior>
            <Typography.Link>
              create a new account
            </Typography.Link>
          </Link>
        </Text>
      </div>

      {/* Login Form */}
      <Form
        name="login"
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
          label={
            <div className="flex w-full justify-between items-center">
              <span>Password</span>
              <Link href="/forgot-password" passHref legacyBehavior>
                <Typography.Link className="text-xs">
                  Forgot password?
                </Typography.Link>
              </Link>
            </div>
          }
          rules={[{ required: true, message: "Please enter your password" }]}
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
            Log In
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
