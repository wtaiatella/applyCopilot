/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as reviewAllHandler } from "@/app/api/profile/ai/review-all/route";
import { POST as generateBulletHandler } from "@/app/api/profile/ai/generate-bullet/route";
import { POST as reviewBulletHandler } from "@/app/api/profile/ai/review-bullet/route";
import { POST as acceptSuggestionHandler } from "@/app/api/profile/ai/accept-suggestion/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { generateJSON } from "@/lib/ai/aiClient";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/ai/aiClient", () => ({
  generateJSON: jest.fn(),
}));

function postJson(url: string, body: unknown) {
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

describe("AI Bullet Route Handlers Integration Tests", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const mockGenerateJSON = generateJSON as jest.Mock;

  const testEmail = `profile-ai-test-${Date.now()}@example.com`;
  const otherEmail = `profile-ai-other-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;
  let otherUserId: string;
  let otherProfileId: string;
  let otherExperienceId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Ada", lastName: "Lovelace" } },
      },
      include: { profile: true },
    });
    testUserId = user.id;
    testProfileId = user.profile!.id;

    const other = await prisma.user.create({
      data: {
        email: otherEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Grace", lastName: "Hopper" } },
      },
      include: { profile: true },
    });
    otherUserId = other.id;
    otherProfileId = other.profile!.id;

    const otherExperience = await prisma.experience.create({
      data: {
        profileId: otherProfileId,
        company: "Other Co",
        position: "Engineer",
        startDate: new Date("2020-01-01"),
        current: true,
      },
    });
    otherExperienceId = otherExperience.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.user.delete({ where: { id: otherUserId } }).catch(() => {});
    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: testUserId, email: testEmail, role: "USER" },
      expires: "any",
    });
  });

  /** Creates a fresh experience (with optional bullets/context) owned by the test user. */
  async function createExperience(
    opts: {
      freeFormContext?: string[];
      bullets?: Array<{ text: string; sortOrder: number }>;
    } = {},
  ) {
    const experience = await prisma.experience.create({
      data: {
        profileId: testProfileId,
        company: "Acme Corp",
        position: "Software Engineer",
        startDate: new Date("2021-01-01"),
        current: true,
        freeFormContext: opts.freeFormContext ?? [],
      },
    });

    const bullets = [];
    for (const b of opts.bullets ?? []) {
      bullets.push(
        await prisma.experienceBullet.create({
          data: {
            experienceId: experience.id,
            text: b.text,
            sortOrder: b.sortOrder,
          },
        }),
      );
    }

    return { experience, bullets };
  }

  // ─────────────────────────────────────────────────────────
  // POST /api/profile/ai/review-all
  // ─────────────────────────────────────────────────────────
  describe("POST /api/profile/ai/review-all", () => {
    it("returns 401 without auth", async () => {
      mockAuth.mockResolvedValue(null);
      const req = postJson("http://localhost:3000/api/profile/ai/review-all", {
        entityType: "experience",
        entityId: otherExperienceId,
      });
      const res = await reviewAllHandler(req);
      expect(res.status).toBe(401);
    });

    it("returns 404 with an entity owned by a different user", async () => {
      const req = postJson("http://localhost:3000/api/profile/ai/review-all", {
        entityType: "experience",
        entityId: otherExperienceId,
      });
      const res = await reviewAllHandler(req);
      expect(res.status).toBe(404);
    });

    it("returns 200 with suggestions for a valid entity, dropping any bulletId not in the request", async () => {
      const { experience, bullets } = await createExperience({
        bullets: [{ text: "Did some backend work", sortOrder: 0 }],
      });

      mockGenerateJSON.mockResolvedValue({
        suggestions: [
          {
            type: "REWRITE",
            bulletId: bullets[0].id,
            originalText: bullets[0].text,
            revisedText: "Engineered backend services",
          },
          // Foreign bulletId the LLM should not have echoed — must be dropped
          {
            type: "REWRITE",
            bulletId: "not-my-bullet",
            originalText: "x",
            revisedText: "y",
          },
          { type: "NEW", text: "Led a migration to microservices" },
        ],
      });

      const req = postJson("http://localhost:3000/api/profile/ai/review-all", {
        entityType: "experience",
        entityId: experience.id,
      });
      const res = await reviewAllHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.suggestions).toHaveLength(2);
      expect(
        data.suggestions.some((s: any) => s.bulletId === "not-my-bullet"),
      ).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/profile/ai/generate-bullet
  // ─────────────────────────────────────────────────────────
  describe("POST /api/profile/ai/generate-bullet", () => {
    it("returns 400 AI_CONTEXT_REQUIRED when freeFormContext is empty", async () => {
      const { experience } = await createExperience({ freeFormContext: [] });

      const req = postJson(
        "http://localhost:3000/api/profile/ai/generate-bullet",
        {
          entityType: "experience",
          entityId: experience.id,
        },
      );
      const res = await generateBulletHandler(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("AI_CONTEXT_REQUIRED");
    });

    it("returns 200 { text } when context notes are present", async () => {
      const { experience } = await createExperience({
        freeFormContext: ["Managed a $2M budget"],
      });
      mockGenerateJSON.mockResolvedValue({
        revisedText: "Managed a $2M annual budget across 3 teams",
      });

      const req = postJson(
        "http://localhost:3000/api/profile/ai/generate-bullet",
        {
          entityType: "experience",
          entityId: experience.id,
        },
      );
      const res = await generateBulletHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.text).toBe("Managed a $2M annual budget across 3 teams");
    });
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/profile/ai/review-bullet
  // ─────────────────────────────────────────────────────────
  describe("POST /api/profile/ai/review-bullet", () => {
    it("returns 404 when bulletId does not belong to entityId", async () => {
      const { experience } = await createExperience({});
      const { experience: otherExp, bullets: otherBullets } =
        await createExperience({
          bullets: [{ text: "A stray bullet", sortOrder: 0 }],
        });
      void otherExp;

      const req = postJson(
        "http://localhost:3000/api/profile/ai/review-bullet",
        {
          entityType: "experience",
          entityId: experience.id,
          bulletId: otherBullets[0].id,
        },
      );
      const res = await reviewBulletHandler(req);
      expect(res.status).toBe(404);
    });

    it("returns 200 { revisedText } for a valid bullet", async () => {
      const { experience, bullets } = await createExperience({
        bullets: [{ text: "Wrote some code", sortOrder: 0 }],
      });
      mockGenerateJSON.mockResolvedValue({
        revisedText: "Engineered production-grade code",
      });

      const req = postJson(
        "http://localhost:3000/api/profile/ai/review-bullet",
        {
          entityType: "experience",
          entityId: experience.id,
          bulletId: bullets[0].id,
        },
      );
      const res = await reviewBulletHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.revisedText).toBe("Engineered production-grade code");
    });
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/profile/ai/accept-suggestion
  // ─────────────────────────────────────────────────────────
  describe("POST /api/profile/ai/accept-suggestion", () => {
    it("action=rewrite: archives the original and creates a new bullet when the bullet is used in a CV", async () => {
      const { experience, bullets } = await createExperience({
        bullets: [{ text: "Original bullet", sortOrder: 0 }],
      });

      const cv = await prisma.cV.create({
        data: { profileId: testProfileId, name: "Test CV" },
      });
      await prisma.cVBullet.create({
        data: {
          cvId: cv.id,
          experienceBulletId: bullets[0].id,
          renderedText: bullets[0].text,
        },
      });

      const req = postJson(
        "http://localhost:3000/api/profile/ai/accept-suggestion",
        {
          entityType: "experience",
          entityId: experience.id,
          action: "rewrite",
          bulletId: bullets[0].id,
          newText: "Rewritten bullet text",
        },
      );
      const res = await acceptSuggestionHandler(req);
      expect(res.status).toBe(200);

      const original = await prisma.experienceBullet.findUnique({
        where: { id: bullets[0].id },
      });
      expect(original!.isArchived).toBe(true);
      expect(original!.isActive).toBe(false);

      const data = await res.json();
      expect(data.bullets).toHaveLength(1);
      expect(data.bullets[0].text).toBe("Rewritten bullet text");
      expect(data.bullets[0].id).not.toBe(bullets[0].id);

      await prisma.cV.delete({ where: { id: cv.id } });
    });

    it("action=rewrite: updates the bullet in-place when it has never been used in a CV", async () => {
      const { experience, bullets } = await createExperience({
        bullets: [{ text: "Unused bullet", sortOrder: 0 }],
      });

      const req = postJson(
        "http://localhost:3000/api/profile/ai/accept-suggestion",
        {
          entityType: "experience",
          entityId: experience.id,
          action: "rewrite",
          bulletId: bullets[0].id,
          newText: "Updated in place",
        },
      );
      const res = await acceptSuggestionHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.bullets).toHaveLength(1);
      expect(data.bullets[0].id).toBe(bullets[0].id);
      expect(data.bullets[0].text).toBe("Updated in place");
    });

    it("action=rewrite: returns 404 when bulletId does not belong to the entity", async () => {
      const { experience } = await createExperience({});
      const { bullets: otherBullets } = await createExperience({
        bullets: [{ text: "Not mine", sortOrder: 0 }],
      });

      const req = postJson(
        "http://localhost:3000/api/profile/ai/accept-suggestion",
        {
          entityType: "experience",
          entityId: experience.id,
          action: "rewrite",
          bulletId: otherBullets[0].id,
          newText: "Should not apply",
        },
      );
      const res = await acceptSuggestionHandler(req);
      expect(res.status).toBe(404);
    });

    it("action=merge: archives/deletes source bullets per CV usage and creates one combined bullet", async () => {
      const { experience, bullets } = await createExperience({
        bullets: [
          { text: "Bullet A (used in CV)", sortOrder: 0 },
          { text: "Bullet B (unused)", sortOrder: 1 },
        ],
      });

      const cv = await prisma.cV.create({
        data: { profileId: testProfileId, name: "Merge CV" },
      });
      await prisma.cVBullet.create({
        data: {
          cvId: cv.id,
          experienceBulletId: bullets[0].id,
          renderedText: bullets[0].text,
        },
      });

      const req = postJson(
        "http://localhost:3000/api/profile/ai/accept-suggestion",
        {
          entityType: "experience",
          entityId: experience.id,
          action: "merge",
          bulletIds: [bullets[0].id, bullets[1].id],
          combinedText: "Combined bullet text",
        },
      );
      const res = await acceptSuggestionHandler(req);
      expect(res.status).toBe(200);

      const usedSource = await prisma.experienceBullet.findUnique({
        where: { id: bullets[0].id },
      });
      expect(usedSource!.isArchived).toBe(true);
      expect(usedSource!.isActive).toBe(false);

      const unusedSource = await prisma.experienceBullet.findUnique({
        where: { id: bullets[1].id },
      });
      expect(unusedSource).toBeNull();

      const data = await res.json();
      expect(data.bullets).toHaveLength(1);
      expect(data.bullets[0].text).toBe("Combined bullet text");
      expect(data.bullets[0].sortOrder).toBe(0);

      await prisma.cV.delete({ where: { id: cv.id } });
    });

    it("action=merge: combined bullet takes the lowest sortOrder among sources, regardless of bulletIds order", async () => {
      const { experience, bullets } = await createExperience({
        bullets: [
          { text: "Bullet A (sortOrder 0)", sortOrder: 0 },
          { text: "Bullet B (sortOrder 3)", sortOrder: 3 },
        ],
      });

      // bulletIds references the higher-sortOrder bullet first, to prove the
      // result is NOT simply "the first source in the array".
      const req = postJson(
        "http://localhost:3000/api/profile/ai/accept-suggestion",
        {
          entityType: "experience",
          entityId: experience.id,
          action: "merge",
          bulletIds: [bullets[1].id, bullets[0].id],
          combinedText: "Combined out-of-order bullet",
        },
      );
      const res = await acceptSuggestionHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.bullets).toHaveLength(1);
      expect(data.bullets[0].text).toBe("Combined out-of-order bullet");
      expect(data.bullets[0].sortOrder).toBe(0);
    });

    it("action=new: creates a bullet at maxSortOrder + 1", async () => {
      const { experience } = await createExperience({
        bullets: [
          { text: "First", sortOrder: 0 },
          { text: "Second", sortOrder: 5 },
        ],
      });

      const req = postJson(
        "http://localhost:3000/api/profile/ai/accept-suggestion",
        {
          entityType: "experience",
          entityId: experience.id,
          action: "new",
          text: "Brand new AI-suggested bullet",
        },
      );
      const res = await acceptSuggestionHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      const created = data.bullets.find(
        (b: any) => b.text === "Brand new AI-suggested bullet",
      );
      expect(created).toBeDefined();
      expect(created.sortOrder).toBe(6);
    });
  });
});
