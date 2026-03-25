import React from 'react';

interface MatchScoreBadgeProps {
    score: number;
    size?: 'sm' | 'md' | 'lg';
    showLabel?: boolean;
}

function getScoreColor(score: number): string {
    if (score >= 80) return 'text-positive border-positive/40 bg-positive/10';
    if (score >= 60) return 'text-warning border-warning/40 bg-warning/10';
    return 'text-negative border-negative/40 bg-negative/10';
}

function getScoreLabel(score: number): string {
    if (score >= 80) return 'Strong Match';
    if (score >= 60) return 'Partial Match';
    return 'Weak Match';
}

export default function MatchScoreBadge({ score, size = 'md', showLabel = false }: MatchScoreBadgeProps) {
    const colorClass = getScoreColor(score);
    const sizeMap = {
        sm: 'text-xs px-1.5 py-0.5 font-semibold',
        md: 'text-sm px-2 py-1 font-bold',
        lg: 'text-base px-3 py-1.5 font-bold',
    };
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-badge border font-mono tabular-nums ${colorClass} ${sizeMap[size]}`}>
            <span>{score}%</span>
            {showLabel && <span className="font-sans font-medium text-xs opacity-80">{getScoreLabel(score)}</span>}
        </span>
    );
}
