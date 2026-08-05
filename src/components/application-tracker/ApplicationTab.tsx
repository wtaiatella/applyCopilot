"use client";

import { useEffect, useState } from "react";
import { Button, DatePicker, Input, Segmented, Spin } from "antd";
import type { Dayjs } from "dayjs";
import { ApplicationTrackerService } from "@/services/applicationTrackerService";
import type { ApplicationEventDTO } from "@/types/application";
import TimelineEntry from "./TimelineEntry";

const { TextArea } = Input;

type ComposerType = "NOTE" | "MEETING" | "COMPANY_RESPONSE";

const COMPOSER_OPTIONS: { label: string; value: ComposerType }[] = [
  { label: "Note", value: "NOTE" },
  { label: "Meeting", value: "MEETING" },
  { label: "Company Response", value: "COMPANY_RESPONSE" },
];

/**
 * Tab 5 — Application (FR-12): fetches `GET /api/cv/[cvId]/application`, renders the
 * `TimelineEntry` list in `createdAt` order, plus a 3-type entry composer (Note / Meeting /
 * Company Response, FR-9). A still-`DRAFT` CV renders a non-error empty state, matching
 * `DeepAnalysisTab`'s "no cached analysis yet" pattern.
 */
export default function ApplicationTab({ cvId }: { cvId: string }) {
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [events, setEvents] = useState<ApplicationEventDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [composerType, setComposerType] = useState<ComposerType>("NOTE");
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [eventAt, setEventAt] = useState<Dayjs | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Deferred `setState` (via `Promise.resolve().then`, not called synchronously in the effect
  // body) matches this codebase's existing convention (`JobDescriptionTab`/`DeepAnalysisTab`).
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
    });

    ApplicationTrackerService.getForCV(cvId)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setApplicationId(result.application.id);
          setEvents(result.events);
        } else {
          setApplicationId(null);
          setEvents([]);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load Application.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cvId]);

  function resetComposer() {
    setContent("");
    setTitle("");
    setEventAt(null);
  }

  async function handleSubmit() {
    if (!applicationId) return;

    let input: Parameters<typeof ApplicationTrackerService.addEvent>[1];
    if (composerType === "MEETING") {
      if (!title.trim() || !eventAt) return;
      input = {
        type: "MEETING",
        title: title.trim(),
        eventAt: eventAt.toISOString(),
        content: content.trim() || undefined,
      };
    } else {
      if (!content.trim()) return;
      input = { type: composerType, content: content.trim() };
    }

    setSubmitting(true);
    try {
      const event = await ApplicationTrackerService.addEvent(
        applicationId,
        input,
      );
      setEvents((prev) => [...prev, event]);
      resetComposer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add entry.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    composerType === "MEETING"
      ? title.trim().length > 0 && eventAt !== null
      : content.trim().length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spin size="large" />
      </div>
    );
  }

  if (!applicationId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-2 p-4">
        <p className="text-xs text-zinc-400 max-w-sm m-0">
          No Application yet for this CV. The timeline appears here once you
          apply.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-2">
        {events.length === 0 ? (
          <div className="text-xs text-zinc-500">No entries yet.</div>
        ) : (
          events.map((event) => <TimelineEntry key={event.id} event={event} />)
        )}
      </div>

      <div className="space-y-2 rounded-lg border border-zinc-800 p-3">
        <Segmented
          size="small"
          options={COMPOSER_OPTIONS}
          value={composerType}
          onChange={(value) => {
            setComposerType(value as ComposerType);
            resetComposer();
          }}
        />

        {composerType === "MEETING" && (
          <>
            <Input
              placeholder="Meeting title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
            <DatePicker
              showTime
              style={{ width: "100%" }}
              value={eventAt}
              onChange={setEventAt}
              placeholder="Meeting date/time"
            />
          </>
        )}

        <TextArea
          rows={3}
          placeholder={
            composerType === "MEETING"
              ? "Notes (optional)"
              : composerType === "COMPANY_RESPONSE"
                ? "What did the company say?"
                : "Write a note..."
          }
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={5000}
        />

        {error && (
          <div className="text-xs font-medium text-rose-400">{error}</div>
        )}

        <Button
          type="primary"
          onClick={handleSubmit}
          loading={submitting}
          disabled={!canSubmit}
        >
          Add entry
        </Button>
      </div>
    </div>
  );
}
