/**
 * @jest-environment node
 */

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    userProfile: {
      findUnique: jest.fn(),
    },
  },
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

import { prisma } from "@/lib/db/prisma";
import { generateJSON } from "@/lib/ai/aiClient";
import {
  canonicalizeProfileFacts,
  consolidateNarrativeProfileToText,
  consolidateProfileToText,
  extractProfileFacts,
  fetchUserProfileData,
  type ProfileData,
} from "@/services/profileSyncService";
import { resolveCanonicalSkills } from "@/services/skillCanonicalizationService";
import type { ProfileFacts } from "@/lib/validation/profileFactsSchema";

const mockResolveCanonicalSkills = resolveCanonicalSkills as jest.Mock;
const mockGenerateJSON = generateJSON as jest.Mock;
const mockFindUnique = prisma.userProfile.findUnique as jest.Mock;

function makeSampleProfile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    id: "prof-1",
    title: "Senior Full-Stack Engineer",
    summary: "10 years building scalable web apps.",
    experiences: [
      {
        company: "Acme Corp",
        position: "Lead Engineer",
        startDate: new Date("2021-01-01T00:00:00.000Z"),
        endDate: null,
        current: true,
        freeFormContext: ["Led migration to microservices"],
        bullets: [
          {
            text: "Architected multi-tenant event pipeline",
            isActive: true,
            isArchived: false,
          },
        ],
      },
    ],
    education: [
      {
        institution: "State University",
        degree: "B.S.",
        fieldOfStudy: "Computer Science",
        startDate: new Date("2012-01-01T00:00:00.000Z"),
        endDate: new Date("2016-01-01T00:00:00.000Z"),
        current: false,
        bullets: [],
      },
    ],
    projects: [
      {
        name: "ApplyCopilot",
        technologies: ["TypeScript", "Next.js"],
        freeFormContext: [],
        bullets: [
          {
            text: "Built deterministic job matching engine",
            isActive: true,
            isArchived: false,
          },
        ],
      },
    ],
    skills: [
      { name: "TypeScript", proficiency: "EXPERT", yearsExperience: 6 },
      { name: "Claude Code", proficiency: "ADVANCED", yearsExperience: 2 },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveCanonicalSkills.mockImplementation(async (items: string[]) => {
    const m = new Map<string, string>();
    for (const item of items) {
      m.set(item, item.trim());
    }
    return m;
  });
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

    const result = await canonicalizeProfileFacts(rawProfileFacts);

    expect(mockResolveCanonicalSkills).toHaveBeenCalledTimes(2);

    const [hardCallArgs, softCallArgs] = mockResolveCanonicalSkills.mock
      .calls as Array<[string[], string]>;

    expect(hardCallArgs[0]).toHaveLength(50);
    expect(hardCallArgs[1]).toBe("HARD");
    expect(result.skills).toHaveLength(50);

    expect(softCallArgs[0]).toHaveLength(50);
    expect(softCallArgs[1]).toBe("SOFT");
    expect(result.softSkills).toHaveLength(50);
  });
});

