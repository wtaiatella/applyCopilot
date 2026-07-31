/**
 * @jest-environment node
 */

jest.mock("@/lib/logging/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  reconcileCVApply,
  CVApplyOwnershipViolationError,
} from "@/services/cvReconciliationService";
import type { CVSnapshotData } from "@/types/cv";

type MockTable = {
  create: jest.Mock;
  update: jest.Mock;
  findMany: jest.Mock;
  findFirst: jest.Mock;
};

function mockTable(): MockTable {
  return {
    create: jest.fn().mockResolvedValue({ id: "created-id" }),
    update: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    // Defaults to "owned" (row found) so every pre-existing test that doesn't care about
    // ownership keeps working unchanged; ownership-violation tests override this to null.
    findFirst: jest.fn().mockResolvedValue({ id: "owned-id" }),
  };
}

/** Builds a fresh, fully-mocked Prisma tx client covering every table `reconcileCVApply` touches. */
function buildTx() {
  const tx = {
    experience: mockTable(),
    education: mockTable(),
    project: mockTable(),
    experienceBullet: mockTable(),
    educationBullet: mockTable(),
    projectBullet: mockTable(),
    profileSummary: mockTable(),
    skill: mockTable(),
    cVBullet: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: "cvbullet-id" }),
    },
  };
  return tx as unknown as Parameters<typeof reconcileCVApply>[0] & typeof tx;
}

function emptySnapshot(): CVSnapshotData {
  return {
    version: 1,
    basicData: {
      firstName: null,
      lastName: null,
      phone: null,
      location: null,
      linkedin: null,
      github: null,
      website: null,
      title: null,
    },
    summaries: [],
    experiences: [],
    education: [],
    projects: [],
    skills: [],
  };
}

const CV = { id: "cv_1", profileId: "profile_1" };

