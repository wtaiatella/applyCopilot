'use client';
import React from 'react';
import DashboardKPIs from './components/DashboardKPIs';
import DashboardCharts from './components/DashboardCharts';
import TopMatchedJobs from './components/TopMatchedJobs';
import AIActivityFeed from './components/AIActivityFeed';
import PipelineSummary from './components/PipelineSummary';
import { Button } from 'antd';
import { Rocket, RefreshCw } from 'lucide-react';

export default function DashboardPage() {
    return (
        <div className="space-y-8 pb-12">
            {/* Header / Top Action Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-white mb-1 uppercase tracking-widest">
                        Command Center
                    </h1>
                    <p className="text-xs text-text-muted font-medium flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        AI Agent Active · Last synced 4 min ago
                    </p>
                </div>
                
                <div className="flex items-center gap-3">
                    <Button 
                        type="default" 
                        ghost 
                        className="h-11 border-white/5 bg-white/5 text-white/60 hover:text-white hover:border-white/20 transition-all text-xs font-bold uppercase tracking-wider px-6 rounded-xl flex items-center gap-2"
                    >
                        <RefreshCw size={14} /> Sync Status
                    </Button>
                    <Button 
                        type="primary" 
                        className="h-11 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all text-xs font-black uppercase tracking-widest px-8 rounded-xl flex items-center gap-2"
                    >
                        <Rocket size={14} className="fill-white" /> Run Discovery
                    </Button>
                </div>
            </div>

            {/* Main KPI Stats */}
            <DashboardKPIs />

            {/* Activity Chart + Overall Pipeline */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <DashboardCharts />
                </div>
                <div>
                    <PipelineSummary />
                </div>
            </div>

            {/* Bottom Section - Targeted Feed and Top Matches */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <TopMatchedJobs />
                 <AIActivityFeed />
            </div>
            
            {/* Decorative BG element */}
            <div className="fixed -bottom-24 -right-24 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none -z-10" />
        </div>
    );
}
