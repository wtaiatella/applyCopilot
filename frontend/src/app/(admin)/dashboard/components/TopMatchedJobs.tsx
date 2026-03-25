'use client';
import React from 'react';
import Link from 'next/link';
import MatchScoreBadge from '@/components/ui/MatchScoreBadge';
import { ExternalLink, Zap } from 'lucide-react';

const topJobs = [
    {
        id: 'job-top-001',
        title: 'Senior Frontend Engineer',
        company: 'Vercel',
        location: 'Remote · US',
        salary: '$140K–$180K',
        match: 94,
        workType: 'remote' as const,
        tags: ['React', 'TypeScript', 'Next.js'],
        source: 'LinkedIn',
        postedAgo: '2h ago',
    },
    {
        id: 'job-top-002',
        title: 'Staff Software Engineer',
        company: 'Stripe',
        location: 'Remote · Global',
        salary: '$160K–$210K',
        match: 88,
        workType: 'remote' as const,
        tags: ['Node.js', 'TypeScript', 'Distributed Systems'],
        source: 'Greenhouse',
        postedAgo: '5h ago',
    },
    {
        id: 'job-top-003',
        title: 'Full Stack Engineer',
        company: 'Linear',
        location: 'Remote · EU/US',
        salary: '$120K–$160K',
        match: 85,
        workType: 'remote' as const,
        tags: ['React', 'GraphQL', 'PostgreSQL'],
        source: 'Ashby',
        postedAgo: '1d ago',
    },
    {
        id: 'job-top-004',
        title: 'Senior React Developer',
        company: 'Loom',
        location: 'Remote · Americas',
        salary: '$130K–$165K',
        match: 82,
        workType: 'remote' as const,
        tags: ['React', 'Redux', 'WebRTC'],
        source: 'Lever',
        postedAgo: '1d ago',
    },
    {
        id: 'job-top-005',
        title: 'Software Engineer II',
        company: 'Figma',
        location: 'Remote · US',
        salary: '$145K–$190K',
        match: 79,
        workType: 'remote' as const,
        tags: ['C++', 'TypeScript', 'WebAssembly'],
        source: 'LinkedIn',
        postedAgo: '2d ago',
    },
];

export default function TopMatchedJobs() {
    return (
        <div className="bg-surface border border-border-default rounded-card p-5">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-base font-semibold text-text-primary">Top Matched Jobs</h2>
                    <p className="text-xs text-text-muted mt-0.5">Highest compatibility from today's discovery</p>
                </div>
                <Link
                    href="/dashboard/jobs"
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors font-medium"
                >
                    View all <ExternalLink size={11} />
                </Link>
            </div>

            <div className="space-y-2">
                {topJobs.map((job) => (
                    <div
                        key={job.id}
                        className="group flex items-center gap-4 p-3 rounded-btn bg-surface-elevated hover:bg-surface-elevated/80 border border-border-default/50 hover:border-primary/20 transition-all duration-150 cursor-pointer"
                    >
                        <div className="w-9 h-9 rounded-btn bg-surface flex items-center justify-center shrink-0 border border-border-default">
                            <span className="text-[10px] font-black text-text-muted">
                                {job.company.slice(0, 2).toUpperCase()}
                            </span>
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-text-primary truncate">{job.title}</p>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[11px] font-medium text-text-secondary">{job.company}</span>
                                <span className="text-text-muted/30">·</span>
                                <span className="text-[11px] text-text-muted">{job.location}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-2">
                                {job.tags.slice(0, 3).map((tag) => (
                                    <span
                                        key={`${job.id}-tag-${tag}`}
                                        className="text-[9px] px-1.5 py-0.5 rounded-sm bg-surface border border-border-default text-text-muted font-medium uppercase tracking-wider"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                            <MatchScoreBadge score={job.match} size="sm" />
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button title="Quick Apply" className="p-1 px-2 rounded-sm bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-white transition-all">
                                    <Zap size={10} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
