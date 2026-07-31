/**
 * @jest-environment node
 *
 * `@react-pdf/renderer` is auto-mocked via the root `__mocks__/@react-pdf/renderer.js` manual
 * mock (ESM-only package, no CJS build Jest can transform — see that file's header comment).
 * The mock's `renderToBuffer` collects every text node from the built element tree into one
 * `%PDF`-prefixed Buffer, which is enough to assert on `cvPdfService.ts`'s actual logic under
 * test: which bullets/summary/skills get included based on `included: true`.
 */
import { renderCVToPdfBuffer } from "@/services/cvPdfService";
import type { CVSnapshotData } from "@/types/cv";

jest.mock("@/lib/logging/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

function buildSnapshot(
  overrides: Partial<CVSnapshotData> = {},
): CVSnapshotData {
  return {
    version: 1,
    basicData: {
      firstName: "Jane",
      lastName: "Doe",
      phone: null,
      location: null,
      linkedin: null,
      github: null,
      website: null,
      title: "Senior Engineer",
    },
    summaries: [],
    experiences: [],
    education: [],
    projects: [],
    skills: [],
    ...overrides,
  };
}

describe("cvPdfService.renderCVToPdfBuffer", () => {
  it("produces a valid PDF buffer from a representative CVSnapshotData", async () => {
    const snapshot = buildSnapshot({
      experiences: [
        {
          id: "e1",
          sourceExperienceId: "e1",
          company: "Acme",
          position: "Engineer",
          startDate: "2020-01-01",
          endDate: null,
          current: true,
          tabLabel: null,
          freeFormContext: [],
          bullets: [
            {
              id: "b1",
              sourceBulletId: "b1",
              text: "Shipped features",
              type: "BULLET",
              included: true,
              sortOrder: 0,
            },
          ],
        },
      ],
    });

    const buffer = await renderCVToPdfBuffer(snapshot);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.toString("utf-8")).toContain("Shipped features");
  });

  it("only renders included: true bullets — excluded bullets never appear in the output", async () => {
    const snapshot = buildSnapshot({
      experiences: [
        {
          id: "e1",
          sourceExperienceId: "e1",
          company: "Acme",
          position: "Engineer",
          startDate: "2020-01-01",
          endDate: null,
          current: true,
          tabLabel: null,
          freeFormContext: [],
          bullets: [
            {
              id: "b1",
              sourceBulletId: "b1",
              text: "INCLUDEDMARKERTEXT",
              type: "BULLET",
              included: true,
              sortOrder: 0,
            },
            {
              id: "b2",
              sourceBulletId: "b2",
              text: "EXCLUDEDMARKERTEXT",
              type: "BULLET",
              included: false,
              sortOrder: 1,
            },
          ],
        },
      ],
    });

    const buffer = await renderCVToPdfBuffer(snapshot);
    const text = buffer.toString("utf-8");

    expect(text).toContain("INCLUDEDMARKERTEXT");
    expect(text).not.toContain("EXCLUDEDMARKERTEXT");
  });

  it("only renders the included summary and included skills", async () => {
    const snapshot = buildSnapshot({
      summaries: [
        {
          id: "s1",
          sourceSummaryId: "s1",
          title: "Included Summary",
          content: "INCLUDEDSUMMARYTEXT",
          isAIGenerated: false,
          included: true,
        },
        {
          id: "s2",
          sourceSummaryId: "s2",
          title: "Excluded Summary",
          content: "EXCLUDEDSUMMARYTEXT",
          isAIGenerated: false,
          included: false,
        },
      ],
      skills: [
        {
          id: "sk1",
          sourceSkillId: "sk1",
          name: "INCLUDEDSKILLTEXT",
          proficiency: "EXPERT",
          yearsExperience: 5,
          included: true,
        },
        {
          id: "sk2",
          sourceSkillId: "sk2",
          name: "EXCLUDEDSKILLTEXT",
          proficiency: "BEGINNER",
          yearsExperience: null,
          included: false,
        },
      ],
    });

    const buffer = await renderCVToPdfBuffer(snapshot);
    const text = buffer.toString("utf-8");

    expect(text).toContain("INCLUDEDSUMMARYTEXT");
    expect(text).not.toContain("EXCLUDEDSUMMARYTEXT");
    expect(text).toContain("INCLUDEDSKILLTEXT");
    expect(text).not.toContain("EXCLUDEDSKILLTEXT");
  });

  it("only includes entities/bullets present in the snapshot arrays (deleted items absent entirely)", async () => {
    const snapshot = buildSnapshot({
      education: [
        {
          id: "ed1",
          sourceEducationId: "ed1",
          institution: "State University",
          degree: "BSc",
          fieldOfStudy: "CS",
          startDate: "2016-01-01",
          endDate: "2020-01-01",
          current: false,
          hideEndDate: false,
          tabLabel: null,
          freeFormContext: [],
          bullets: [],
        },
      ],
    });

    const buffer = await renderCVToPdfBuffer(snapshot);
    const text = buffer.toString("utf-8");

    expect(text).toContain("State University");
  });
});
