"use client";

import React, { useState } from "react";
import { Card, Typography, Space } from "antd";
import { MapPin, Calendar, Building2, Star } from "lucide-react";
import MatchBadge from "./MatchBadge";

const { Text } = Typography;

export interface JobCardProps {
  job: {
    id: string;
    title: string;
    company: string;
    location: string[] | string | null;
    postedAt: string | Date | null;
    createdAt: string | Date | null;
    matchScore: number | null;
    favorite?: boolean;
  };
  isSelected: boolean;
  onClick: () => void;
}

export default function JobCard({ job, isSelected, onClick }: JobCardProps) {
  const displayDate = job.postedAt
    ? new Date(job.postedAt)
    : new Date(job.createdAt!);
  const formattedDate = displayDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const [favorite, setFavorite] = useState(Boolean(job.favorite));
  const [togglingFavorite, setTogglingFavorite] = useState(false);

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (togglingFavorite) return;

    const next = !favorite;
    setFavorite(next); // optimistic
    setTogglingFavorite(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/favorite`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: next }),
      });
      if (!res.ok) throw new Error("Failed to update favorite");
    } catch {
      setFavorite(!next); // revert on failure
    } finally {
      setTogglingFavorite(false);
    }
  };

  return (
    <Card
      hoverable
      onClick={onClick}
      styles={{ body: { padding: 16 } }}
      className={`transition-all duration-200 cursor-pointer border rounded-2xl bg-zinc-950/60 ${
        isSelected
          ? "border-blue-500/80 shadow-md shadow-blue-950/20 bg-zinc-900/60"
          : "border-zinc-800/80 hover:border-zinc-700/80 bg-zinc-950/30"
      }`}
    >
      <Space direction="vertical" size="small" className="w-full">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h4 className="text-white font-bold text-base m-0 leading-snug truncate">
              {job.title}
            </h4>
            <div className="flex items-center gap-1.5 mt-1 text-zinc-400">
              <Building2 size={14} className="text-zinc-500" />
              <Text className="text-zinc-400 font-medium text-sm truncate block max-w-[200px]">
                {job.company}
              </Text>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleFavorite}
              aria-label={
                favorite ? "Remove from favorites" : "Add to favorites"
              }
              aria-pressed={favorite}
              className="p-0.5 rounded hover:bg-zinc-800/60 transition-colors"
            >
              <Star
                size={16}
                className={favorite ? "text-yellow-400" : "text-zinc-600"}
                fill={favorite ? "currentColor" : "none"}
              />
            </button>
            <MatchBadge score={job.matchScore} />
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 text-xs text-zinc-500 border-t border-zinc-900/80 pt-2.5">
          <span className="flex items-center gap-1 truncate max-w-[150px]">
            <MapPin size={13} className="text-zinc-600" />
            {Array.isArray(job.location) && job.location.length > 0
              ? job.location.join(", ")
              : "Remote / Unspecified"}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <Calendar size={13} className="text-zinc-600" />
            {formattedDate}
          </span>
        </div>
      </Space>
    </Card>
  );
}
