"use client";

import { use, useEffect } from "react";
import { Spin, Alert } from "antd";
import {
  CVComposerProvider,
  useCVComposer,
} from "@/contexts/CVComposerContext";
import CVComposerTabs from "@/components/cv-composer/CVComposerTabs";

interface CVComposerPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Route entry: loads/creates the CV for this job (idempotent create-or-get, AC.1/AC.2) and
 * mounts the 4-tab shell (`CVComposerTabs`). Tab 2 (Deep Analysis) and Tab 4 (CV Viewer) are
 * still placeholder stubs there — their real implementations are later phases (US3/US4).
 */
function CVComposerShell({ jobListingId }: { jobListingId: string }) {
  const { loading, error, loadOrCreateCV } = useCVComposer();

  useEffect(() => {
    loadOrCreateCV(jobListingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobListingId]);

  if (error) {
    return (
      <Alert type="error" message="CV Composer" description={error} showIcon />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <CVComposerTabs jobListingId={jobListingId} />
    </div>
  );
}

export default function CVComposerPage({ params }: CVComposerPageProps) {
  const { id } = use(params);

  return (
    <CVComposerProvider>
      <CVComposerShell jobListingId={id} />
    </CVComposerProvider>
  );
}
