"use client";

import { ArrowRight, StickyNote, CalendarClock, Mail } from "lucide-react";
import type { ApplicationEventDTO } from "@/types/application";

const STAGE_LABEL: Record<string, string> = {
  APPLIED: "Applied",
  SCREENING: "Screening",
  TECH_INTERVIEW: "Tech Interview",
  OFFER: "Offer",
  FINAL: "Final",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * One timeline row (FR-10, FR-11, AC.5) — a single component with a `type` switch for the 4
 * visual variants, per spectech's Implementation Notes (not 4 separate files):
 * - `STAGE_CHANGE`: centered, non-bubble — reads as a system divider, not a chat message.
 * - `NOTE` / `MEETING` / `COMPANY_RESPONSE`: left-aligned bubble, each with a distinct icon+color.
 */
export default function TimelineEntry({
  event,
}: {
  event: ApplicationEventDTO;
}) {
  switch (event.type) {
    case "STAGE_CHANGE":
      return (
        <div
          data-testid={`timeline-entry-${event.id}`}
          data-entry-type="STAGE_CHANGE"
          className="flex items-center justify-center gap-2 py-2 text-xs text-zinc-500"
        >
          <span>
            {event.fromStage ? STAGE_LABEL[event.fromStage] : "Created"}
          </span>
          <ArrowRight size={12} className="text-zinc-600" />
          <span className="font-medium text-zinc-400">
            {event.toStage ? STAGE_LABEL[event.toStage] : "—"}
          </span>
          <span className="text-zinc-600">· {formatDate(event.createdAt)}</span>
        </div>
      );

    case "NOTE":
      return (
        <div
          data-testid={`timeline-entry-${event.id}`}
          data-entry-type="NOTE"
          className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm"
        >
          <StickyNote size={16} className="mt-0.5 shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-400">
              Note
            </div>
            <div className="whitespace-pre-wrap text-zinc-300">
              {event.content}
            </div>
            <div className="mt-1 text-xs text-zinc-600">
              {formatDate(event.createdAt)}
            </div>
          </div>
        </div>
      );

    case "MEETING":
      return (
        <div
          data-testid={`timeline-entry-${event.id}`}
          data-entry-type="MEETING"
          className="flex items-start gap-2 rounded-lg border border-blue-900/60 bg-blue-950/30 p-3 text-sm"
        >
          <CalendarClock size={16} className="mt-0.5 shrink-0 text-blue-400" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-400">
              Meeting
            </div>
            <div className="font-medium text-zinc-200">{event.title}</div>
            {event.eventAt && (
              <div className="text-xs text-zinc-400">
                {formatDate(event.eventAt)}
              </div>
            )}
            {event.content && (
              <div className="mt-1 whitespace-pre-wrap text-zinc-300">
                {event.content}
              </div>
            )}
            <div className="mt-1 text-xs text-zinc-600">
              Logged {formatDate(event.createdAt)}
            </div>
          </div>
        </div>
      );

    case "COMPANY_RESPONSE":
      return (
        <div
          data-testid={`timeline-entry-${event.id}`}
          data-entry-type="COMPANY_RESPONSE"
          className="flex items-start gap-2 rounded-lg border border-emerald-900/60 bg-emerald-950/30 p-3 text-sm"
        >
          <Mail size={16} className="mt-0.5 shrink-0 text-emerald-400" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
              Company Response
            </div>
            <div className="whitespace-pre-wrap text-zinc-300">
              {event.content}
            </div>
            <div className="mt-1 text-xs text-zinc-600">
              {formatDate(event.createdAt)}
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}
