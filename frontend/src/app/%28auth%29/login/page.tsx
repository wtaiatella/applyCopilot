"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Form, Input, Button, message } from "antd";
import { Mail, Lock, LogIn } from "lucide-react";

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
        <h2 className="mt-6 text-3xl font-extrabold text-white">Welcome back</h2>
        <p className="mt-2 text-sm text-slate-400">
          Or{" "}
          <Link href="/register" className="font-medium text-blue-500 hover:text-blue-400 hover:underline">
            create a new account
          </Link>
        </p>
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
          label={<span className="text-slate-300">Email Address</span>}
          rules={[
            { required: true, message: "Please enter your email address" },
            { type: "email", message: "Please enter a valid email address" },
          ]}
        >
          <Input
            prefix={<Mail className="h-4 w-4 text-slate-500 mr-2" />}
            placeholder="you@example.com"
            size="large"
            className="bg-slate-900 border-slate-800 text-white placeholder-slate-500 hover:border-slate-700 focus:border-blue-500 focus:shadow-none"
          />
        </Form.Item>

        <Form.Item
          name="password"
          label={
            <div className="flex w-full justify-between items-center">
              <span className="text-slate-300">Password</span>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-blue-500 hover:text-blue-400 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          }
          rules={[{ required: true, message: "Please enter your password" }]}
        >
          <Input.Password
            prefix={<Lock className="h-4 w-4 text-slate-500 mr-2" />}
            placeholder="••••••••"
            size="large"
            className="bg-slate-900 border-slate-800 text-white placeholder-slate-500 hover:border-slate-700 focus:border-blue-500 focus:shadow-none"
          />
        </Form.Item>

        <Form.Item className="mb-0">
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            size="large"
            className="w-full bg-blue-600 border-none hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/20 active:scale-[0.98] transition-all font-semibold"
          >
            Log In
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
