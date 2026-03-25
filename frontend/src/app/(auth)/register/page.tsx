'use client'

import { Card, Form, Input, Button, Typography, message, Divider } from 'antd'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRegister } from '@/hooks/use-auth-query'
import { User, Mail, Lock, CheckCircle2, ArrowRight } from 'lucide-react'

const { Title, Paragraph, Text } = Typography

export default function RegisterPage() {
  const [form] = Form.useForm()
  const router = useRouter()
  const registerMutation = useRegister()

  const onFinish = async (values: any) => {
    try {
      await registerMutation.mutateAsync(values)
      message.success('Account created successfully!')
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
        <div className="text-center mb-8">
          <h2 className="text-3xl font-black tracking-tight text-white mb-2">Create Account</h2>
          <Paragraph className="text-slate-400 text-sm font-medium">
             Start your 14-day premium trial today.
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
            name="full_name"
            rules={[
              { required: true, message: 'Please enter your full name' },
              { min: 2, message: 'Name must be at least 2 characters' },
            ]}
          >
            <Input 
                prefix={<User size={16} className="text-slate-500 mr-2" />} 
                placeholder="Full Name" 
                className="h-12 !bg-white/5 !border-white/10 !rounded-xl !text-white placeholder:text-slate-600 hover:!border-primary focus:!border-primary transition-all"
            />
          </Form.Item>
          
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Please enter your email' },
              { type: 'email', message: 'Please enter a valid email' },
            ]}
          >
            <Input 
                prefix={<Mail size={16} className="text-slate-500 mr-2" />} 
                placeholder="Work Email" 
                className="h-12 !bg-white/5 !border-white/10 !rounded-xl !text-white placeholder:text-slate-600 hover:!border-primary focus:!border-primary transition-all"
            />
          </Form.Item>
          
          <Form.Item
            name="password"
            rules={[
              { required: true, message: 'Please enter your password' },
              { min: 6, message: 'Password must be at least 6 characters' },
            ]}
          >
            <Input.Password 
                prefix={<Lock size={16} className="text-slate-500 mr-2" />} 
                placeholder="Create Password" 
                className="h-12 !bg-white/5 !border-white/10 !rounded-xl !text-white placeholder:text-slate-600 hover:!border-primary-500 group-hover:!border-primary transition-all"
            />
          </Form.Item>
          
          <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 mb-6">
             <div className="flex items-start gap-3">
                 <CheckCircle2 size={16} className="text-primary mt-0.5 shrink-0" />
                 <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                    By joining, you agree to our <span className="text-primary hover:underline cursor-pointer">Terms</span> and <span className="text-primary hover:underline cursor-pointer">Privacy Policy</span>. We'll never share your data.
                 </p>
             </div>
          </div>

          <Form.Item className="mb-0">
            <Button
              type="primary"
              htmlType="submit"
              loading={registerMutation.isPending}
              block
              className="h-14 !rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              Sign Up <ArrowRight size={16} />
            </Button>
          </Form.Item>
        </Form>
        
        <Divider className="!border-white/5 my-8">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Already a Member?</span>
        </Divider>

        <div className="text-center">
            <Link href="/login" className="text-sm font-bold text-white hover:text-primary transition-all flex items-center justify-center gap-2 group">
              Login to your account <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </Link>
        </div>
      </Card>
    </div>
  )
}
