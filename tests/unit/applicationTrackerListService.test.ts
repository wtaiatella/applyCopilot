/**
 * @jest-environment node
 */

jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: jest.fn(),
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
import { getTrackerListRows } from "@/services/applicationTrackerListService";

const queryRaw = prisma.$queryRaw as unknown as jest.Mock;

describe("applicationTrackerListService.getTrackerListRows", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("maps the 4 status permutations into the correct TrackerListRow shape", async () => {
    queryRaw.mockResolvedValue([
      {
        jobId: "job-favorite-only",
        title: "Favorite Only",
        company: "Acme",
        favorite: true,
        deepAnalysisDone: false,
        cvStatus: "not_started",
        applicationStage: null,
      },
      {
        jobId: "job-analyzed-only",
        title: "Analyzed Only",
        company: "Acme",
        favorite: false,
        deepAnalysisDone: true,
        cvStatus: "not_started",
        applicationStage: null,
      },
      {
        jobId: "job-drafted",
        title: "Drafted",
        company: "Acme",
        favorite: false,
        deepAnalysisDone: false,
        cvStatus: "draft",
        applicationStage: null,
      },
      {
        jobId: "job-applied",
        title: "Applied",
        company: "Acme",
        favorite: false,
        deepAnalysisDone: false,
        cvStatus: "applied",
        applicationStage: "OFFER",
      },
    ]);

    const rows = await getTrackerListRows("profile_1");

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([
      {
        jobId: "job-favorite-only",
        title: "Favorite Only",
        company: "Acme",
        favorite: true,
        deepAnalysisDone: false,
        cvStatus: "not_started",
        applicationStage: null,
      },
      {
        jobId: "job-analyzed-only",
        title: "Analyzed Only",
        company: "Acme",
        favorite: false,
        deepAnalysisDone: true,
        cvStatus: "not_started",
        applicationStage: null,
      },
      {
        jobId: "job-drafted",
        title: "Drafted",
        company: "Acme",
        favorite: false,
        deepAnalysisDone: false,
        cvStatus: "draft",
        applicationStage: null,
      },
      {
        jobId: "job-applied",
        title: "Applied",
        company: "Acme",
        favorite: false,
        deepAnalysisDone: false,
        cvStatus: "applied",
        applicationStage: "OFFER",
      },
    ]);
  });

  it("returns an empty array when no jobs match", async () => {
    queryRaw.mockResolvedValue([]);
    const rows = await getTrackerListRows("profile_empty");
    expect(rows).toEqual([]);
  });
});
