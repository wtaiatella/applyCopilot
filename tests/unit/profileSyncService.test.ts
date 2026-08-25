/**
 * @jest-environment node
 */

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

jest.mock("@/lib/db/prisma", () => ({
  prisma: {},
}));

jest.mock("@/lib/ai/aiClient", () => ({
  generateJSON: jest.fn(),
}));

jest.mock("@/lib/logging/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@/services/skillCanonicalizationService", () => ({
  resolveCanonicalSkills: jest.fn(),
}));

import { canonicalizeProfileFacts } from "@/services/profileSyncService";
import { resolveCanonicalSkills } from "@/services/skillCanonicalizationService";
import type { ProfileFacts } from "@/lib/validation/profileFactsSchema";

const mockResolveCanonicalSkills = resolveCanonicalSkills as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveCanonicalSkills.mockResolvedValue(new Map());
});

describe("canonicalizeProfileFacts — security fix (Phase 3 rework, hard-block cap)", () => {
  it("caps an oversized raw `skills`/`softSkills` extraction to 50 items before calling resolveCanonicalSkills", async () => {
    const oversizedSkills = Array.from({ length: 60 }, (_, i) => `skill-${i}`);
    const oversizedSoftSkills = Array.from(
      { length: 60 },
      (_, i) => `soft-${i}`,
    );

    const rawProfileFacts = {
      skills: oversizedSkills,
      softSkills: oversizedSoftSkills,
      seniority: "senior",
      totalYearsExperience: 10,
      domains: ["fintech"],
    } as unknown as ProfileFacts;

    await canonicalizeProfileFacts(rawProfileFacts);

    expect(mockResolveCanonicalSkills).toHaveBeenCalledTimes(2);

    const [hardCallArgs, softCallArgs] = mockResolveCanonicalSkills.mock
      .calls as Array<[string[], string]>;

    expect(hardCallArgs[0]).toHaveLength(50);
    expect(hardCallArgs[1]).toBe("HARD");

    expect(softCallArgs[0]).toHaveLength(50);
    expect(softCallArgs[1]).toBe("SOFT");
  });
});
