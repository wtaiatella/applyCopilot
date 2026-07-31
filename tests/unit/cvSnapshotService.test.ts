/**
 * @jest-environment node
 */

jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    userProfile: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/logging/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { prisma } from "@/lib/db/prisma";
import { buildSnapshotFromProfile } from "@/services/cvSnapshotService";

const findUniqueMock = prisma.userProfile.findUnique as jest.Mock;

describe("cvSnapshotService.buildSnapshotFromProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const fakeProfile = {
    id: "profile_1",
    firstName: "Jane",
    lastName: "Doe",
    phone: "555-0100",
    location: "Remote",
    linkedin: "https://linkedin.com/in/jane",
    github: "https://github.com/jane",
    website: "https://jane.dev",
    title: "Senior Engineer",
    experiences: [
      {
        id: "exp_1",
        company: "Acme",
        position: "Engineer",
        startDate: new Date("2020-01-01"),
        endDate: null,
        current: true,
        tabLabel: "Acme role",
        freeFormContext: ["note"],
        bullets: [
          {
            id: "expb_1",
            text: "Did great things",
            type: "BULLET",
            sortOrder: 0,
          },
        ],
      },
    ],
    education: [
      {
        id: "edu_1",
        institution: "State University",
        degree: "BSc",
        fieldOfStudy: "CS",
        startDate: new Date("2016-01-01"),
        endDate: new Date("2020-01-01"),
        current: false,
        hideEndDate: false,
        tabLabel: null,
        freeFormContext: [],
        bullets: [
          {
            id: "edub_1",
            text: "Graduated with honors",
            type: "BULLET",
            sortOrder: 0,
          },
        ],
      },
    ],
    projects: [
      {
        id: "proj_1",
        name: "Side Project",
        startDate: new Date("2021-01-01"),
        endDate: null,
        current: true,
        technologies: ["TypeScript"],
        tabLabel: null,
        freeFormContext: [],
        bullets: [
          {
            id: "projb_1",
            text: "Built a thing",
            type: "BULLET",
            sortOrder: 0,
          },
        ],
      },
    ],
    skills: [
      {
        id: "skill_1",
        name: "TypeScript",
        proficiency: "EXPERT",
        yearsExperience: 5,
      },
    ],
    summaries: [
      {
        id: "sum_1",
        title: "Summary A",
        content: "Great engineer",
        isAIGenerated: false,
      },
    ],
  };

  it("maps every Profile entity type into its CVSnapshotData counterpart with correct sourceXId/included defaults", async () => {
    findUniqueMock.mockResolvedValue(fakeProfile);

    const snapshot = await buildSnapshotFromProfile("profile_1");

    expect(snapshot.version).toBe(1);
    expect(snapshot.basicData).toEqual({
      firstName: "Jane",
      lastName: "Doe",
      phone: "555-0100",
      location: "Remote",
      linkedin: "https://linkedin.com/in/jane",
      github: "https://github.com/jane",
      website: "https://jane.dev",
      title: "Senior Engineer",
    });

    expect(snapshot.experiences).toHaveLength(1);
    expect(snapshot.experiences[0].sourceExperienceId).toBe("exp_1");
    expect(snapshot.experiences[0].bullets[0].sourceBulletId).toBe("expb_1");
    expect(snapshot.experiences[0].bullets[0].included).toBe(true);

    expect(snapshot.education).toHaveLength(1);
    expect(snapshot.education[0].sourceEducationId).toBe("edu_1");
    expect(snapshot.education[0].bullets[0].included).toBe(true);

    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.projects[0].sourceProjectId).toBe("proj_1");
    expect(snapshot.projects[0].bullets[0].included).toBe(true);

    expect(snapshot.skills).toHaveLength(1);
    expect(snapshot.skills[0].sourceSkillId).toBe("skill_1");
    expect(snapshot.skills[0].included).toBe(true);

    expect(snapshot.summaries).toHaveLength(1);
    expect(snapshot.summaries[0].sourceSummaryId).toBe("sum_1");
    expect(snapshot.summaries[0].included).toBe(true);
  });

  it("throws when there is no Profile to clone from", async () => {
    findUniqueMock.mockResolvedValue(null);

    await expect(buildSnapshotFromProfile("missing_profile")).rejects.toThrow(
      "No Profile to clone from",
    );
  });
});
