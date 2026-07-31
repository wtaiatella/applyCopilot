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
  reconcileSummaryMutation,
  reconcileSkillMutation,
} from "@/lib/db/cvBulletMutations";

function buildTx(cvBulletCount: number) {
  return {
    cVBullet: { count: jest.fn().mockResolvedValue(cvBulletCount) },
    profileSummary: {
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({ id: "new-summary-id" }),
    },
    skill: {
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({ id: "new-skill-id" }),
    },
  } as unknown as Parameters<typeof reconcileSummaryMutation>[0] & {
    cVBullet: { count: jest.Mock };
    profileSummary: { update: jest.Mock; create: jest.Mock };
    skill: { update: jest.Mock; create: jest.Mock };
  };
}

describe("reconcileSummaryMutation", () => {
  it("updates in-place when the summary has never been used in a CV", async () => {
    const tx = buildTx(0);
    const result = await reconcileSummaryMutation(
      tx,
      "summary-1",
      "New content",
      "profile-1",
      "Title",
      false,
      2,
    );

    expect(tx.profileSummary.update).toHaveBeenCalledWith({
      where: { id: "summary-1" },
      data: { content: "New content", title: "Title" },
    });
    expect(tx.profileSummary.create).not.toHaveBeenCalled();
    expect(result).toEqual({ action: "updated", newId: "summary-1" });
  });

  it("archives the original and creates a replacement when used elsewhere", async () => {
    const tx = buildTx(2);
    const result = await reconcileSummaryMutation(
      tx,
      "summary-1",
      "New content",
      "profile-1",
      "Title",
      true,
      2,
    );

    expect(tx.profileSummary.update).toHaveBeenCalledWith({
      where: { id: "summary-1" },
      data: { isActive: false },
    });
    expect(tx.profileSummary.create).toHaveBeenCalledWith({
      data: {
        profileId: "profile-1",
        title: "Title",
        content: "New content",
        isAIGenerated: true,
        isActive: true,
        sortOrder: 2,
      },
    });
    expect(result).toEqual({
      action: "archived_and_created",
      newId: "new-summary-id",
    });
  });
});

describe("reconcileSkillMutation", () => {
  it("updates in-place when the skill has never been used in a CV (never touches the partial unique index)", async () => {
    const tx = buildTx(0);
    const result = await reconcileSkillMutation(
      tx,
      "skill-1",
      "profile-1",
      "TypeScript",
      "ADVANCED",
      5,
    );

    expect(tx.skill.update).toHaveBeenCalledWith({
      where: { id: "skill-1" },
      data: { name: "TypeScript", proficiency: "ADVANCED", yearsExperience: 5 },
    });
    expect(tx.skill.create).not.toHaveBeenCalled();
    expect(result).toEqual({ action: "updated", newId: "skill-1" });
  });

  it("archives the original (freeing the partial unique index slot) and creates a replacement when used elsewhere", async () => {
    const tx = buildTx(1);
    const result = await reconcileSkillMutation(
      tx,
      "skill-1",
      "profile-1",
      "TypeScript",
      "ADVANCED",
      5,
    );

    expect(tx.skill.update).toHaveBeenCalledWith({
      where: { id: "skill-1" },
      data: { isArchived: true, isActive: false },
    });
    expect(tx.skill.create).toHaveBeenCalledWith({
      data: {
        profileId: "profile-1",
        name: "TypeScript",
        proficiency: "ADVANCED",
        yearsExperience: 5,
        isActive: true,
        isArchived: false,
      },
    });
    expect(result).toEqual({
      action: "archived_and_created",
      newId: "new-skill-id",
    });
  });
});
