"use client";

import React, { useState } from "react";
import { Button, Typography, Divider, Tag, message, Modal } from "antd";
import {
  FileTextOutlined,
  DownloadOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { Sparkles } from "lucide-react";
import { CVService } from "@/services/cvService";
import type { CVSnapshotData, CVSnapshotBullet } from "@/types/cv";

const { Title, Paragraph, Text } = Typography;

export interface CVViewerProps {
  cvId: string;
  snapshot: CVSnapshotData;
  /** CV status — gates "Aplicar Vaga" visibility (FR-14, FR-18, AC.9, AC.11). */
  status?: "DRAFT" | "APPLIED";
  /**
   * Performs the actual Apply call (`POST /api/cv/[cvId]/apply`) and updates the CV's status
   * in the shared context — CVViewer itself only confirms intent and reports success/failure.
   */
  onApply?: () => Promise<void>;
}

function includedBullets(bullets: CVSnapshotBullet[]): CVSnapshotBullet[] {
  return bullets
    .filter((b) => b.included)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function formatMonthYear(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function scoreColor(score: number): string {
  if (score >= 75) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-rose-400";
}

/**
 * Tab 4 — CV Viewer: rendered document preview (mirrors what `cvPdfService.ts` exports — only
 * `included: true` content) + Print PDF / Calculate Match Score / Aplicar Vaga actions (FR-5,
 * FR-12, FR-13, FR-14). "Aplicar Vaga" is only shown while `status === "DRAFT"` (FR-18, AC.11) —
 * once Applied, this same tab still offers Print PDF / Calculate Match Score (AC.11).
 */
export default function CVViewer({
  cvId,
  snapshot,
  status = "DRAFT",
  onApply,
}: CVViewerProps) {
  const [downloading, setDownloading] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [applying, setApplying] = useState(false);
  const [score, setScore] = useState<number | null>(null);

  const { basicData } = snapshot;
  const fullName =
    [basicData.firstName, basicData.lastName].filter(Boolean).join(" ") ||
    "Candidate";
  const contactParts = [
    basicData.location,
    basicData.phone,
    basicData.linkedin,
    basicData.github,
    basicData.website,
  ].filter((v): v is string => Boolean(v));
  const includedSummary = snapshot.summaries.find((s) => s.included);
  const includedSkills = snapshot.skills.filter((s) => s.included);

  const handlePrintPdf = async () => {
    setDownloading(true);
    try {
      const blob = await CVService.downloadPdf(cvId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cv-${cvId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : "Failed to generate PDF.",
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleCalculateMatchScore = async () => {
    setScoring(true);
    try {
      const result = await CVService.calculateMatchScore(cvId);
      setScore(result.score);
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : "Failed to calculate match score.",
      );
    } finally {
      setScoring(false);
    }
  };

  const handleApply = () => {
    Modal.confirm({
      title: "Aplicar Vaga?",
      content:
        "This freezes the CV (read-only) and reconciles your tailored content back into your master Profile. This action is one-time and cannot be undone.",
      okText: "Aplicar Vaga",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        setApplying(true);
        try {
          await onApply?.();
          message.success("Applied — your master Profile has been updated.");
        } catch (err) {
          message.error(
            err instanceof Error ? err.message : "Failed to apply CV.",
          );
        } finally {
          setApplying(false);
        }
      },
    });
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button
            icon={<DownloadOutlined />}
            loading={downloading}
            onClick={handlePrintPdf}
            className="border-zinc-700 text-zinc-300"
          >
            Print PDF
          </Button>
          <Button
            icon={<Sparkles size={14} />}
            loading={scoring}
            onClick={handleCalculateMatchScore}
            className="border-zinc-700 text-zinc-300"
          >
            Calculate Match Score
          </Button>
          {status === "DRAFT" && (
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={applying}
              onClick={handleApply}
              className="bg-emerald-600 border-emerald-600 hover:bg-emerald-500"
            >
              Aplicar Vaga
            </Button>
          )}
        </div>
        {score !== null && (
          <Tag
            className={`m-0 border-0 bg-zinc-900 font-bold ${scoreColor(score)}`}
          >
            Match Score: {score.toFixed(1)}%
          </Tag>
        )}
      </div>

      <Divider className="my-2 border-zinc-800" />

      <div className="bg-white text-black rounded-lg p-8 space-y-4 shadow-lg max-w-3xl mx-auto">
        <div>
          <Title level={3} className="!m-0 !text-black">
            {fullName}
          </Title>
          {basicData.title && (
            <Paragraph className="!m-0 !text-black">
              {basicData.title}
            </Paragraph>
          )}
          {contactParts.length > 0 && (
            <Text className="!text-gray-600 text-xs">
              {contactParts.join("  |  ")}
            </Text>
          )}
        </div>

        {includedSummary && (
          <div>
            <div className="font-bold uppercase text-xs tracking-wider text-gray-700 flex items-center gap-1 mb-1">
              <FileTextOutlined /> Summary
            </div>
            <Paragraph className="!m-0 !text-black text-sm">
              {includedSummary.content}
            </Paragraph>
          </div>
        )}

        {snapshot.experiences.length > 0 && (
          <div>
            <div className="font-bold uppercase text-xs tracking-wider text-gray-700 mb-1">
              Experience
            </div>
            {snapshot.experiences.map((exp) => (
              <div key={exp.id} className="mb-2">
                <div className="font-bold text-sm text-black">
                  {exp.position} — {exp.company}
                </div>
                <div className="text-xs text-gray-600 mb-1">
                  {formatMonthYear(exp.startDate)} -{" "}
                  {exp.current || !exp.endDate
                    ? "Present"
                    : formatMonthYear(exp.endDate)}
                </div>
                {includedBullets(exp.bullets).map((bullet) => (
                  <div key={bullet.id} className="text-sm text-black">
                    {bullet.type === "PARAGRAPH"
                      ? bullet.text
                      : `• ${bullet.text}`}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {snapshot.education.length > 0 && (
          <div>
            <div className="font-bold uppercase text-xs tracking-wider text-gray-700 mb-1">
              Education
            </div>
            {snapshot.education.map((edu) => (
              <div key={edu.id} className="mb-2">
                <div className="font-bold text-sm text-black">
                  {edu.degree}
                  {edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ""} —{" "}
                  {edu.institution}
                </div>
                {includedBullets(edu.bullets).map((bullet) => (
                  <div key={bullet.id} className="text-sm text-black">
                    {bullet.type === "PARAGRAPH"
                      ? bullet.text
                      : `• ${bullet.text}`}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {snapshot.projects.length > 0 && (
          <div>
            <div className="font-bold uppercase text-xs tracking-wider text-gray-700 mb-1">
              Projects
            </div>
            {snapshot.projects.map((proj) => (
              <div key={proj.id} className="mb-2">
                <div className="font-bold text-sm text-black">
                  {proj.name}
                  {proj.technologies.length > 0
                    ? ` (${proj.technologies.join(", ")})`
                    : ""}
                </div>
                {includedBullets(proj.bullets).map((bullet) => (
                  <div key={bullet.id} className="text-sm text-black">
                    {bullet.type === "PARAGRAPH"
                      ? bullet.text
                      : `• ${bullet.text}`}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {includedSkills.length > 0 && (
          <div>
            <div className="font-bold uppercase text-xs tracking-wider text-gray-700 mb-1">
              Skills
            </div>
            {includedSkills.map((skill) => (
              <div key={skill.id} className="text-sm text-black">
                {skill.name} — {skill.proficiency}
                {skill.yearsExperience ? ` (${skill.yearsExperience} yrs)` : ""}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
