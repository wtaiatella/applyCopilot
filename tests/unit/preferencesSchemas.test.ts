/**
 * @jest-environment node
 */
import { UserPreferencesInputSchema } from "@/lib/validation/preferencesSchemas";

function base(extra: Record<string, unknown> = {}) {
  return {
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
  };
}

describe("UserPreferencesInputSchema salary period fields", () => {
  it("accepts old clients omitting the new keys and applies defaults", () => {
    const r = UserPreferencesInputSchema.safeParse(base());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.salaryPeriod).toBe("YEARLY");
      expect(r.data.hourlyMin).toBeNull();
      expect(r.data.hourlyCurrency).toBeNull();
    }
  });

  it("accepts YEARLY and MONTHLY periods", () => {
    for (const salaryPeriod of ["YEARLY", "MONTHLY"]) {
      expect(
        UserPreferencesInputSchema.safeParse(base({ salaryPeriod })).success,
      ).toBe(true);
    }
  });

  it("rejects HOURLY and unknown values for salaryPeriod", () => {
    for (const salaryPeriod of ["HOURLY", "WEEKLY", "yearly"]) {
      expect(
        UserPreferencesInputSchema.safeParse(base({ salaryPeriod })).success,
      ).toBe(false);
    }
  });

  it("allows YEARLY salaryMin up to 10,000,000 and rejects above", () => {
    expect(
      UserPreferencesInputSchema.safeParse(
        base({ salaryPeriod: "YEARLY", salaryMin: 10_000_000 }),
      ).success,
    ).toBe(true);
    expect(
      UserPreferencesInputSchema.safeParse(
        base({ salaryPeriod: "YEARLY", salaryMin: 10_000_001 }),
      ).success,
    ).toBe(false);
  });

  it("allows MONTHLY salaryMin up to 1,000,000 and rejects above with an issue on salaryMin", () => {
    expect(
      UserPreferencesInputSchema.safeParse(
        base({ salaryPeriod: "MONTHLY", salaryMin: 1_000_000 }),
      ).success,
    ).toBe(true);
    const r = UserPreferencesInputSchema.safeParse(
      base({ salaryPeriod: "MONTHLY", salaryMin: 1_000_001 }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "salaryMin")).toBe(
        true,
      );
    }
  });

  it("validates hourlyMin (0..100,000, nullable) and hourlyCurrency (3 uppercase letters)", () => {
    expect(
      UserPreferencesInputSchema.safeParse(
        base({ hourlyMin: 100_000, hourlyCurrency: "USD" }),
      ).success,
    ).toBe(true);
    expect(
      UserPreferencesInputSchema.safeParse(base({ hourlyMin: 100_001 }))
        .success,
    ).toBe(false);
    expect(
      UserPreferencesInputSchema.safeParse(base({ hourlyMin: -1 })).success,
    ).toBe(false);
    expect(
      UserPreferencesInputSchema.safeParse(base({ hourlyCurrency: "usd" }))
        .success,
    ).toBe(false);
  });
});
