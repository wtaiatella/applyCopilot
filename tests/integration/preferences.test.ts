/**
 * @jest-environment node
 */
import "dotenv/config";
import {
  GET as getPreferencesHandler,
  PUT as putPreferencesHandler,
} from "@/app/api/profile/preferences/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { logger } from "@/lib/logging/logger";
import { safeCleanup } from "./helpers/test-fixtures";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

describe("GET/PUT /api/profile/preferences (T019/T022)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `preferences-test-${Date.now()}@example.com`;
  const otherEmail = `preferences-other-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;
  let otherUserId: string;
  let otherProfileId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Pref", lastName: "Tester" } },
      },
      include: { profile: true },
    });
    testUserId = user.id;
    testProfileId = user.profile!.id;

    const other = await prisma.user.create({
      data: {
        email: otherEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Other", lastName: "User" } },
      },
      include: { profile: true },
    });
    otherUserId = other.id;
    otherProfileId = other.profile!.id;
  });

  afterAll(async () => {
    if (testUserId) {
      await safeCleanup("preferences.test.ts afterAll testUser", async () => {
        await prisma.user.delete({ where: { id: testUserId } });
      });
    }
    if (otherUserId) {
      await safeCleanup("preferences.test.ts afterAll otherUser", async () => {
        await prisma.user.delete({ where: { id: otherUserId } });
      });
    }
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

  describe("GET /api/profile/preferences", () => {
    it("returns 401 when unauthenticated", async () => {
      mockAuth.mockResolvedValue(null);
      const res = await getPreferencesHandler();
      expect(res.status).toBe(401);
    });

    it("returns the all-null default shape when the user never saved preferences", async () => {
      const res = await getPreferencesHandler();
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toEqual({
        seniority: null,
        totalYearsExperience: null,
        acceptsContract: null,
        acceptsFreelance: null,
        acceptsOnsite: null,
        acceptsHybrid: null,
        acceptsRemote: null,
        onlyWorldwide: null,
        hasUsWorkAuth: null,
        requiresVisaRelocation: null,
        salaryMin: null,
        salaryCurrency: null,
        salaryPeriod: "YEARLY",
        hourlyMin: null,
        hourlyCurrency: null,
        excludeKeywords: [],
      });
    });
  });

  describe("PUT /api/profile/preferences", () => {
    it("returns 401 when unauthenticated", async () => {
      mockAuth.mockResolvedValue(null);
      const req = new Request("http://localhost:3000/api/profile/preferences", {
        method: "PUT",
        body: JSON.stringify({}),
      });
      const res = await putPreferencesHandler(req);
      expect(res.status).toBe(401);
    });

    it("returns 400 with validation details on an invalid payload", async () => {
      const req = new Request("http://localhost:3000/api/profile/preferences", {
        method: "PUT",
        body: JSON.stringify({
          seniority: "not-a-real-level",
          totalYearsExperience: 999,
          salaryCurrency: "usd",
          excludeKeywords: [],
        }),
      });
      const res = await putPreferencesHandler(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe("Validation failed");
      expect(Array.isArray(data.details)).toBe(true);
    });

    it("performs a full-object upsert and round-trips via GET, scoped to the session profileId", async () => {
      const payload = {
        seniority: "senior",
        totalYearsExperience: 8,
        acceptsContract: true,
        acceptsFreelance: false,
        acceptsOnsite: false,
        acceptsHybrid: true,
        acceptsRemote: true,
        onlyWorldwide: null,
        hasUsWorkAuth: true,
        requiresVisaRelocation: false,
        salaryMin: 120000,
        salaryCurrency: "USD",
        salaryPeriod: "YEARLY",
        hourlyMin: null,
        hourlyCurrency: null,
        excludeKeywords: ["php", "wordpress"],
      };

      const putReq = new Request(
        "http://localhost:3000/api/profile/preferences",
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
      );
      const putRes = await putPreferencesHandler(putReq);
      expect(putRes.status).toBe(200);

      const putData = await putRes.json();
      expect(putData).toEqual(payload);

      // Round-trip: GET returns exactly what was saved.
      const getRes = await getPreferencesHandler();
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData).toEqual(payload);

      // Ownership scoping: persisted under the session-derived profileId, not any client id.
      const inDb = await prisma.userPreferences.findUnique({
        where: { profileId: testProfileId },
      });
      expect(inDb).not.toBeNull();
      expect(inDb!.profileId).toBe(testProfileId);

      // A second PUT (upsert path) fully replaces the object rather than merging.
      const secondPayload = {
        ...payload,
        seniority: "lead",
        excludeKeywords: ["cobol"],
      };
      const secondPutReq = new Request(
        "http://localhost:3000/api/profile/preferences",
        {
          method: "PUT",
          body: JSON.stringify(secondPayload),
        },
      );
      const secondPutRes = await putPreferencesHandler(secondPutReq);
      expect(secondPutRes.status).toBe(200);
      const secondPutData = await secondPutRes.json();
      expect(secondPutData).toEqual(secondPayload);

      const onlyOneRow = await prisma.userPreferences.findMany({
        where: { profileId: testProfileId },
      });
      expect(onlyOneRow).toHaveLength(1);
    });

    it("round-trips MONTHLY salary plus hourly minimum (AC-3, AC-8a)", async () => {
      const payload = {
        seniority: null,
        totalYearsExperience: null,
        acceptsContract: null,
        acceptsFreelance: null,
        acceptsOnsite: null,
        acceptsHybrid: null,
        acceptsRemote: null,
        onlyWorldwide: null,
        hasUsWorkAuth: null,
        requiresVisaRelocation: null,
        salaryMin: 5000,
        salaryCurrency: "EUR",
        salaryPeriod: "MONTHLY",
        hourlyMin: 45.5,
        hourlyCurrency: "USD",
        excludeKeywords: [],
      };
      const putRes = await putPreferencesHandler(
        new Request("http://localhost:3000/api/profile/preferences", {
          method: "PUT",
          body: JSON.stringify(payload),
        }),
      );
      expect(putRes.status).toBe(200);
      expect(await putRes.json()).toEqual(payload);
      const getRes = await getPreferencesHandler();
      expect(await getRes.json()).toEqual(payload);
    });

    it("defaults to YEARLY when an old client omits the new keys, and reads a period-less row as YEARLY (AC-6, AC-8)", async () => {
      const putRes = await putPreferencesHandler(
        new Request("http://localhost:3000/api/profile/preferences", {
          method: "PUT",
          body: JSON.stringify({
            seniority: null,
            totalYearsExperience: null,
            acceptsContract: null,
            acceptsFreelance: null,
            acceptsOnsite: null,
            acceptsHybrid: null,
            acceptsRemote: null,
            onlyWorldwide: null,
            hasUsWorkAuth: null,
            requiresVisaRelocation: null,
            salaryMin: 90000,
            salaryCurrency: "USD",
            excludeKeywords: [],
          }),
        }),
      );
      expect(putRes.status).toBe(200);
      const data = await putRes.json();
      expect(data.salaryPeriod).toBe("YEARLY");
      expect(data.hourlyMin).toBeNull();
      expect(data.hourlyCurrency).toBeNull();

      // Row created directly without a period (DB default) reads YEARLY.
      await prisma.userPreferences.deleteMany({
        where: { profileId: otherProfileId },
      });
      await prisma.userPreferences.create({
        data: { profileId: otherProfileId, salaryMin: 1000 },
      });
      mockAuth.mockResolvedValue({
        user: { id: otherUserId, email: otherEmail, role: "USER" },
        expires: "any",
      });
      const getData = await (await getPreferencesHandler()).json();
      expect(getData.salaryPeriod).toBe("YEARLY");
      expect(getData.hourlyMin).toBeNull();
    });

    it("collapses a stray DB HOURLY period to YEARLY and logs a bounded warn", async () => {
      await prisma.userPreferences.deleteMany({
        where: { profileId: testProfileId },
      });
      await prisma.userPreferences.create({
        data: { profileId: testProfileId, salaryMin: 50, salaryPeriod: "HOURLY" },
      });
      const warn = jest.spyOn(logger, "warn");
      try {
        const data = await (await getPreferencesHandler()).json();
        expect(data.salaryPeriod).toBe("YEARLY");
        expect(warn).toHaveBeenCalledWith(
          "Collapsed unsupported stored salaryPeriod to YEARLY",
          { profileId: testProfileId, salaryPeriod: "HOURLY" },
        );
      } finally {
        warn.mockRestore();
        await prisma.userPreferences.deleteMany({
          where: { profileId: testProfileId },
        });
      }
    });

    it("rejects MONTHLY salaryMin > 1,000,000 and HOURLY period with 400", async () => {
      const mk = (extra: Record<string, unknown>) =>
        new Request("http://localhost:3000/api/profile/preferences", {
          method: "PUT",
          body: JSON.stringify({
            seniority: null,
            totalYearsExperience: null,
            acceptsContract: null,
            acceptsFreelance: null,
            acceptsOnsite: null,
            acceptsHybrid: null,
            acceptsRemote: null,
            onlyWorldwide: null,
            hasUsWorkAuth: null,
            requiresVisaRelocation: null,
            salaryMin: null,
            salaryCurrency: null,
            excludeKeywords: [],
            ...extra,
          }),
        });
      const monthly = await putPreferencesHandler(
        mk({ salaryPeriod: "MONTHLY", salaryMin: 1_000_001 }),
      );
      expect(monthly.status).toBe(400);
      const body = await monthly.json();
      expect(body.error).toBe("Validation failed");
      expect(
        body.details.some((d: { field: string }) => d.field === "salaryMin"),
      ).toBe(true);

      const hourly = await putPreferencesHandler(
        mk({ salaryPeriod: "HOURLY" }),
      );
      expect(hourly.status).toBe(400);
    });

    it("scopes strictly to the authenticated session's own profile, never a different user's", async () => {
      // Save preferences for "other" user first.
      mockAuth.mockResolvedValue({
        user: { id: otherUserId, email: otherEmail, role: "USER" },
        expires: "any",
      });
      const otherPayload = {
        seniority: "junior",
        totalYearsExperience: 1,
        acceptsContract: null,
        acceptsFreelance: null,
        acceptsOnsite: null,
        acceptsHybrid: null,
        acceptsRemote: null,
        onlyWorldwide: null,
        hasUsWorkAuth: null,
        requiresVisaRelocation: null,
        salaryMin: null,
        salaryCurrency: null,
        excludeKeywords: [],
      };
      const otherPutReq = new Request(
        "http://localhost:3000/api/profile/preferences",
        {
          method: "PUT",
          body: JSON.stringify(otherPayload),
        },
      );
      const otherPutRes = await putPreferencesHandler(otherPutReq);
      expect(otherPutRes.status).toBe(200);

      // Switch back to the primary test session — GET must not see the other user's row.
      mockAuth.mockResolvedValue({
        user: { id: testUserId, email: testEmail, role: "USER" },
        expires: "any",
      });
      const getRes = await getPreferencesHandler();
      const getData = await getRes.json();
      expect(getData.seniority).not.toBe("junior");

      const otherInDb = await prisma.userPreferences.findUnique({
        where: { profileId: otherProfileId },
      });
      expect(otherInDb).not.toBeNull();
      expect(otherInDb!.seniority).toBe("junior");
    });
  });
});
