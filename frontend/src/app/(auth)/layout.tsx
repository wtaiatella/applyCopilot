'use client'

import { usePublicOnly } from '@/hooks/use-auth'
import { Spin, ConfigProvider, theme } from 'antd'
import { Rocket } from 'lucide-react'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { isLoading } = usePublicOnly()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020617]">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <div className="min-h-screen bg-[#020617] text-slate-200 selection:bg-primary/30 relative overflow-hidden flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        {/* Background Decorations */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-full -z-10 opacity-20 pointer-events-none">
            <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-primary/20 rounded-full blur-[120px]" />
            <div className="absolute bottom-0 right-1/4 w-[350px] h-[350px] bg-blue-600/20 rounded-full blur-[100px]" />
        </div>
        
        <div className="w-full max-w-md relative z-10">
            {/* Logo area */}
            <div className="flex flex-col items-center mb-10">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-xl shadow-primary/20 mb-4 animate-pulse">
                    <Rocket className="w-6 h-6 text-white" />
                </div>
                <h1 className="font-black text-2xl tracking-tighter text-white uppercase italic">
                    Apply<span className="text-primary">Copilot</span>
                </h1>
            </div>
            
            {children}
            
            {/* Footer micro-copy */}
            <p className="mt-12 text-center text-[10px] font-bold text-slate-600 uppercase tracking-widest leading-loose">
                BE UNSTOPPABLE • JOIN THE ELITE <br />
                © 2026 APPLYCOPILOT INC.
            </p>
        </div>

        {/* Floating gradient effect top right */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none -z-10" />
      </div>
    </ConfigProvider>
  )
}