describe("APC-51 — deterministic explicit skills union & softSkills stabilization", () => {
  it("retains explicit skills omitted by LLM and prioritizes them ahead of 50+ LLM skills within the 50-item cap", async () => {
    const llmSkills = Array.from({ length: 55 }, (_, i) => `llm-skill-${i}`);
    const rawProfileFacts: ProfileFacts = {
      skills: ["typescript", ...llmSkills],
      softSkills: ["Communication"],
      seniority: "senior",
      totalYearsExperience: 8,
      domains: ["saas"],
    };

    const canonical = await canonicalizeProfileFacts(rawProfileFacts, {
      explicitSkills: ["Claude Code", "Cursor", "TypeScript"],
    });

    expect(canonical.skills).toHaveLength(50);
    expect(canonical.skills.slice(0, 3)).toEqual([
      "Claude Code",
      "Cursor",
      "TypeScript",
    ]);
    // Case-insensitive pre-dedup prevented "typescript" from taking a duplicate slot
    expect(
      canonical.skills.filter((s) => s.toLowerCase() === "typescript"),
    ).toHaveLength(1);
    expect(mockResolveCanonicalSkills).toHaveBeenCalledWith(
      expect.arrayContaining(["Claude Code", "Cursor", "TypeScript"]),
      "HARD",
    );
  });

  it("stabilizes softSkills via preserveSoftSkills without calling resolveCanonicalSkills(..., 'SOFT')", async () => {
    const rawProfileFacts: ProfileFacts = {
      skills: ["React"],
      softSkills: ["Teamwork", "Adaptability"],
      seniority: "senior",
      totalYearsExperience: 6,
      domains: ["fintech"],
    };

    const canonical = await canonicalizeProfileFacts(rawProfileFacts, {
      preserveSoftSkills: [
        "Cross-functional Collaboration",
        "Technical Leadership",
        "Cross-functional Collaboration",
      ],
    });

    expect(canonical.softSkills).toEqual([
      "Cross-functional Collaboration",
      "Technical Leadership",
    ]);
    expect(mockResolveCanonicalSkills).toHaveBeenCalledTimes(1);
    expect(mockResolveCanonicalSkills).toHaveBeenCalledWith(["React"], "HARD");
  });

  it("preserves FR-22 malformed non-array fields untouched so downstream Zod validation rejects with 400", async () => {
    const malformedFacts = {
      skills: "not-an-array",
      softSkills: { bad: true },
      seniority: "senior",
      totalYearsExperience: 5,
      domains: ["fintech"],
    } as unknown as ProfileFacts;

    const result = await canonicalizeProfileFacts(malformedFacts, {
      explicitSkills: ["Claude Code"],
      preserveSoftSkills: ["Communication"],
    });

    expect(result.skills).toBe("not-an-array");
    expect(result.softSkills).toEqual({ bad: true });
    expect(mockResolveCanonicalSkills).not.toHaveBeenCalled();
  });

  it("leaves over-100-char raw LLM skills intact for FR-22 rejection when explicitSkills is not saturating the cap", async () => {
    const oversizedToken = "x".repeat(105);
    const rawProfileFacts: ProfileFacts = {
      skills: [oversizedToken],
      softSkills: ["Communication"],
      seniority: "senior",
      totalYearsExperience: 5,
      domains: ["fintech"],
    };

    const result = await canonicalizeProfileFacts(rawProfileFacts, {
      explicitSkills: ["Claude Code"],
    });

    expect(result.skills).toContain("Claude Code");
    expect(result.skills).toContain(oversizedToken);
  });

  it("consolidateNarrativeProfileToText ignores skill edits while changing when narrative sections change", () => {
    const profileA = makeSampleProfile();
    const profileWithAddedSkill = makeSampleProfile({
      skills: [
        ...profileA.skills,
        { name: "Cursor", proficiency: "EXPERT", yearsExperience: 2 },
      ],
    });

    const narrativeA = consolidateNarrativeProfileToText(profileA);
    const narrativeB = consolidateNarrativeProfileToText(profileWithAddedSkill);

    expect(narrativeA).toBe(narrativeB);
    expect(narrativeA).not.toContain("Core Skills & Technologies");
    expect(narrativeA).not.toContain("Claude Code");

    // Full consolidateProfileToText still includes Core Skills & Technologies
    const fullText = consolidateProfileToText(profileWithAddedSkill);
    expect(fullText).toContain("Core Skills & Technologies:");
    expect(fullText).toContain("Cursor");

    // Changing summary, experience, education, or projects changes narrative text
    expect(
      consolidateNarrativeProfileToText(
        makeSampleProfile({ summary: "Updated executive summary." }),
      ),
    ).not.toBe(narrativeA);
    expect(
      consolidateNarrativeProfileToText(
        makeSampleProfile({
          experiences: [
            ...profileA.experiences,
            {
              company: "NewCo",
              position: "Principal Engineer",
              startDate: new Date("2024-01-01T00:00:00.000Z"),
              endDate: null,
              current: true,
              freeFormContext: [],
              bullets: [],
            },
          ],
        }),
      ),
    ).not.toBe(narrativeA);
    expect(
      consolidateNarrativeProfileToText(
        makeSampleProfile({
          education: [
            {
              ...profileA.education[0],
              degree: "M.S.",
            },
          ],
        }),
      ),
    ).not.toBe(narrativeA);
    expect(
      consolidateNarrativeProfileToText(
        makeSampleProfile({
          projects: [
            {
              ...profileA.projects[0],
              technologies: ["TypeScript", "Next.js", "Rust"],
            },
          ],
        }),
      ),
    ).not.toBe(narrativeA);
  });

  it("extractProfileFacts passes { temperature: 0 } to generateJSON", async () => {
    const sampleFacts: ProfileFacts = {
      skills: ["TypeScript"],
      softSkills: ["Communication"],
      seniority: "senior",
      totalYearsExperience: 5,
      domains: ["saas"],
    };
    mockGenerateJSON.mockResolvedValueOnce(sampleFacts);

    const out = await extractProfileFacts("Consolidated profile text");

    expect(out).toEqual(sampleFacts);
    expect(mockGenerateJSON).toHaveBeenCalledWith(
      "Consolidated profile text",
      "profile.syncFacts",
      expect.any(String),
      { temperature: 0 },
    );
  });

  it("fetchUserProfileData filters skills by { isArchived: false, isActive: true }", async () => {
    mockFindUnique.mockResolvedValueOnce(makeSampleProfile());

    await fetchUserProfileData("user-123");

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { userId: "user-123" },
      include: {
        experiences: { include: { bullets: true } },
        education: { include: { bullets: true } },
        projects: { include: { bullets: true } },
        skills: { where: { isArchived: false, isActive: true } },
      },
    });
  });
});
