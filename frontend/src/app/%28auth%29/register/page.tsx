"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Form, Input, Button, message } from "antd";
import { Mail, Lock, UserPlus } from "lucide-react";

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
        <h2 className="mt-6 text-3xl font-extrabold text-white">Create your account</h2>
        <p className="mt-2 text-sm text-slate-400">
          Or{" "}
          <Link href="/login" className="font-medium text-blue-500 hover:text-blue-400 hover:underline">
            sign in to your existing account
          </Link>
        </p>
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
          label={<span className="text-slate-300">Password</span>}
          rules={[
            { required: true, message: "Please enter a password" },
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
          label={<span className="text-slate-300">Confirm Password</span>}
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
            Sign Up
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
