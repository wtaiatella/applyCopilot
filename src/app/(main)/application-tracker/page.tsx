"use client";

import { Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Segmented, Typography } from "antd";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import TrackerListView from "@/components/application-tracker/TrackerListView";
import KanbanBoard from "@/components/application-tracker/KanbanBoard";

const { Title } = Typography;

type ViewMode = "list" | "board";

/**
 * `/application-tracker` — the single consolidated entry point (FR-21, AC.10), replacing the
 * old CV Composer hub. Toggles between `TrackerListView` and `KanbanBoard` via a `?view=`
 * query-string param updated with `router.replace(..., { scroll: false })` — a same-route
 * search-param change, not a full navigation (Clarifications & Assumptions).
 */
function ApplicationTrackerContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view: ViewMode =
    searchParams.get("view") === "board" ? "board" : "list";

  const setView = (next: ViewMode) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Title level={2} style={{ margin: 0 }}>
          Application Tracker
        </Title>
        <Segmented<ViewMode>
          value={view}
          onChange={setView}
          options={[
            { label: "List", value: "list", icon: <ListIcon size={14} /> },
            { label: "Board", value: "board", icon: <LayoutGrid size={14} /> },
          ]}
        />
      </div>

      {view === "board" ? <KanbanBoard /> : <TrackerListView />}
    </div>
  );
}

export default function ApplicationTrackerPage() {
  return (
    <Suspense
      fallback={<div className="text-center text-slate-400">Loading...</div>}
    >
      <ApplicationTrackerContent />
    </Suspense>
  );
}
