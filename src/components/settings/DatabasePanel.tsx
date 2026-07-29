"use client";

import { useState } from "react";
import { Button, Collapse, Modal, App } from "antd";
import { DatabaseOutlined, DeleteOutlined, WarningOutlined } from "@ant-design/icons";

export default function DatabasePanel() {
  const { message } = App.useApp();
  const [wiping, setWiping] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const handleWipeConfirm = async () => {
    setModalOpen(false);
    setWiping(true);

    try {
      const res = await fetch("/api/admin/database/wipe-profile", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Wipe failed");
      }

      const totals = Object.entries(data.summary as Record<string, number>)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => `${key}: ${count}`)
        .join(", ");

      message.success(
        `✅ Profile data wiped successfully. ${totals || "Nothing to delete."}`,
        6
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      message.error(`❌ Wipe failed: ${errMsg}`);
    } finally {
      setWiping(false);
    }
  };

  const collapseItems = [
    {
      key: "database",
      label: (
        <span className="flex items-center gap-2 text-white font-semibold text-base">
          <DatabaseOutlined />
          Database
        </span>
      ),
      children: (
        <div className="pt-2 space-y-4">
          <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-4">
            <div className="flex items-start gap-3">
              <WarningOutlined className="text-red-400 text-lg mt-0.5 shrink-0" />
              <div>
                <p className="text-red-300 font-semibold text-sm mb-1">
                  Wipe My Profile Data
                </p>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  Deletes all profile data for your account — experiences, education,
                  projects, skills, references, summaries, CVs, and AI usage logs.
                  Your login credentials and account are{" "}
                  <strong className="text-zinc-300">preserved</strong>. Use this to
                  start a fresh CV import test.
                </p>
              </div>
            </div>

            <Button
              danger
              type="primary"
              icon={<DeleteOutlined />}
              loading={wiping}
              onClick={() => setModalOpen(true)}
              className="mt-4 font-semibold"
              size="middle"
              id="btn-wipe-profile-data"
            >
              {wiping ? "Wiping..." : "Wipe Profile Data"}
            </Button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="max-w-2xl">
        <Collapse
          defaultActiveKey={[]}
          items={collapseItems}
          className="bg-zinc-900 border border-zinc-800"
        />
      </div>

      {/* Confirmation modal */}
      <Modal
        open={modalOpen}
        onOk={handleWipeConfirm}
        onCancel={() => setModalOpen(false)}
        okText="Yes, wipe my data"
        cancelText="Cancel"
        okButtonProps={{ danger: true, id: "btn-wipe-confirm-yes" }}
        cancelButtonProps={{ id: "btn-wipe-confirm-cancel" }}
        title={
          <span className="flex items-center gap-2 text-red-400">
            <WarningOutlined />
            Confirm Profile Data Wipe
          </span>
        }
        centered
      >
        <p className="text-zinc-300 mt-2">
          This will permanently delete all profile data associated with your
          account:
        </p>
        <ul className="list-disc list-inside text-zinc-400 text-sm mt-2 space-y-1">
          <li>Experiences, projects, education</li>
          <li>Skills, references, summaries</li>
          <li>Imported CVs and AI usage logs</li>
          <li>All related bullets and sub-items</li>
        </ul>
        <p className="text-zinc-300 mt-3 font-medium">
          Your login credentials will <strong>not</strong> be affected.
        </p>
        <p className="text-red-400 text-sm mt-2">
          ⚠️ This action is irreversible.
        </p>
      </Modal>
    </>
  );
}
