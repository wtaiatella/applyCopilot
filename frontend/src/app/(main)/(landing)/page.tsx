'use client';
import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { 
  Rocket, 
  Target, 
  FileText, 
  BarChart3, 
  Sparkles, 
  ArrowRight, 
  Globe2, 
  Zap,
  CheckCircle2,
  Users,
  TrendingUp,
  Search,
  Bot
} from "lucide-react";
import { Button, ConfigProvider, theme } from "antd";

const features = [
  { icon: Target, title: "Smart Job Matching", desc: "AI analyzes your skills and experience to find the best-fit remote opportunities worldwide." },
  { icon: FileText, title: "Tailored CVs", desc: "Generate customized resumes and cover letters optimized for each specific application." },
  { icon: BarChart3, title: "Deep Analysis", desc: "Get detailed compatibility scores and actionable suggestions to improve your profile." },
  { icon: Sparkles, title: "Application Tracking", desc: "Manage your entire pipeline from discovery to offer with a visual Kanban dashboard." },
];

const stats = [
  { value: "10K+", label: "Jobs Analyzed Daily", accent: "text-primary" },
  { value: "85%", label: "Match Accuracy", accent: "text-blue-500" },
  { value: "3x", label: "Faster Applications", accent: "text-purple-500" },
  { value: "50+", label: "Countries Covered", accent: "text-emerald-500" },
];

const steps = [
  { step: "01", title: "Build Your Profile", desc: "Add your skills, experience, and preferences. Our AI builds a detailed neural profile." },
  { step: "02", title: "Discover Opportunities", desc: "Our crawler scans top job portals to find remote positions matching your profile." },
  { step: "03", title: "Analyze & Optimize", desc: "Get detailed match scores and tailored suggestions to refine your pitch for each job." },
  { step: "04", title: "Apply & Track", desc: "Submit optimized applications and track progress from your central control hub." },
];

const benefits = [
  "Smart matching based on skills & culture fit",
  "Tailored CVs for every application",
  "Live application pipeline tracking",
  "AI-generated cover letters that stand out",
  "Global remote job discovery crawler",
  "Comprehensive profile compatibility scores",
];

