'use client';
import React from 'react';
import {
    Briefcase,
    TrendingUp,
    Search,
    MessageSquare,
    Calendar,
    ArrowUpRight,
    ArrowDownRight,
    AlertTriangle,
} from 'lucide-react';

interface KPICard {
    id: string;
    label: string;
    value: string;
    subValue?: string;
    trend: number;
    trendLabel: string;
    icon: React.ElementType;
    accent: string;
    alert?: boolean;
}

const kpis: KPICard[] = [
    {
        id: 'kpi-active-apps',
        label: 'Active Applications',
        value: '34',
        subValue: '8 need attention',
        trend: 12,
        trendLabel: 'vs last week',
        icon: Briefcase,
        accent: 'text-primary',
    },
    {
        id: 'kpi-avg-match',
        label: 'Avg Match Score',
        value: '73%',
        subValue: 'Across 24 new jobs',
        trend: 4.2,
        trendLabel: 'vs prev batch',
        icon: TrendingUp,
        accent: 'text-positive',
    },
    {
        id: 'kpi-discovered',
        label: 'Jobs Discovered Today',
        value: '47',
        subValue: '12 above 75% match',
        trend: -8,
        trendLabel: 'vs yesterday',
        icon: Search,
        accent: 'text-accent',
    },
    {
        id: 'kpi-response-rate',
        label: 'Response Rate',
        value: '18.2%',
        subValue: '6 of 33 replied',
        trend: -3.1,
        trendLabel: 'vs last month',
        icon: MessageSquare,
        accent: 'text-warning',
        alert: true,
      },
      {
        id: 'kpi-week-apps',
        label: 'Applied This Week',
        value: '11',
        subValue: 'Target: 15/week',
        trend: 22,
        trendLabel: 'vs last week',
        icon: Calendar,
        accent: 'text-purple-400',
      },
      {
        id: 'kpi-conversion',
        label: 'Pipeline Conversion',
        value: '26.5%',
        subValue: 'Applied → Interview',
        trend: 5.8,
        trendLabel: 'vs last month',
        icon: TrendingUp,
        accent: 'text-positive',
      },
];

export default function DashboardKPIs() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {kpis.map((kpi) => {
                const Icon = kpi.icon;
                const isPositive = kpi.trend > 0;
                const TrendIcon = isPositive ? ArrowUpRight : ArrowDownRight;
                const trendColor = kpi.alert
                    ? 'text-negative'
                    : isPositive
                        ? 'text-positive' : 'text-negative';

                return (
                    <div
                        key={kpi.id}
                        className={`relative bg-surface border rounded-card p-5 transition-all hover:border-primary/30 ${kpi.alert
                                ? 'border-warning/40 bg-warning/5' : 'border-border-default'
                            }`}
                    >
                        {kpi.alert && (
                            <div className="absolute top-3 right-3">
                                <AlertTriangle size={14} className="text-warning" />
                            </div>
                        )}
                        <div className="flex items-start justify-between mb-3">
                            <div className={`p-2 rounded-btn bg-surface-elevated ${kpi.accent}`}>
                                <Icon size={16} />
                            </div>
                        </div>
                        <p className="text-2xl font-bold tabular-nums text-text-primary mb-0.5">
                            {kpi.value}
                        </p>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted mb-2">
                            {kpi.label}
                        </p>
                        {kpi.subValue && (
                            <p className="text-xs text-text-secondary mb-2">{kpi.subValue}</p>
                        )}
                        <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
                            <TrendIcon size={12} />
                            <span className="tabular-nums">{Math.abs(kpi.trend)}%</span>
                            <span className="text-text-muted font-normal">{kpi.trendLabel}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
