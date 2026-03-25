'use client';
import React, { useState } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, } from 'recharts';

const applicationActivityData = [
    { day: 'Mar 10', discovered: 38, applied: 4, interviews: 1 },
    { day: 'Mar 11', discovered: 52, applied: 2, interviews: 0 },
    { day: 'Mar 12', discovered: 41, applied: 5, interviews: 2 },
    { day: 'Mar 13', discovered: 29, applied: 3, interviews: 1 },
    { day: 'Mar 14', discovered: 17, applied: 1, interviews: 0 },
    { day: 'Mar 15', discovered: 14, applied: 0, interviews: 1 },
    { day: 'Mar 16', discovered: 61, applied: 6, interviews: 0 },
    { day: 'Mar 17', discovered: 44, applied: 3, interviews: 2 },
    { day: 'Mar 18', discovered: 55, applied: 7, interviews: 1 },
    { day: 'Mar 19', discovered: 48, applied: 4, interviews: 3 },
    { day: 'Mar 20', discovered: 63, applied: 5, interviews: 2 },
    { day: 'Mar 21', discovered: 31, applied: 2, interviews: 0 },
    { day: 'Mar 22', discovered: 22, applied: 1, interviews: 1 },
    { day: 'Mar 23', discovered: 58, applied: 8, interviews: 2 },
    { day: 'Mar 24', discovered: 47, applied: 3, interviews: 1 },
];

const matchDistributionData = [
    { range: '90–100%', count: 3 },
    { range: '80–89%', count: 9 },
    { range: '70–79%', count: 14 },
    { range: '60–69%', count: 11 },
    { range: '50–59%', count: 7 },
    { range: '40–49%', count: 4 },
    { range: '<40%', count: 2 },
];

const CustomTooltipActivity = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-surface-elevated border border-border-default rounded-card p-3 shadow-xl text-xs backdrop-blur-md">
            <p className="font-semibold text-text-primary mb-2">{label}</p>
            {payload.map((entry: any) => (
                <div key={`tooltip-${entry.dataKey}`} className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-text-secondary capitalize">{entry.name}:</span>
                    <span className="font-mono font-semibold text-text-primary tabular-nums">{entry.value}</span>
                </div>
            ))}
        </div>
    );
};

const CustomTooltipMatch = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-surface-elevated border border-border-default rounded-card p-3 shadow-xl text-xs backdrop-blur-md">
            <p className="font-semibold text-text-primary mb-1">{label}</p>
            <p className="text-text-secondary">
                <span className="font-mono font-bold text-accent tabular-nums">{payload[0]?.value}</span>
                {' '}jobs in range
            </p>
        </div>
    );
};

export default function DashboardCharts() {
    const [activeTab, setActiveTab] = useState<'activity' | 'distribution'>('activity');

    return (
        <div className="bg-surface border border-border-default rounded-card p-5 h-full">
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h2 className="text-base font-semibold text-text-primary">Application Activity</h2>
                    <p className="text-xs text-text-muted mt-0.5">Last 15 days</p>
                </div>
                <div className="flex items-center gap-1 bg-surface-elevated rounded-btn p-1">
                    {(['activity', 'distribution'] as const).map((tab) => (
                        <button
                            key={`chart-tab-${tab}`}
                            onClick={() => setActiveTab(tab)}
                            className={`px-3 py-1.5 rounded-btn text-xs font-medium transition-all duration-150 ${activeTab === tab
                                    ? 'bg-primary text-white shadow-lg' : 'text-text-secondary hover:text-text-primary'
                                }`}
                        >
                            {tab === 'activity' ? 'Timeline' : 'Match Dist.'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="h-[240px]">
                {activeTab === 'activity' ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={applicationActivityData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                            <defs>
                                <linearGradient id="gradDiscovered" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(189 94% 51%)" stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="hsl(189 94% 51%)" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gradApplied" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(239 84% 67%)" stopOpacity={0.35} />
                                    <stop offset="95%" stopColor="hsl(239 84% 67%)" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gradInterviews" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="day"
                                tick={{ fill: '#64748b', fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                                interval={2}
                            />
                            <YAxis
                                tick={{ fill: '#64748b', fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip content={<CustomTooltipActivity />} />
                            <Area
                                type="monotone"
                                dataKey="discovered"
                                name="Discovered"
                                stroke="hsl(189 94% 51%)"
                                strokeWidth={1.5}
                                fill="url(#gradDiscovered)"
                            />
                            <Area
                                type="monotone"
                                dataKey="applied"
                                name="Applied"
                                stroke="hsl(239 84% 67%)"
                                strokeWidth={2}
                                fill="url(#gradApplied)"
                            />
                            <Area
                                type="monotone"
                                dataKey="interviews"
                                name="Interviews"
                                stroke="hsl(142 71% 45%)"
                                strokeWidth={2}
                                fill="url(#gradInterviews)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={matchDistributionData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                            <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="range"
                                tick={{ fill: '#64748b', fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fill: '#64748b', fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip content={<CustomTooltipMatch />} />
                            <Bar
                                dataKey="count"
                                name="Jobs"
                                fill="hsl(239 84% 67%)"
                                radius={[4, 4, 0, 0]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            <div className="flex items-center gap-5 mt-4 pt-3 border-t border-white/5">
                <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-accent" />
                    <span className="text-xs text-text-muted">Discovered</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                    <span className="text-xs text-text-muted">Applied</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-positive" />
                    <span className="text-xs text-text-muted">Interviews</span>
                </div>
            </div>
        </div>
    );
}
