'use client';
import React from 'react';
import { Bot, Search, FileText, Send, AlertCircle, Clock } from 'lucide-react';

type ActivityType = 'discovery' | 'analysis' | 'cv-gen' | 'applied' | 'alert' | 'pending';

interface ActivityItem {
    id: string;
    type: ActivityType;
    message: string;
    detail: string;
    time: string;
    status: 'success' | 'warning' | 'info' | 'pending';
}

const activities: ActivityItem[] = [
    {
        id: 'act-001',
        type: 'discovery',
        message: 'Scraped 47 new jobs',
        detail: 'LinkedIn · Greenhouse · Lever · Ashby',
        time: '4 min ago',
        status: 'success',
    },
    {
        id: 'act-002',
        type: 'analysis',
        message: 'Analyzed Senior Frontend @ Vercel',
        detail: 'Match score: 94% · 3 CV suggestions generated',
        time: '12 min ago',
        status: 'success',
    },
    {
        id: 'act-003',
        type: 'cv-gen',
        message: 'Generated tailored CV',
        detail: 'Staff Software Engineer @ Stripe · v2.1',
        time: '28 min ago',
        status: 'success',
    },
    {
        id: 'act-004',
        type: 'applied',
        message: 'Application submitted',
        detail: 'Full Stack Engineer @ Linear · cover letter included',
        time: '1h ago',
        status: 'success',
    },
    {
        id: 'act-005',
        type: 'alert',
        message: 'Low match score batch detected',
        detail: '14 jobs below 45% — profile gap in DevOps skills',
        time: '2h ago',
        status: 'warning',
    },
    {
        id: 'act-006',
        type: 'pending',
        message: 'Awaiting CV approval',
        detail: 'Software Engineer II @ Figma · 2 edits suggested',
        time: '3h ago',
        status: 'pending',
    },
];

const typeConfig: Record<ActivityType, { icon: React.ElementType; color: string; bg: string }> = {
    discovery: { icon: Search, color: 'text-accent', bg: 'bg-accent/10' },
    analysis: { icon: Bot, color: 'text-primary', bg: 'bg-primary/10' },
    'cv-gen': { icon: FileText, color: 'text-purple-400', bg: 'bg-purple-400/10' },
    applied: { icon: Send, color: 'text-positive', bg: 'bg-positive/10' },
    alert: { icon: AlertCircle, color: 'text-warning', bg: 'bg-warning/10' },
    pending: { icon: Clock, color: 'text-text-muted', bg: 'bg-surface-elevated' },
};

const statusDot: Record<string, string> = {
    success: 'bg-positive',
    warning: 'bg-warning',
    info: 'bg-info',
    pending: 'bg-text-muted',
};

export default function AIActivityFeed() {
    return (
        <div className="bg-surface border border-border-default rounded-card p-5 h-full">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-base font-semibold text-text-primary">AI Agent Activity</h2>
                    <p className="text-xs text-text-muted mt-0.5">Real-time agent log</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
                    <span className="text-xs text-positive font-medium">Live</span>
                </div>
            </div>

            <div className="space-y-1 max-h-[360px] overflow-y-auto scrollbar-thin pr-1 custom-scrollbar">
                {activities.map((item) => {
                    const config = typeConfig[item.type];
                    const TypeIcon = config.icon;
                    return (
                        <div
                            key={item.id}
                            className="flex items-start gap-4 p-2.5 rounded-btn hover:bg-surface-elevated transition-colors duration-150 border border-transparent hover:border-white/5"
                        >
                            <div className={`p-2 rounded-btn shrink-0 mt-0.5 ${config.bg}`}>
                                <TypeIcon size={12} className={config.color} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-text-primary truncate">{item.message}</p>
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[item.status]}`} />
                                </div>
                                <p className="text-[11px] text-text-muted mt-0.5 truncate leading-relaxed">{item.detail}</p>
                            </div>
                            <span className="text-[10px] text-text-secondary font-mono shrink-0 mt-1 opacity-60 tracking-tight">{item.time}</span>
                        </div>
                    );
                })}
            </div>
            
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.1);
                }
            `}</style>
        </div>
    );
}
