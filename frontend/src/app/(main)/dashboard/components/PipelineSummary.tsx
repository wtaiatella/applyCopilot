'use client';
import React from 'react';

const pipelineStages = [
    { id: 'stage-discovered', label: 'Discovered', count: 47, color: 'hsl(199 89% 48%)' },
    { id: 'stage-saved', label: 'Saved', count: 23, color: 'hsl(239 84% 67%)' },
    { id: 'stage-applied', label: 'Applied', count: 34, color: 'hsl(189 94% 51%)' },
    { id: 'stage-screening', label: 'Screening', count: 11, color: 'hsl(38 92% 50%)' },
    { id: 'stage-interview', label: 'Interview', count: 6, color: 'hsl(270 70% 65%)' },
    { id: 'stage-offer', label: 'Offer', count: 2, color: 'hsl(142 71% 45%)' },
    { id: 'stage-rejected', label: 'Rejected', count: 9, color: 'hsl(0 84% 60%)' },
];

export default function PipelineSummary() {
    const total = pipelineStages.reduce((s, st) => s + st.count, 0);
    return (
        <div className="bg-surface border border-border-default rounded-card p-5 h-full">
            <div className="mb-4">
                <h2 className="text-base font-semibold text-text-primary">Pipeline Summary</h2>
                <p className="text-xs text-text-muted mt-0.5">{total} total applications</p>
            </div>
            <div className="space-y-2.5">
                {pipelineStages.map((stage) => {
                    const pct = Math.round((stage.count / total) * 100);
                    return (
                        <div key={stage.id} className="flex items-center gap-3">
                            <div className="w-20 shrink-0">
                                <p className="text-xs text-text-secondary truncate">{stage.label}</p>
                            </div>
                            <div className="flex-1 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{ width: `${pct}%`, backgroundColor: stage.color }}
                                />
                            </div>
                            <div className="w-8 text-right">
                                <span className="text-xs font-mono font-semibold tabular-nums text-text-primary">
                                    {stage.count}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="mt-5 pt-4 border-t border-white/5 grid grid-cols-2 gap-3">
                <div className="bg-surface-elevated rounded-btn p-3 border border-white/5">
                    <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1 font-bold">Conversion</p>
                    <p className="text-lg font-bold tabular-nums text-positive">26.5%</p>
                    <p className="text-[10px] text-text-muted">Applied → Interview</p>
                </div>
                <div className="bg-surface-elevated rounded-btn p-3 border border-white/5">
                    <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1 font-bold">Response Rate</p>
                    <p className="text-lg font-bold tabular-nums text-warning">18.2%</p>
                    <p className="text-[10px] text-text-muted">6 of 33 replied</p>
                </div>
            </div>
        </div>
    );
}
