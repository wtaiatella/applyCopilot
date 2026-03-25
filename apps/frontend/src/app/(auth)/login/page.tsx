'use client'

import { Card, Form, Input, Button, Typography, message, Divider } from 'antd'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLogin } from '@/hooks/use-auth-query'
import { Mail, Lock, ArrowRight, Chrome } from 'lucide-react'

const { Title, Paragraph, Text } = Typography

export default function LoginPage() {
  const [form] = Form.useForm()
  const router = useRouter()
  const loginMutation = useLogin()

  const onFinish = async (values: any) => {
    try {
      await loginMutation.mutateAsync(values)
      message.success('Welcome back!')
      router.push('/dashboard')
    } catch (error) {
      // Error is already handled by the mutation
    }
  }

  return (
    <div className="relative group transition-all duration-500">
      {/* Glow effect behind card */}
      <div className="absolute -inset-1 bg-gradient-to-r from-primary to-blue-600 rounded-[32px] blur opacity-10 group-hover:opacity-25 transition duration-1000"></div>
      
      <Card className="!bg-[#0f172a]/70 !backdrop-blur-xl !border-white/5 !rounded-[32px] shadow-2xl p-4 sm:p-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-black tracking-tight text-white mb-2">Welcome Back</h2>
          <Paragraph className="text-slate-400 text-sm font-medium">
             Enter your credentials to access your dashboard.
          </Paragraph>
        </div>
        
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          autoComplete="off"
          requiredMark={false}
          className="space-y-4"
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
          >
            <Input 
                prefix={<Mail size={16} className="text-slate-500 mr-2" />} 
                placeholder="Email Address" 
                className="h-12 !bg-white/5 !border-white/10 !rounded-xl !text-white placeholder:text-slate-600 hover:!border-primary focus:!border-primary transition-all"
            />
          </Form.Item>
          
          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please enter your password' }]}
          >
            <div className="flex flex-col gap-1">
                <Input.Password 
                    prefix={<Lock size={16} className="text-slate-500 mr-2" />} 
                    placeholder="Password" 
                    className="h-12 !bg-white/5 !border-white/10 !rounded-xl !text-white placeholder:text-slate-600 hover:!border-primary transition-all"
                />
                <div className="flex justify-end mt-2">
                    <Link href="#" className="text-[10px] font-bold text-slate-500 hover:text-white uppercase tracking-widest transition-all">
                        Forgot Password?
                    </Link>
                </div>
            </div>
          </Form.Item>
          
          <Button
            type="primary"
            htmlType="submit"
            loading={loginMutation.isPending}
            block
            className="h-14 !rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4"
          >
            Sign In <ArrowRight size={16} />
          </Button>

          <Button
            block
            className="h-14 !bg-white/5 !border-white/10 !rounded-xl text-sm font-bold text-white hover:!bg-white/10 hover:!border-white/20 transition-all flex items-center justify-center gap-3 mt-4"
          >
            <Chrome size={18} /> Sign in with Google
          </Button>
        </Form>
        
        <Divider className="!border-white/5 my-10">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">New around here?</span>
        </Divider>

        <div className="text-center">
            <Link href="/register" className="text-sm font-bold text-white hover:text-primary transition-all flex items-center justify-center gap-2 group">
              Join ApplyCopilot community <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </Link>
        </div>
      </Card>
    </div>
  )
}