describe("cvReconciliationService.reconcileCVApply", () => {
  // ─────────────────────────────────────────────────────────────
  // Shared assertion helper — asserts the identical 3-way outcome
  // shape across bullet/summary/skill kinds (Risks table row 3).
  // ─────────────────────────────────────────────────────────────
  function expectMarkedUsedOnly(
    cvBulletCreate: jest.Mock,
    expectedData: Record<string, unknown>,
  ) {
    expect(cvBulletCreate).toHaveBeenCalledWith({
      data: expect.objectContaining(expectedData),
    });
  }

  describe("bullets — unchanged / edited / new (across experience/education/project)", () => {
    const cases = [
      {
        kind: "experience" as const,
        table: "experienceBullet" as const,
        fk: "experienceBulletId" as const,
        sourceField: "sourceExperienceId" as const,
        listField: "experiences" as const,
      },
      {
        kind: "education" as const,
        table: "educationBullet" as const,
        fk: "educationBulletId" as const,
        sourceField: "sourceEducationId" as const,
        listField: "education" as const,
      },
      {
        kind: "project" as const,
        table: "projectBullet" as const,
        fk: "projectBulletId" as const,
        sourceField: "sourceProjectId" as const,
        listField: "projects" as const,
      },
    ];

    for (const { kind, table, fk, sourceField, listField } of cases) {
      it(`${kind}: unchanged bullet is marked used with no master mutation`, async () => {
        const tx = buildTx();
        tx[table].findMany.mockResolvedValue([
          { id: "master-bullet-1", text: "Same text", type: "BULLET" },
        ]);

        const snapshot = emptySnapshot();
        (snapshot[listField] as unknown[]).push({
          id: "entity-1",
          [sourceField]: "master-entity-1",
          company: "Acme",
          position: "Eng",
          institution: "Acme",
          degree: "BSc",
          fieldOfStudy: null,
          name: "Proj",
          startDate: "2020-01-01T00:00:00.000Z",
          endDate: null,
          current: true,
          hideEndDate: false,
          technologies: [],
          tabLabel: "renamed-locally",
          freeFormContext: [],
          bullets: [
            {
              id: "b1",
              sourceBulletId: "master-bullet-1",
              text: "Same text",
              type: "BULLET",
              included: true,
              sortOrder: 0,
            },
          ],
        });

        await reconcileCVApply(tx, {
          id: CV.id,
          profileId: CV.profileId,
          snapshotData: snapshot,
        });

        expect(tx[table].create).not.toHaveBeenCalled();
        expect(tx[table].update).not.toHaveBeenCalled();
        expectMarkedUsedOnly(tx.cVBullet.create, {
          cvId: CV.id,
          [fk]: "master-bullet-1",
          renderedText: "Same text",
        });
      });

      it(`${kind}: edited bullet reconciles via reconcileBulletMutation (archive+replace when used elsewhere)`, async () => {
        const tx = buildTx();
        tx[table].findMany.mockResolvedValue([
          { id: "master-bullet-1", text: "Original text", type: "BULLET" },
        ]);
        // usedCount > 0 → archive+replace path inside reconcileBulletMutation
        tx.cVBullet.count.mockResolvedValue(1);
        tx[table].create.mockResolvedValue({ id: "new-bullet-id" });

        const snapshot = emptySnapshot();
        (snapshot[listField] as unknown[]).push({
          id: "entity-1",
          [sourceField]: "master-entity-1",
          company: "Acme",
          position: "Eng",
          institution: "Acme",
          degree: "BSc",
          fieldOfStudy: null,
          name: "Proj",
          startDate: "2020-01-01T00:00:00.000Z",
          endDate: null,
          current: true,
          hideEndDate: false,
          technologies: [],
          tabLabel: null,
          freeFormContext: [],
          bullets: [
            {
              id: "b1",
              sourceBulletId: "master-bullet-1",
              text: "Edited text",
              type: "BULLET",
              included: true,
              sortOrder: 0,
            },
          ],
        });

        await reconcileCVApply(tx, {
          id: CV.id,
          profileId: CV.profileId,
          snapshotData: snapshot,
        });

        // Archived original
        expect(tx[table].update).toHaveBeenCalledWith({
          where: { id: "master-bullet-1" },
          data: { isArchived: true, isActive: false },
        });
        // Created replacement
        expect(tx[table].create).toHaveBeenCalledWith({
          data: expect.objectContaining({ text: "Edited text" }),
        });
        expectMarkedUsedOnly(tx.cVBullet.create, {
          cvId: CV.id,
          [fk]: "new-bullet-id",
          renderedText: "Edited text",
        });
      });

      it(`${kind}: brand-new bullet (no sourceBulletId) is created fresh and active, then marked used`, async () => {
        const tx = buildTx();
        tx[table].create.mockResolvedValue({ id: "brand-new-bullet-id" });

        const snapshot = emptySnapshot();
        (snapshot[listField] as unknown[]).push({
          id: "entity-1",
          [sourceField]: "master-entity-1",
          company: "Acme",
          position: "Eng",
          institution: "Acme",
          degree: "BSc",
          fieldOfStudy: null,
          name: "Proj",
          startDate: "2020-01-01T00:00:00.000Z",
          endDate: null,
          current: true,
          hideEndDate: false,
          technologies: [],
          tabLabel: null,
          freeFormContext: [],
          bullets: [
            {
              id: "b1",
              sourceBulletId: null,
              text: "Brand new bullet",
              type: "BULLET",
              included: true,
              sortOrder: 0,
            },
          ],
        });

        await reconcileCVApply(tx, {
          id: CV.id,
          profileId: CV.profileId,
          snapshotData: snapshot,
        });

        expect(tx[table].create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            text: "Brand new bullet",
            isActive: true,
            isArchived: false,
          }),
        });
        expectMarkedUsedOnly(tx.cVBullet.create, {
          cvId: CV.id,
          [fk]: "brand-new-bullet-id",
          renderedText: "Brand new bullet",
        });
      });

      it(`${kind}: non-included pool bullet produces zero master-Profile calls (AC.3a)`, async () => {
        const tx = buildTx();
        tx[table].findMany.mockResolvedValue([
          { id: "master-bullet-1", text: "Same text", type: "BULLET" },
        ]);

        const snapshot = emptySnapshot();
        (snapshot[listField] as unknown[]).push({
          id: "entity-1",
          [sourceField]: "master-entity-1",
          company: "Acme",
          position: "Eng",
          institution: "Acme",
          degree: "BSc",
          fieldOfStudy: null,
          name: "Proj",
          startDate: "2020-01-01T00:00:00.000Z",
          endDate: null,
          current: true,
          hideEndDate: false,
          technologies: [],
          tabLabel: null,
          freeFormContext: [],
          bullets: [
            {
              id: "excluded-1",
              sourceBulletId: null,
              text: "AI candidate never included",
              type: "BULLET",
              included: false,
              sortOrder: 1,
            },
            {
              id: "excluded-2",
              sourceBulletId: "master-bullet-1",
              text: "Was in pool, deselected",
              type: "BULLET",
              included: false,
              sortOrder: 2,
            },
          ],
        });

        await reconcileCVApply(tx, {
          id: CV.id,
          profileId: CV.profileId,
          snapshotData: snapshot,
        });

        expect(tx[table].create).not.toHaveBeenCalled();
        expect(tx[table].update).not.toHaveBeenCalled();
        expect(tx.cVBullet.create).not.toHaveBeenCalled();
      });
    }
  });

  describe("brand-new entities (FR-16)", () => {
    it("creates a brand-new Experience on the master Profile when sourceExperienceId is null", async () => {
      const tx = buildTx();
      tx.experience.create.mockResolvedValue({ id: "new-experience-id" });

      const snapshot = emptySnapshot();
      snapshot.experiences.push({
        id: "local-exp-1",
        sourceExperienceId: null,
        company: "New Co",
        position: "New Role",
        startDate: "2022-01-01T00:00:00.000Z",
        endDate: null,
        current: true,
        tabLabel: null,
        freeFormContext: [],
        bullets: [],
      });

      await reconcileCVApply(tx, {
        id: CV.id,
        profileId: CV.profileId,
        snapshotData: snapshot,
      });

      expect(tx.experience.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          profileId: CV.profileId,
          company: "New Co",
          position: "New Role",
        }),
      });
    });

    it("creates a brand-new Education entry on the master Profile when sourceEducationId is null", async () => {
      const tx = buildTx();
      tx.education.create.mockResolvedValue({ id: "new-education-id" });

      const snapshot = emptySnapshot();
      snapshot.education.push({
        id: "local-edu-1",
        sourceEducationId: null,
        institution: "New University",
        degree: "MSc",
        fieldOfStudy: "CS",
        startDate: "2022-01-01T00:00:00.000Z",
        endDate: null,
        current: true,
        hideEndDate: false,
        tabLabel: null,
        freeFormContext: [],
        bullets: [],
      });

      await reconcileCVApply(tx, {
        id: CV.id,
        profileId: CV.profileId,
        snapshotData: snapshot,
      });

      expect(tx.education.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          profileId: CV.profileId,
          institution: "New University",
          degree: "MSc",
        }),
      });
    });

    it("creates a brand-new Project on the master Profile when sourceProjectId is null", async () => {
      const tx = buildTx();
      tx.project.create.mockResolvedValue({ id: "new-project-id" });

      const snapshot = emptySnapshot();
      snapshot.projects.push({
        id: "local-proj-1",
        sourceProjectId: null,
        name: "New Project",
        startDate: null,
        endDate: null,
        current: true,
        technologies: ["TypeScript"],
        tabLabel: null,
        freeFormContext: [],
        bullets: [],
      });

      await reconcileCVApply(tx, {
        id: CV.id,
        profileId: CV.profileId,
        snapshotData: snapshot,
      });

      expect(tx.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          profileId: CV.profileId,
          name: "New Project",
        }),
      });
    });
  });

  describe("metadata-only edits (FR-17, AC.10)", () => {
    it("never propagates a tab-label rename on an existing entity to the master Profile", async () => {
      const tx = buildTx();
      tx.experienceBullet.findMany.mockResolvedValue([
        { id: "master-bullet-1", text: "Unchanged bullet", type: "BULLET" },
      ]);

      const snapshot = emptySnapshot();
      snapshot.experiences.push({
        id: "entity-1",
        sourceExperienceId: "master-experience-1",
        company: "Acme",
        position: "Eng",
        startDate: "2020-01-01T00:00:00.000Z",
        endDate: null,
        current: true,
        tabLabel: "Renamed Tab Label", // metadata-only edit — must stay CV-local
        freeFormContext: [],
        bullets: [
          {
            id: "b1",
            sourceBulletId: "master-bullet-1",
            text: "Unchanged bullet",
            type: "BULLET",
            included: true,
            sortOrder: 0,
          },
        ],
      });

      await reconcileCVApply(tx, {
        id: CV.id,
        profileId: CV.profileId,
        snapshotData: snapshot,
      });

      // No `experience.update` call exists at all in the mock tx surface used by the
      // service — by construction there is no code path that could write tabLabel back.
      expect(tx.experience.create).not.toHaveBeenCalled();
      expect(tx.experience.update).not.toHaveBeenCalled();
      // Only the unchanged bullet is marked used.
      expect(tx.cVBullet.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("summary — unchanged / edited / new", () => {
    it("marks an unchanged summary used with no master mutation", async () => {
      const tx = buildTx();
      tx.profileSummary.findFirst.mockResolvedValue({
        content: "Same content",
      });

      const snapshot = emptySnapshot();
      snapshot.summaries.push({
        id: "s1",
        sourceSummaryId: "master-summary-1",
        title: "Main",
        content: "Same content",
        isAIGenerated: false,
        included: true,
      });

      await reconcileCVApply(tx, {
        id: CV.id,
        profileId: CV.profileId,
        snapshotData: snapshot,
      });

      expect(tx.profileSummary.update).not.toHaveBeenCalled();
      expect(tx.profileSummary.create).not.toHaveBeenCalled();
      expectMarkedUsedOnly(tx.cVBullet.create, {
        cvId: CV.id,
        summaryId: "master-summary-1",
        renderedText: "Same content",
      });
    });

    it("reconciles an edited summary via reconcileSummaryMutation (in-place when unused elsewhere)", async () => {
      const tx = buildTx();
      tx.profileSummary.findFirst.mockResolvedValue({
        content: "Old content",
      });
      tx.cVBullet.count.mockResolvedValue(0); // unused elsewhere → in-place update

      const snapshot = emptySnapshot();
      snapshot.summaries.push({
        id: "s1",
        sourceSummaryId: "master-summary-1",
        title: "Main",
        content: "New content",
        isAIGenerated: false,
        included: true,
      });

      await reconcileCVApply(tx, {
        id: CV.id,
        profileId: CV.profileId,
        snapshotData: snapshot,
      });

      expect(tx.profileSummary.update).toHaveBeenCalledWith({
        where: { id: "master-summary-1" },
        data: { content: "New content", title: "Main" },
      });
      expect(tx.profileSummary.create).not.toHaveBeenCalled();
      expectMarkedUsedOnly(tx.cVBullet.create, {
        cvId: CV.id,
        summaryId: "master-summary-1",
        renderedText: "New content",
      });
    });

    it("archives and replaces an edited summary already used elsewhere", async () => {
      const tx = buildTx();
      tx.profileSummary.findFirst.mockResolvedValue({
        content: "Old content",
      });
      tx.cVBullet.count.mockResolvedValue(1); // used elsewhere → archive + replace
      tx.profileSummary.create.mockResolvedValue({ id: "new-summary-id" });

      const snapshot = emptySnapshot();
      snapshot.summaries.push({
        id: "s1",
        sourceSummaryId: "master-summary-1",
        title: "Main",
        content: "New content",
        isAIGenerated: false,
        included: true,
      });

      await reconcileCVApply(tx, {
        id: CV.id,
        profileId: CV.profileId,
        snapshotData: snapshot,
      });

      expect(tx.profileSummary.update).toHaveBeenCalledWith({
        where: { id: "master-summary-1" },
        data: { isActive: false },
      });
      expect(tx.profileSummary.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ content: "New content" }),
      });
      expectMarkedUsedOnly(tx.cVBullet.create, {
        cvId: CV.id,
        summaryId: "new-summary-id",
        renderedText: "New content",
      });
    });

    it("creates a brand-new summary (no sourceSummaryId)", async () => {
      const tx = buildTx();
      tx.profileSummary.create.mockResolvedValue({
        id: "brand-new-summary-id",
      });

      const snapshot = emptySnapshot();
      snapshot.summaries.push({
        id: "s1",
        sourceSummaryId: null,
        title: "New Variant",
        content: "Brand new content",
        isAIGenerated: false,
        included: true,
      });

      await reconcileCVApply(tx, {
        id: CV.id,
        profileId: CV.profileId,
        snapshotData: snapshot,
      });

      expect(tx.profileSummary.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          profileId: CV.profileId,
          content: "Brand new content",
          isActive: true,
        }),
      });
      expectMarkedUsedOnly(tx.cVBullet.create, {
        cvId: CV.id,
        summaryId: "brand-new-summary-id",
        renderedText: "Brand new content",
      });
    });

    it("non-included summary produces zero master-Profile calls (AC.3a)", async () => {
      const tx = buildTx();

      const snapshot = emptySnapshot();
      snapshot.summaries.push({
        id: "s1",
        sourceSummaryId: "master-summary-1",
        title: "Unused variant",
        content: "Never included",
        isAIGenerated: false,
        included: false,
      });

      await reconcileCVApply(tx, {
        id: CV.id,
        profileId: CV.profileId,
        snapshotData: snapshot,
      });

      expect(tx.profileSummary.findFirst).not.toHaveBeenCalled();
      expect(tx.profileSummary.update).not.toHaveBeenCalled();
      expect(tx.profileSummary.create).not.toHaveBeenCalled();
      expect(tx.cVBullet.create).not.toHaveBeenCalled();
    });
  });

  describe("skill — unchanged / edited / new (partial unique index path)", () => {
    it("marks an unchanged skill used with no master mutation", async () => {
      const tx = buildTx();
      tx.skill.findFirst.mockResolvedValue({
        name: "TypeScript",
        proficiency: "ADVANCED",
        yearsExperience: 5,
      });

      const snapshot = emptySnapshot();
      snapshot.skills.push({
        id: "sk1",
        sourceSkillId: "master-skill-1",
        name: "TypeScript",
        proficiency: "ADVANCED",
        yearsExperience: 5,
        included: true,
      });

      await reconcileCVApply(tx, {
        id: CV.id,
        profileId: CV.profileId,
        snapshotData: snapshot,
      });

      expect(tx.skill.update).not.toHaveBeenCalled();
      expect(tx.skill.create).not.toHaveBeenCalled();
      expectMarkedUsedOnly(tx.cVBullet.create, {
        cvId: CV.id,
        skillId: "master-skill-1",
        renderedText: "TypeScript (ADVANCED)",
      });
    });

    it("updates an edited, unused-elsewhere skill in-place (respects the partial unique index by never duplicating an active name)", async () => {
      const tx = buildTx();
      tx.skill.findFirst.mockResolvedValue({
        name: "TypeScript",
        proficiency: "INTERMEDIATE",
        yearsExperience: 2,
      });
      tx.cVBullet.count.mockResolvedValue(0);

      const snapshot = emptySnapshot();
      snapshot.skills.push({
        id: "sk1",
        sourceSkillId: "master-skill-1",
        name: "TypeScript",
        proficiency: "ADVANCED",
        yearsExperience: 5,
        included: true,
      });

      await reconcileCVApply(tx, {
        id: CV.id,
        profileId: CV.profileId,
        snapshotData: snapshot,
      });

      expect(tx.skill.update).toHaveBeenCalledWith({
        where: { id: "master-skill-1" },
        data: {
          name: "TypeScript",
          proficiency: "ADVANCED",
          yearsExperience: 5,
        },
      });
      expect(tx.skill.create).not.toHaveBeenCalled();
    });

    it("archives the original and creates a replacement when the edited skill is used elsewhere (partial unique index path)", async () => {
      const tx = buildTx();
      tx.skill.findFirst.mockResolvedValue({
        name: "TypeScript",
        proficiency: "INTERMEDIATE",
        yearsExperience: 2,
      });
      tx.cVBullet.count.mockResolvedValue(1);
      tx.skill.create.mockResolvedValue({ id: "new-skill-id" });

      const snapshot = emptySnapshot();
      snapshot.skills.push({
        id: "sk1",
        sourceSkillId: "master-skill-1",
        name: "TypeScript",
        proficiency: "ADVANCED",
        yearsExperience: 5,
        included: true,
      });

      await reconcileCVApply(tx, {
        id: CV.id,
        profileId: CV.profileId,
        snapshotData: snapshot,
      });

      // Archive first — this is what frees the (profileId, name) slot under the partial
      // unique index (scoped to isArchived = false) before the replacement is created.
      expect(tx.skill.update).toHaveBeenCalledWith({
        where: { id: "master-skill-1" },
        data: { isArchived: true, isActive: false },
      });
      expect(tx.skill.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "TypeScript",
          proficiency: "ADVANCED",
          isActive: true,
          isArchived: false,
        }),
      });
      expectMarkedUsedOnly(tx.cVBullet.create, {
        cvId: CV.id,
        skillId: "new-skill-id",
        renderedText: "TypeScript (ADVANCED)",
      });
    });

    it("creates a brand-new skill (no sourceSkillId)", async () => {
      const tx = buildTx();
      tx.skill.create.mockResolvedValue({ id: "brand-new-skill-id" });

      const snapshot = emptySnapshot();
      snapshot.skills.push({
        id: "sk1",
        sourceSkillId: null,
        name: "Rust",
        proficiency: "BEGINNER",
        yearsExperience: null,
        included: true,
      });

      await reconcileCVApply(tx, {
        id: CV.id,
        profileId: CV.profileId,
        snapshotData: snapshot,
      });

      expect(tx.skill.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          profileId: CV.profileId,
          name: "Rust",
          isActive: true,
          isArchived: false,
        }),
      });
      expectMarkedUsedOnly(tx.cVBullet.create, {
        cvId: CV.id,
        skillId: "brand-new-skill-id",
        renderedText: "Rust (BEGINNER)",
      });
    });

    it("non-included skill produces zero master-Profile calls (AC.3a)", async () => {
      const tx = buildTx();

      const snapshot = emptySnapshot();
      snapshot.skills.push({
        id: "sk1",
        sourceSkillId: "master-skill-1",
        name: "Never included",
        proficiency: "BEGINNER",
        yearsExperience: null,
        included: false,
      });

      await reconcileCVApply(tx, {
        id: CV.id,
        profileId: CV.profileId,
        snapshotData: snapshot,
      });

      expect(tx.skill.findFirst).not.toHaveBeenCalled();
      expect(tx.skill.update).not.toHaveBeenCalled();
      expect(tx.skill.create).not.toHaveBeenCalled();
      expect(tx.cVBullet.create).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Cross-tenant IDOR guard: a snapshot-supplied source*Id that does not belong to
  // cv.profileId must reject the whole Apply (CVApplyOwnershipViolationError), never
  // silently create a duplicate or fall through to an unscoped read/update.
  // ─────────────────────────────────────────────────────────────
  describe("cross-tenant IDOR guard — ownership violations reject the whole Apply", () => {
    it("rejects when sourceExperienceId does not belong to cv.profileId", async () => {
      const tx = buildTx();
      tx.experience.findFirst.mockResolvedValue(null); // not owned by this profile

      const snapshot = emptySnapshot();
      snapshot.experiences.push({
        id: "entity-1",
        sourceExperienceId: "other-profiles-experience-id",
        company: "Acme",
        position: "Eng",
        startDate: "2020-01-01T00:00:00.000Z",
        endDate: null,
        current: true,
        tabLabel: null,
        freeFormContext: [],
        bullets: [],
      });

      await expect(
        reconcileCVApply(tx, {
          id: CV.id,
          profileId: CV.profileId,
          snapshotData: snapshot,
        }),
      ).rejects.toThrow(CVApplyOwnershipViolationError);

      expect(tx.experience.findFirst).toHaveBeenCalledWith({
        where: { id: "other-profiles-experience-id", profileId: CV.profileId },
      });
      // Never reached the bullet-loading step for the un-owned parent.
      expect(tx.experienceBullet.findMany).not.toHaveBeenCalled();
    });

    it("rejects when sourceEducationId does not belong to cv.profileId", async () => {
      const tx = buildTx();
      tx.education.findFirst.mockResolvedValue(null);

      const snapshot = emptySnapshot();
      snapshot.education.push({
        id: "entity-1",
        sourceEducationId: "other-profiles-education-id",
        institution: "Acme U",
        degree: "BSc",
        fieldOfStudy: null,
        startDate: "2020-01-01T00:00:00.000Z",
        endDate: null,
        current: true,
        hideEndDate: false,
        tabLabel: null,
        freeFormContext: [],
        bullets: [],
      });

      await expect(
        reconcileCVApply(tx, {
          id: CV.id,
          profileId: CV.profileId,
          snapshotData: snapshot,
        }),
      ).rejects.toThrow(CVApplyOwnershipViolationError);

      expect(tx.educationBullet.findMany).not.toHaveBeenCalled();
    });

    it("rejects when sourceProjectId does not belong to cv.profileId", async () => {
      const tx = buildTx();
      tx.project.findFirst.mockResolvedValue(null);

      const snapshot = emptySnapshot();
      snapshot.projects.push({
        id: "entity-1",
        sourceProjectId: "other-profiles-project-id",
        name: "Side project",
        startDate: null,
        endDate: null,
        current: true,
        technologies: [],
        tabLabel: null,
        freeFormContext: [],
        bullets: [],
      });

      await expect(
        reconcileCVApply(tx, {
          id: CV.id,
          profileId: CV.profileId,
          snapshotData: snapshot,
        }),
      ).rejects.toThrow(CVApplyOwnershipViolationError);

      expect(tx.projectBullet.findMany).not.toHaveBeenCalled();
    });

    it("rejects when a bullet's parent-scoped sourceBulletId ultimately traces to an un-owned experience (the parent-ownership check is the guard, not a per-bullet lookup)", async () => {
      const tx = buildTx();
      tx.experience.findFirst.mockResolvedValue(null);
      tx.experienceBullet.findMany.mockResolvedValue([
        { id: "other-profiles-bullet-id", text: "Some text", type: "BULLET" },
      ]);

      const snapshot = emptySnapshot();
      snapshot.experiences.push({
        id: "entity-1",
        sourceExperienceId: "other-profiles-experience-id",
        company: "Acme",
        position: "Eng",
        startDate: "2020-01-01T00:00:00.000Z",
        endDate: null,
        current: true,
        tabLabel: null,
        freeFormContext: [],
        bullets: [
          {
            id: "b1",
            sourceBulletId: "other-profiles-bullet-id",
            text: "Edited text",
            type: "BULLET",
            included: true,
            sortOrder: 0,
          },
        ],
      });

      await expect(
        reconcileCVApply(tx, {
          id: CV.id,
          profileId: CV.profileId,
          snapshotData: snapshot,
        }),
      ).rejects.toThrow(CVApplyOwnershipViolationError);

      // Ownership check on the parent fails before any bullet mutation is attempted.
      expect(tx.experienceBullet.update).not.toHaveBeenCalled();
      expect(tx.experienceBullet.create).not.toHaveBeenCalled();
    });

    it("rejects when sourceSummaryId does not belong to cv.profileId", async () => {
      const tx = buildTx();
      tx.profileSummary.findFirst.mockResolvedValue(null);

      const snapshot = emptySnapshot();
      snapshot.summaries.push({
        id: "s1",
        sourceSummaryId: "other-profiles-summary-id",
        title: "Main",
        content: "Tailored content",
        isAIGenerated: false,
        included: true,
      });

      await expect(
        reconcileCVApply(tx, {
          id: CV.id,
          profileId: CV.profileId,
          snapshotData: snapshot,
        }),
      ).rejects.toThrow(CVApplyOwnershipViolationError);

      expect(tx.profileSummary.findFirst).toHaveBeenCalledWith({
        where: { id: "other-profiles-summary-id", profileId: CV.profileId },
      });
      expect(tx.profileSummary.update).not.toHaveBeenCalled();
      expect(tx.profileSummary.create).not.toHaveBeenCalled();
    });

    it("rejects when sourceSkillId does not belong to cv.profileId", async () => {
      const tx = buildTx();
      tx.skill.findFirst.mockResolvedValue(null);

      const snapshot = emptySnapshot();
      snapshot.skills.push({
        id: "sk1",
        sourceSkillId: "other-profiles-skill-id",
        name: "Go",
        proficiency: "ADVANCED",
        yearsExperience: 3,
        included: true,
      });

      await expect(
        reconcileCVApply(tx, {
          id: CV.id,
          profileId: CV.profileId,
          snapshotData: snapshot,
        }),
      ).rejects.toThrow(CVApplyOwnershipViolationError);

      expect(tx.skill.findFirst).toHaveBeenCalledWith({
        where: { id: "other-profiles-skill-id", profileId: CV.profileId },
      });
      expect(tx.skill.update).not.toHaveBeenCalled();
      expect(tx.skill.create).not.toHaveBeenCalled();
    });
  });
});
