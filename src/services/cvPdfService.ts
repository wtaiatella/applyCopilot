import { createElement } from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { logger } from "@/lib/logging/logger";
import type {
  CVSnapshotData,
  CVSnapshotBullet,
  CVSnapshotExperience,
  CVSnapshotEducation,
  CVSnapshotProject,
} from "@/types/cv";

/**
 * Composes a `CVSnapshotData` into a single-column, ATS-safe PDF buffer (FR-12, AC.7).
 *
 * Deliberately uses `@react-pdf/renderer`'s declarative `Document`/`Page`/`Text`/`View`
 * primitives (a flexbox subset, one column, no tables) — this produces a strictly linear PDF
 * text stream with no absolutely-positioned or multi-column text runs, which is exactly the
 * ATS-parseability property the PDF library choice was made to preserve (see spectech.md's
 * Technical Decisions / Implementation Notes). Do not "improve" this template with a
 * multi-column or table layout — that would reopen the ATS hazard this design avoids.
 * Uses `React.createElement` (no JSX) so this stays a plain `.ts` service file, matching the
 * Component & File Map's `cvPdfService.ts` path.
 *
 * Only `included: true` bullets/summary/skills are rendered — the persisted `included` flag,
 * not mere presence in the snapshot pool, governs what's exported (FR-3a/FR-15).
 */

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  name: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  title: {
    fontSize: 11,
    marginBottom: 4,
  },
  contactLine: {
    fontSize: 9,
    color: "#444444",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  entityBlock: {
    marginBottom: 8,
  },
  entityHeading: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  entitySubheading: {
    fontSize: 9,
    color: "#444444",
    marginBottom: 3,
  },
  bulletLine: {
    fontSize: 10,
    marginBottom: 2,
    lineHeight: 1.3,
  },
  paragraphLine: {
    fontSize: 10,
    marginBottom: 4,
    lineHeight: 1.3,
  },
  skillLine: {
    fontSize: 10,
    marginBottom: 2,
  },
});

function formatMonthYear(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatDateRange(
  startDate: string | null,
  endDate: string | null,
  current: boolean,
  hideEndDate: boolean = false,
): string {
  const start = formatMonthYear(startDate);
  if (hideEndDate) return start;
  const end = current || !endDate ? "Present" : formatMonthYear(endDate);
  return start ? `${start} - ${end}` : end;
}

function includedBullets(bullets: CVSnapshotBullet[]): CVSnapshotBullet[] {
  return bullets
    .filter((b) => b.included)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function bulletLines(bullets: CVSnapshotBullet[]) {
  return includedBullets(bullets).map((bullet) =>
    createElement(
      Text,
      {
        key: bullet.id,
        style:
          bullet.type === "PARAGRAPH"
            ? styles.paragraphLine
            : styles.bulletLine,
      },
      bullet.type === "PARAGRAPH" ? bullet.text : `• ${bullet.text}`,
    ),
  );
}

function experienceSection(experiences: CVSnapshotExperience[]) {
  if (experiences.length === 0) return null;
  return createElement(View, { key: "experience" }, [
    createElement(
      Text,
      { key: "title", style: styles.sectionTitle },
      "Experience",
    ),
    ...experiences.map((exp) =>
      createElement(View, { key: exp.id, style: styles.entityBlock }, [
        createElement(
          Text,
          { key: "heading", style: styles.entityHeading },
          `${exp.position} — ${exp.company}`,
        ),
        createElement(
          Text,
          { key: "subheading", style: styles.entitySubheading },
          formatDateRange(exp.startDate, exp.endDate, exp.current),
        ),
        ...bulletLines(exp.bullets),
      ]),
    ),
  ]);
}

function educationSection(education: CVSnapshotEducation[]) {
  if (education.length === 0) return null;
  return createElement(View, { key: "education" }, [
    createElement(
      Text,
      { key: "title", style: styles.sectionTitle },
      "Education",
    ),
    ...education.map((edu) =>
      createElement(View, { key: edu.id, style: styles.entityBlock }, [
        createElement(
          Text,
          { key: "heading", style: styles.entityHeading },
          `${edu.degree}${edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ""} — ${edu.institution}`,
        ),
        createElement(
          Text,
          { key: "subheading", style: styles.entitySubheading },
          formatDateRange(
            edu.startDate,
            edu.endDate,
            edu.current,
            edu.hideEndDate,
          ),
        ),
        ...bulletLines(edu.bullets),
      ]),
    ),
  ]);
}

function projectsSection(projects: CVSnapshotProject[]) {
  if (projects.length === 0) return null;
  return createElement(View, { key: "projects" }, [
    createElement(
      Text,
      { key: "title", style: styles.sectionTitle },
      "Projects",
    ),
    ...projects.map((proj) => {
      const children = [
        createElement(
          Text,
          { key: "heading", style: styles.entityHeading },
          `${proj.name}${proj.technologies.length > 0 ? ` (${proj.technologies.join(", ")})` : ""}`,
        ),
      ];
      if (proj.startDate || proj.endDate) {
        children.push(
          createElement(
            Text,
            { key: "subheading", style: styles.entitySubheading },
            formatDateRange(proj.startDate, proj.endDate, proj.current),
          ),
        );
      }
      children.push(...bulletLines(proj.bullets));
      return createElement(
        View,
        { key: proj.id, style: styles.entityBlock },
        children,
      );
    }),
  ]);
}

/**
 * Renders `snapshot` into a single-column, ATS-safe PDF and returns the resulting Buffer.
 * Only `included: true` bullets/summary/skills are rendered.
 */
export async function renderCVToPdfBuffer(
  snapshot: CVSnapshotData,
): Promise<Buffer> {
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

  const pageChildren = [
    createElement(Text, { key: "name", style: styles.name }, fullName),
    basicData.title
      ? createElement(
          Text,
          { key: "role-title", style: styles.title },
          basicData.title,
        )
      : null,
    contactParts.length > 0
      ? createElement(
          Text,
          { key: "contact", style: styles.contactLine },
          contactParts.join("  |  "),
        )
      : null,
    includedSummary
      ? createElement(View, { key: "summary" }, [
          createElement(
            Text,
            { key: "title", style: styles.sectionTitle },
            "Summary",
          ),
          createElement(
            Text,
            { key: "content", style: styles.paragraphLine },
            includedSummary.content,
          ),
        ])
      : null,
    experienceSection(snapshot.experiences),
    educationSection(snapshot.education),
    projectsSection(snapshot.projects),
    includedSkills.length > 0
      ? createElement(View, { key: "skills" }, [
          createElement(
            Text,
            { key: "title", style: styles.sectionTitle },
            "Skills",
          ),
          ...includedSkills.map((skill) =>
            createElement(
              Text,
              { key: skill.id, style: styles.skillLine },
              `${skill.name} — ${skill.proficiency}${
                skill.yearsExperience ? ` (${skill.yearsExperience} yrs)` : ""
              }`,
            ),
          ),
        ])
      : null,
  ].filter(Boolean);

  const document = createElement(
    Document,
    null,
    createElement(Page, { size: "A4", style: styles.page }, pageChildren),
  );

  try {
    const buffer = await renderToBuffer(document);

    logger.info("cv_pdf_generated", {
      experienceCount: snapshot.experiences.length,
      skillCount: includedSkills.length,
    });

    return buffer;
  } catch (error) {
    logger.error("Failed to render CV PDF", { error });
    throw error;
  }
}
