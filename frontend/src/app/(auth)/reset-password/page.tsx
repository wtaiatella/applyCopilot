"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Form, Input, Button, message } from "antd";
import { Lock, ShieldCheck, ArrowLeft } from "lucide-react";

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
        <h2 className="mt-6 text-2xl font-extrabold text-white">Invalid Reset Link</h2>
        <p className="mt-4 text-sm text-slate-400 leading-relaxed">
          The password reset token is missing or invalid. Please request a new password reset link.
        </p>
        <div className="mt-8">
          <Link
            href="/forgot-password"
            className="inline-flex items-center gap-2 text-sm font-semibold text-blue-500 hover:text-blue-400 hover:underline"
          >
            Request new link
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
        <h2 className="mt-6 text-3xl font-extrabold text-white">Reset Password</h2>
        <p className="mt-2 text-sm text-slate-400">
          Please enter and confirm your new secure password below.
        </p>
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
          label={<span className="text-slate-300">New Password</span>}
          rules={[
            { required: true, message: "Please enter your new password" },
            { min: 6, message: "Password must be at least 6 characters" },
          ]}
        >
          <Input.Password
            prefix={<Lock className="h-4 w-4 text-slate-500 mr-2" />}
            placeholder="••••••••"
            size="large"
            className="bg-slate-900 border-slate-800 text-white placeholder-slate-500 hover:border-slate-700 focus:border-blue-500 focus:shadow-none"
          />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          label={<span className="text-slate-300">Confirm New Password</span>}
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
            Reset Password
          </Button>
        </Form.Item>

        <div className="text-center mt-4">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to login
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
