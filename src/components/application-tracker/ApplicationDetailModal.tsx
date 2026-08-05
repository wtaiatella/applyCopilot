"use client";

import { useEffect } from "react";
import { Alert, Modal, Spin } from "antd";
import {
  CVComposerProvider,
  useCVComposer,
} from "@/contexts/CVComposerContext";
import CVComposerTabs from "@/components/cv-composer/CVComposerTabs";

function ApplicationDetailModalShell({
  jobListingId,
}: {
  jobListingId: string;
}) {
  const { loading, error, loadOrCreateCV } = useCVComposer();

  useEffect(() => {
    loadOrCreateCV(jobListingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobListingId]);

  if (error) {
    return (
      <Alert type="error" message="Application" description={error} showIcon />
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

export interface ApplicationDetailModalProps {
  /** `null` closes the modal — same on/off convention as `KanbanBoard`'s outcome-prompt Modal. */
  jobListingId: string | null;
  onClose: () => void;
}

/**
 * Kanban-card modal (FR-16, US-5): a full-width `antd` `Modal` wrapping a **fresh**
 * `CVComposerProvider` + the same `CVComposerTabs` shell the full-page route mounts, keyed by
 * `jobListingId`. Mounting a new `CVComposerProvider` per open (via the `key`, which forces a
 * full remount rather than reusing one held across multiple card clicks) is what makes the
 * "already decoupled via a `jobListingId` prop" reuse claim in the PRD's Dependencies literally
 * true — the identical shell code path that `jobs/[id]/application/page.tsx` runs for the
 * full-page route also runs here, unmodified (Implementation Notes). Opening/closing this modal
 * never touches `next/navigation` (no URL change, AC.7) and never mutates the board's own state.
 */
export default function ApplicationDetailModal({
  jobListingId,
  onClose,
}: ApplicationDetailModalProps) {
  return (
    <Modal
      open={jobListingId !== null}
      onCancel={onClose}
      footer={null}
      width="90vw"
      style={{ top: 24 }}
      destroyOnHidden
      data-testid="application-detail-modal"
    >
      {jobListingId && (
        <CVComposerProvider key={jobListingId}>
          <ApplicationDetailModalShell jobListingId={jobListingId} />
        </CVComposerProvider>
      )}
    </Modal>
  );
}
