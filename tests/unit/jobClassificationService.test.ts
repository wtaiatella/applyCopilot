/**
 * @jest-environment node
 */

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

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

import { canonicalizeJobFacts } from "@/services/jobClassificationService";
import { resolveCanonicalSkills } from "@/services/skillCanonicalizationService";
import type { JobFacts } from "@/lib/validation/jobFactsSchema";

const mockResolveCanonicalSkills = resolveCanonicalSkills as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveCanonicalSkills.mockResolvedValue(new Map());
});

describe("canonicalizeJobFacts — security fix (Phase 3 rework, hard-block cap)", () => {
  it("caps an oversized raw `mustHave`/`niceToHave`/`softSkills` extraction to 50 items each before calling resolveCanonicalSkills", async () => {
    const oversizedMustHave = Array.from({ length: 60 }, (_, i) => `must-${i}`);
    const oversizedNiceToHave = Array.from(
      { length: 60 },
      (_, i) => `nice-${i}`,
    );
    const oversizedSoftSkills = Array.from(
      { length: 60 },
      (_, i) => `soft-${i}`,
    );

    const rawJobFacts = {
      mustHave: oversizedMustHave,
      niceToHave: oversizedNiceToHave,
      softSkills: oversizedSoftSkills,
      seniority: null,
      yearsExperienceMin: null,
      employmentType: null,
      workMode: null,
      isWorldwide: null,
      requiresUsWorkAuth: null,
      providesRelocationVisa: null,
      location: null,
      salaryMin: null,
      salaryMax: null,
      currency: null,
    } as unknown as JobFacts;

    await canonicalizeJobFacts(rawJobFacts);

    expect(mockResolveCanonicalSkills).toHaveBeenCalledTimes(2);

    const [hardCallArgs, softCallArgs] = mockResolveCanonicalSkills.mock
      .calls as Array<[string[], string]>;

    // mustHave + niceToHave are each capped to 50 before being merged, so the
    // combined "HARD" call receives at most 100 items (50 + 50), never the
    // raw 60 + 60 = 120.
    expect(hardCallArgs[0]).toHaveLength(100);
    expect(hardCallArgs[1]).toBe("HARD");

    expect(softCallArgs[0]).toHaveLength(50);
    expect(softCallArgs[1]).toBe("SOFT");
  });
});
