import React from 'react';

type BadgeVariant =
    | 'discovered' | 'saved' | 'applied' | 'screening' | 'interview' | 'offer' | 'rejected' | 'withdrawn' | 'remote' | 'hybrid' | 'onsite' | 'high' | 'mid' | 'low';

const variantStyles: Record<BadgeVariant, string> = {
    discovered: 'bg-info/15 text-info border-info/30',
    saved: 'bg-primary/15 text-primary border-primary/30',
    applied: 'bg-accent/15 text-accent border-accent/30',
    screening: 'bg-warning/15 text-warning border-warning/30',
    interview: 'bg-purple-400/15 text-purple-400 border-purple-400/30',
    offer: 'bg-positive/15 text-positive border-positive/30',
    rejected: 'bg-negative/15 text-negative border-negative/30',
    withdrawn: 'bg-text-muted/15 text-text-muted border-text-muted/30',
    remote: 'bg-positive/15 text-positive border-positive/30',
    hybrid: 'bg-warning/15 text-warning border-warning/30',
    onsite: 'bg-info/15 text-info border-info/30',
    high: 'bg-positive/15 text-positive border-positive/30',
    mid: 'bg-warning/15 text-warning border-warning/30',
    low: 'bg-negative/15 text-negative border-negative/30',
};

const variantLabels: Record<BadgeVariant, string> = {
    discovered: 'Discovered',
    saved: 'Saved',
    applied: 'Applied',
    screening: 'Screening',
    interview: 'Interview',
    offer: 'Offer',
    rejected: 'Rejected',
    withdrawn: 'Withdrawn',
    remote: 'Remote',
    hybrid: 'Hybrid',
    onsite: 'On-site',
    high: 'High',
    mid: 'Mid',
    low: 'Low',
};

interface StatusBadgeProps {
    variant: BadgeVariant;
    label?: string;
    className?: string;
    size?: 'sm' | 'md';
}

export default function StatusBadge({ variant, label, className = '', size = 'md' }: StatusBadgeProps) {
    const sizeClass = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';
    return (
        <span
            className={`inline-flex items-center font-medium rounded-badge border ${sizeClass} ${variantStyles[variant]} ${className}`}
        >
            {label ?? variantLabels[variant]}
        </span>
    );
}