export default function LandingPage() {
  const { token } = theme.useToken();

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <div className="min-h-screen bg-[#020617] text-slate-200 selection:bg-primary/30">
        {/* Navigation */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-[#020617]/70 backdrop-blur-xl border-b border-white/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/20">
                <Rocket className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-xl tracking-tight text-white">
                Apply<span className="text-primary italic">Copilot</span>
              </span>
            </div>
            
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
              <Link href="#features" className="hover:text-white transition-colors">Features</Link>
              <Link href="#how-it-works" className="hover:text-white transition-colors">How it works</Link>
              <Link href="#benefits" className="hover:text-white transition-colors">Why us?</Link>
            </div>

            <div className="flex items-center gap-4">
              <Link href="/login" className="hidden sm:block text-sm font-medium text-slate-400 hover:text-white transition-colors">
                Log In
              </Link>
              <Link href="/register">
                <Button type="primary" size="large" className="rounded-full px-6 font-semibold">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="relative pt-32 pb-24 overflow-hidden">
          {/* Background Orbs */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-6xl h-full -z-10 opacity-30 pointer-events-none">
            <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-primary/20 rounded-full blur-[120px]" />
            <div className="absolute top-20 right-1/4 w-[350px] h-[350px] bg-blue-600/20 rounded-full blur-[100px]" />
          </div>

          <div className="max-w-7xl mx-auto px-4 text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300 text-sm font-medium mb-10">
                <Globe2 className="w-4 h-4 text-primary" />
                <span>The first job search copilot for Developers</span>
              </div>
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[1.05] text-white mb-8">
                Land your dream
                <br />
                <span className="bg-gradient-to-r from-primary via-blue-400 to-emerald-400 bg-clip-text text-transparent">
                  remote job with AI
                </span>
              </h1>
              <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
                ApplyCopilot automates remote job discovery, CV personalization, and 
                application tracking. Spend less time hunting, more time interviewing.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
                <Link href="/register">
                  <Button type="primary" size="large" className="h-14 px-10 text-lg rounded-2xl shadow-2xl shadow-primary/25">
                    Start Your Search <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="#how-it-works">
                  <Button type="default" size="large" ghost className="h-14 px-10 text-lg rounded-2xl border-white/20 hover:border-white text-white">
                    See How It Works
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Stats Grid */}
        <section className="py-20 px-4 relative">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-white/5 border border-white/10 rounded-3xl p-8 text-center backdrop-blur-sm group hover:border-primary/50 transition-all duration-300"
                >
                  <div className={`text-4xl md:text-5xl font-black mb-3 ${stat.accent}`}>
                    {stat.value}
                  </div>
                  <div className="text-sm font-medium text-slate-500 uppercase tracking-widest leading-none">
                    {stat.label}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 px-4 bg-[#020617]">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6">
                Everything to <span className="text-primary">accelerate your career</span>
              </h2>
              <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                No more repetitive copy-pasting. Our AI agent takes care of the pipeline.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="group p-8 rounded-3xl bg-[#0f172a]/50 border border-white/[0.05] hover:border-primary/20 hover:bg-white/[0.02] transition-all duration-300"
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary text-primary group-hover:text-white transition-all duration-300">
                    <f.icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-4">{f.title}</h3>
                  <p className="text-slate-400 leading-relaxed text-sm">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-24 px-4 bg-white/2 relative">
          <div className="max-w-5xl mx-auto">
            <div className="grid lg:grid-cols-5 gap-16 items-center">
              <div className="lg:col-span-2">
                <h2 className="text-4xl font-bold text-white mb-8">
                  Get hired in <span className="text-blue-400">4 simple steps</span>
                </h2>
                <div className="space-y-12">
                  {steps.map((s, i) => (
                    <motion.div
                      key={s.step}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                      className="flex gap-6"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-blue-600 text-white flex shrink-0 items-center justify-center font-bold text-sm shadow-lg shadow-primary/20">
                        {s.step}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white mb-2">{s.title}</h3>
                        <p className="text-slate-400 text-sm leading-relaxed">{s.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
              
              <div className="lg:col-span-3">
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-primary to-blue-600 rounded-3xl blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
                  <div className="relative bg-[#0f172a] border border-white/10 rounded-3xl p-8 shadow-2xl overflow-hidden">
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-3">
                        <Bot className="w-6 h-6 text-primary" />
                        <span className="text-sm font-semibold text-white tracking-wide">MATCH ANALYZER</span>
                      </div>
                      <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                        95% ACCURACY
                      </div>
                    </div>
                    
                    <div className="space-y-6">
                      <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                        <div className="flex items-center gap-3 mb-2">
                          <Zap className="w-4 h-4 text-emerald-400" />
                          <span className="text-sm font-medium text-white">Senior Software Engineer</span>
                        </div>
                        <p className="text-xs text-slate-500 ml-7">Stripe • Remote Worldwide</p>
                      </div>

                      <div className="space-y-4">
                        {[
                          { label: "Technical Compatibility", val: 98, color: "bg-primary" },
                          { label: "Stack Similarity", val: 84, color: "bg-blue-400" },
                          { label: "Culture Match", val: 92, color: "bg-emerald-400" }
                        ].map(item => (
                          <div key={item.label} className="space-y-2">
                             <div className="flex justify-between text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                              <span>{item.label}</span>
                              <span className="text-white font-mono">{item.val}%</span>
                             </div>
                             <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  whileInView={{ width: `${item.val}%` }}
                                  viewport={{ once: true }}
                                  transition={{ duration: 1, delay: 0.5 }}
                                  className={`h-full ${item.color}`}
                                />
                             </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-8 pt-8 border-t border-white/5 flex gap-3">
                      <Button type="primary" className="flex-1 h-12 rounded-xl text-sm font-bold">Apply Automatically</Button>
                      <Button type="default" ghost className="h-12 border-white/10 rounded-xl text-white">Analyze Jobs</Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section id="benefits" className="py-24 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-4xl md:text-5xl font-black text-white leading-tight mb-8">
                  Why Developers <br /> Choose <span className="text-primary">ApplyCopilot</span>
                </h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {benefits.map((b, i) => (
                    <motion.div 
                      key={b}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:border-primary/20 transition-all cursor-default"
                    >
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <span className="text-sm font-medium text-slate-300">{b}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
              
              <div className="relative">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="p-6 rounded-3xl bg-blue-600/10 border border-blue-500/20 text-center">
                      <Users className="w-8 h-8 text-blue-400 mx-auto mb-3" />
                      <div className="text-3xl font-bold text-white mb-1">50K+</div>
                      <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Total Users</div>
                    </div>
                    <div className="p-6 rounded-3xl bg-purple-600/10 border border-purple-500/20 text-center">
                      <Zap className="w-8 h-8 text-purple-400 mx-auto mb-3" />
                      <div className="text-3xl font-bold text-white mb-1">1M+</div>
                      <div className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Jobs Tracked</div>
                    </div>
                  </div>
                  <div className="space-y-4 translate-y-8">
                    <div className="p-6 rounded-3xl bg-emerald-600/10 border border-emerald-500/20 text-center">
                      <TrendingUp className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                      <div className="text-3xl font-bold text-white mb-1">82%</div>
                      <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Success Rate</div>
                    </div>
                    <div className="p-6 rounded-3xl bg-primary/10 border border-primary/20 text-center">
                      <Search className="w-8 h-8 text-primary mx-auto mb-3" />
                      <div className="text-3xl font-bold text-white mb-1">200K+</div>
                      <div className="text-[10px] font-bold text-primary uppercase tracking-widest">Offers Landed</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 px-4 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[180px] -z-10" />
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="p-16 rounded-[48px] bg-gradient-to-br from-primary via-primary/90 to-blue-700 relative border border-white/20 shadow-2xl shadow-primary/20 overflow-hidden"
            >
              {/* Decorative elements */}
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-black/10 rounded-full blur-3xl" />
              
              <Rocket className="w-16 h-16 text-white/50 mx-auto mb-8 animate-bounce" />
              <h2 className="text-4xl md:text-5xl font-black text-white mb-6 leading-tight">
                Ready to accelerate <br /> your next career move?
              </h2>
              <p className="text-white/80 text-lg mb-12 max-w-xl mx-auto font-medium leading-relaxed">
                Join thousands of developers using ApplyCopilot to land high-paying 
                remote jobs worldwide.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                <Link href="/register">
                  <Button type="default" size="large" className="h-16 px-12 text-lg font-bold rounded-2xl bg-white text-primary border-none hover:bg-slate-100 transition-all flex items-center justify-center">
                    Get Started Free <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/dashboard" className="text-white font-bold hover:underline transition-all">
                  Try Demo Dashboard
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 px-4 border-t border-white/5 bg-[#020617]">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex items-center gap-3">
                <Rocket className="w-6 h-6 text-primary" />
                <span className="font-bold text-lg text-white">ApplyCopilot</span>
              </div>
              
              <div className="flex items-center gap-8 text-sm font-medium text-slate-500">
                <Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link>
                <Link href="#" className="hover:text-white transition-colors">Terms of Service</Link>
                <Link href="#" className="hover:text-white transition-colors">Support</Link>
              </div>

              <div className="text-sm text-slate-500 font-mono">
                © 2026 APPLYCOPILOT. BE UNSTOPPABLE.
              </div>
            </div>
          </div>
        </footer>
      </div>
    </ConfigProvider>
  );
}
