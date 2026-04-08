import React from 'react';
import { Card, Typography, Space, theme } from 'antd';
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
import { themeTokens } from '@/lib/theme-tokens';

const { Text, Title } = Typography;
const { useToken } = theme;

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
    const { token } = useToken();

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {kpis.map((kpi) => {
                const Icon = kpi.icon;
                const isPositive = kpi.trend > 0;
                const TrendIcon = isPositive ? ArrowUpRight : ArrowDownRight;
                const trendColor = kpi.alert
                    ? token.colorError
                    : isPositive
                        ? token.colorSuccess : token.colorError;

                return (
                    <Card
                        key={kpi.id}
                        size="small"
                        hoverable
                        className={'overflow-hidden transition-all duration-300'}
                        classNames={{
                            body: 'border border-red-500'
                        }}
                        styles={{
                            body: {
                                borderColor: kpi.alert ? `${themeTokens.colors.status.warningBorder}` : 'none',
                                height: '100%',
                            }
                        }}
                    >
                        {/* Title: Icon + Label + Alert Indicator */}
                        <div className="flex items-center justify-between mb-3">
                            <Space align="center" size={10}>
                                <div className={`p-1.5 rounded-lg bg-surface-elevated flex items-center justify-center ${kpi.accent}`}>
                                    <Icon size={14} />
                                </div>
                                <Text className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                                    {kpi.label}
                                </Text>
                            </Space>
                            {kpi.alert && (
                                <AlertTriangle size={14} className="text-warning animate-bounce-subtle" />
                            )}
                        </div>

                        {/* Value */}
                        <div className="flex flex-col">
                            <Title level={2} className="!mb-0.5 !text-2xl !text-text-primary tabular-nums">
                                {kpi.value}
                            </Title>

                            {kpi.subValue && (
                                <Text className="text-[11px] text-text-secondary mb-3">
                                    {kpi.subValue}
                                </Text>
                            )}

                            {/* Trend */}
                            <div className="flex items-center gap-1 text-[11px] font-semibold mt-auto" style={{ color: trendColor }}>
                                <TrendIcon size={12} />
                                <span className="tabular-nums">{Math.abs(kpi.trend)}%</span>
                                <Text className="text-text-muted font-normal text-[10px] ml-0.5">
                                    {kpi.trendLabel}
                                </Text>
                            </div>
                        </div>
                    </Card>
                );
            })}
        </div>
    );
}
