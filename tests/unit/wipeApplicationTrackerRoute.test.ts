/**
 * @jest-environment node
 */

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/logging/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockTx = {
  application: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  applicationEvent: {
    deleteMany: jest.fn(),
  },
  cV: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  cVBullet: {
    deleteMany: jest.fn(),
  },
  jobFavorite: {
    deleteMany: jest.fn(),
  },
  jobAnalysis: {
    deleteMany: jest.fn(),
  },
};

jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    userProfile: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) =>
      cb(mockTx)
    ),
  },
}));

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { POST } from "@/app/api/admin/database/wipe-application-tracker/route";

const mockAuth = auth as jest.Mock;
const mockFindProfile = prisma.userProfile.findUnique as jest.Mock;

describe("POST /api/admin/database/wipe-application-tracker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not ADMIN", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "USER" } });

    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("returns 404 when profile does not exist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
    mockFindProfile.mockResolvedValue(null);

    const res = await POST();
    expect(res.status).toBe(404);
  });

  it("unlinks all Application Tracker records and releases CVBullets for the authenticated profile", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
    mockFindProfile.mockResolvedValue({ id: "prof-1" });

    mockTx.application.findMany.mockResolvedValue([{ id: "app-1" }, { id: "app-2" }]);
    mockTx.applicationEvent.deleteMany.mockResolvedValue({ count: 5 });
    mockTx.application.deleteMany.mockResolvedValue({ count: 2 });

    mockTx.cV.findMany.mockResolvedValue([{ id: "cv-1" }]);
    mockTx.cVBullet.deleteMany.mockResolvedValue({ count: 8 });
    mockTx.cV.deleteMany.mockResolvedValue({ count: 1 });

    mockTx.jobFavorite.deleteMany.mockResolvedValue({ count: 3 });
    mockTx.jobAnalysis.deleteMany.mockResolvedValue({ count: 4 });

    const res = await POST();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.summary).toEqual({
      ApplicationEvents: 5,
      Applications: 2,
      CVBullets: 8,
      CVs: 1,
      JobFavorites: 3,
      JobAnalyses: 4,
    });

    expect(mockTx.applicationEvent.deleteMany).toHaveBeenCalledWith({
      where: { applicationId: { in: ["app-1", "app-2"] } },
    });
    expect(mockTx.application.deleteMany).toHaveBeenCalledWith({
      where: { profileId: "prof-1" },
    });
    expect(mockTx.cVBullet.deleteMany).toHaveBeenCalledWith({
      where: { cvId: { in: ["cv-1"] } },
    });
    expect(mockTx.cV.deleteMany).toHaveBeenCalledWith({
      where: { profileId: "prof-1" },
    });
    expect(mockTx.jobFavorite.deleteMany).toHaveBeenCalledWith({
      where: { profileId: "prof-1" },
    });
    expect(mockTx.jobAnalysis.deleteMany).toHaveBeenCalledWith({
      where: { profileId: "prof-1" },
    });
  });

  it("skips child deleteMany calls when there are no applications or CVs", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
    mockFindProfile.mockResolvedValue({ id: "prof-1" });

    mockTx.application.findMany.mockResolvedValue([]);
    mockTx.application.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.cV.findMany.mockResolvedValue([]);
    mockTx.cV.deleteMany.mockResolvedValue({ count: 0 });
    mockTx.jobFavorite.deleteMany.mockResolvedValue({ count: 1 });
    mockTx.jobAnalysis.deleteMany.mockResolvedValue({ count: 0 });

    const res = await POST();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.summary).toEqual({
      ApplicationEvents: 0,
      Applications: 0,
      CVBullets: 0,
      CVs: 0,
      JobFavorites: 1,
      JobAnalyses: 0,
    });

    expect(mockTx.applicationEvent.deleteMany).not.toHaveBeenCalled();
    expect(mockTx.cVBullet.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 500 if transaction fails", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
    mockFindProfile.mockResolvedValue({ id: "prof-1" });
    (prisma.$transaction as jest.Mock).mockRejectedValueOnce(new Error("DB error"));

    const res = await POST();
    expect(res.status).toBe(500);
  });
});
