"use client";

import React from "react";
import { Tag } from "antd";
import Link from "next/link";
import { Sparkles } from "lucide-react";

interface MatchBadgeProps {
  score: number | null;
}

export default function MatchBadge({ score }: MatchBadgeProps) {
  if (score === null || score === undefined) {
    return (
      <Link href="/profile">
        <Tag
          color="default"
          className="cursor-pointer border border-dashed border-zinc-700 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 font-medium px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5 transition-colors"
        >
          <Sparkles size={13} className="text-zinc-500 animate-pulse" />
          Sync Profile
        </Tag>
      </Link>
    );
  }

  const percentage = Math.round(score);

  if (percentage >= 80) {
    return (
      <Tag
        color="success"
        className="border-0 bg-emerald-950/40 text-emerald-400 font-bold px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5"
      >
        <Sparkles size={13} className="text-emerald-400" />
        {percentage}% Match
      </Tag>
    );
  }

  if (percentage >= 60) {
    return (
      <Tag
        color="warning"
        className="border-0 bg-amber-950/40 text-amber-400 font-bold px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5"
      >
        <Sparkles size={13} className="text-amber-400" />
        {percentage}% Match
      </Tag>
    );
  }

  return (
    <Tag
      color="default"
      className="border-0 bg-zinc-800/60 text-zinc-400 font-semibold px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5"
    >
      {percentage}% Match
    </Tag>
  );
}
