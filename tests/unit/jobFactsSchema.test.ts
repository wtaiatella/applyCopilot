/**
 * @jest-environment node
 */
import { JobFactsSchema } from "@/lib/validation/jobFactsSchema";

function base(extra: Record<string, unknown> = {}) {
  return {
    mustHave: ["React"],
    niceToHave: [],
    softSkills: [],
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
    ...extra,
  };
}

describe("JobFactsSchema.salaryPeriod (tri-state)", () => {
  it("leaves a missing salaryPeriod key absent (never coerced to null)", () => {
    const r = JobFactsSchema.safeParse(base());
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.salaryPeriod).toBeUndefined();
    expect("salaryPeriod" in r.data).toBe(false);
  });

  it("keeps explicit undefined as undefined", () => {
    const r = JobFactsSchema.parse(base({ salaryPeriod: undefined }));
    expect(r.salaryPeriod).toBeUndefined();
  });

  it("keeps explicit null as null", () => {
    expect(
      JobFactsSchema.parse(base({ salaryPeriod: null })).salaryPeriod,
    ).toBeNull();
  });

  it.each(["HOURLY", "MONTHLY", "YEARLY"])("accepts %s", (p) => {
    expect(JobFactsSchema.parse(base({ salaryPeriod: p })).salaryPeriod).toBe(
      p,
    );
  });

  it("matches case-insensitively", () => {
    expect(
      JobFactsSchema.parse(base({ salaryPeriod: "hourly" })).salaryPeriod,
    ).toBe("HOURLY");
    expect(
      JobFactsSchema.parse(base({ salaryPeriod: "Monthly" })).salaryPeriod,
    ).toBe("MONTHLY");
  });

  it.each(["WEEKLY", "", "per hour", 42])(
    "turns unrecognised value %p into null without failing the parse",
    (v) => {
      const r = JobFactsSchema.safeParse(base({ salaryPeriod: v }));
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.salaryPeriod).toBeNull();
    },
  );
});
