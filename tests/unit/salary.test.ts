import {
  inferPeriod,
  toYearly,
  yearlyEquivalent,
  evaluateSalaryFit,
  MONTHS_PER_YEAR,
  type JobSalaryInput,
  type SalaryPrefs,
} from "../../src/lib/salary/salary";

const prefs = (o: Partial<SalaryPrefs> = {}): SalaryPrefs => ({
  salaryMin: 60000,
  salaryCurrency: "USD",
  salaryPeriod: "YEARLY",
  hourlyMin: 30,
  hourlyCurrency: "USD",
  ...o,
});
const job = (o: Partial<JobSalaryInput> = {}): JobSalaryInput => ({
  salaryMin: 70000,
  salaryMax: null,
  currency: "USD",
  ...o,
});

describe("inferPeriod", () => {
  it.each([
    [0.01, "HOURLY"],
    [500, "HOURLY"],
    [500.01, "MONTHLY"],
    [20000, "MONTHLY"],
    [20000.01, "YEARLY"],
  ])("%p -> %s", (n, p) => expect(inferPeriod(n)).toBe(p));
});

describe("toYearly / yearlyEquivalent", () => {
  it("converts months x 12 and leaves yearly", () => {
    expect(MONTHS_PER_YEAR).toBe(12);
    expect(toYearly(5000, "MONTHLY")).toBe(60000);
    expect(toYearly(5000, "YEARLY")).toBe(5000);
    expect(toYearly(5000.5, "MONTHLY")).toBe(60006);
  });
  it("rounds the hint and matches toYearly (AC-9)", () => {
    expect(yearlyEquivalent(1234.56)).toBe(14815);
    for (const m of [1, 999.99, 5000.5, 7777.77]) {
      expect(yearlyEquivalent(m)).toBe(Math.round(toYearly(m, "MONTHLY")));
    }
  });
});

describe("evaluateSalaryFit", () => {
  it("hourly job vs hourly pref (AC-4)", () => {
    const f = evaluateSalaryFit(job({ salaryMin: 35, salaryPeriod: "HOURLY" }), prefs());
    expect(f).toMatchObject({ comparable: true, family: "HOURLY", jobAmount: 35, prefAmount: 30, reason: "COMPARED", inferred: false });
  });

  it("hourly job never compared with annual pref (AC-4a)", () => {
    const f = evaluateSalaryFit(
      job({ salaryMin: 35, salaryPeriod: "HOURLY" }),
      prefs({ hourlyMin: null, hourlyCurrency: null }),
    );
    expect(f).toMatchObject({ comparable: false, reason: "NO_PREFERENCE", family: "HOURLY" });
  });

  it("yearly/monthly job with only hourly pref is neutral (AC-4a)", () => {
    const p = prefs({ salaryMin: null, salaryCurrency: null });
    expect(evaluateSalaryFit(job({ salaryPeriod: "YEARLY" }), p).reason).toBe("NO_PREFERENCE");
    expect(evaluateSalaryFit(job({ salaryMin: 5000, salaryPeriod: "MONTHLY" }), p).reason).toBe("NO_PREFERENCE");
  });

  it("monthly job vs yearly pref and reverse, unrounded (AC-4b)", () => {
    const a = evaluateSalaryFit(job({ salaryMin: 5000.5, salaryPeriod: "MONTHLY" }), prefs());
    expect(a).toMatchObject({ comparable: true, family: "ANNUAL", jobAmount: 60006, prefAmount: 60000 });
    const b = evaluateSalaryFit(
      job({ salaryMin: 70000, salaryPeriod: "YEARLY" }),
      prefs({ salaryMin: 4999.99, salaryPeriod: "MONTHLY" }),
    );
    expect(b.jobAmount).toBe(70000);
    expect(b.prefAmount).toBeCloseTo(59999.88, 5);
  });

  it("infers period when null (AC-4c)", () => {
    expect(evaluateSalaryFit(job({ salaryMin: 35, salaryPeriod: null }), prefs())).toMatchObject({
      comparable: true, family: "HOURLY", inferred: true, reason: "COMPARED_INFERRED",
    });
    expect(evaluateSalaryFit(job({ salaryMin: 5000, salaryPeriod: null }), prefs())).toMatchObject({
      family: "ANNUAL", jobAmount: 60000, inferred: true, reason: "COMPARED_INFERRED",
    });
    expect(evaluateSalaryFit(job({ salaryMin: 90000, salaryPeriod: null }), prefs()).jobAmount).toBe(90000);
  });

  it("legacy undefined = YEARLY, never inferred", () => {
    const f = evaluateSalaryFit(job({ salaryMin: 400 }), prefs());
    expect(f).toMatchObject({ family: "ANNUAL", inferred: false, jobAmount: 400, reason: "COMPARED" });
    const n = evaluateSalaryFit(job({ salaryMin: 400, salaryPeriod: null }), prefs());
    expect(n).toMatchObject({ family: "HOURLY", inferred: true });
  });

  it("stated beats magnitude (AC-4e)", () => {
    const f = evaluateSalaryFit(job({ salaryMin: 90000, salaryPeriod: "HOURLY" }), prefs());
    expect(f).toMatchObject({ family: "HOURLY", inferred: false, jobAmount: 90000 });
    expect(evaluateSalaryFit(job({ salaryMin: 30, salaryPeriod: "YEARLY" }), prefs()).family).toBe("ANNUAL");
  });

  it("currency mismatch/missing and case-insensitivity (AC-5)", () => {
    expect(evaluateSalaryFit(job({ currency: "EUR" }), prefs()).reason).toBe("CURRENCY_MISMATCH");
    expect(evaluateSalaryFit(job({ currency: null }), prefs()).reason).toBe("CURRENCY_MISMATCH");
    expect(evaluateSalaryFit(job(), prefs({ salaryCurrency: null })).reason).toBe("CURRENCY_MISMATCH");
    expect(evaluateSalaryFit(job({ currency: "usd" }), prefs({ salaryCurrency: "USD" })).comparable).toBe(true);
  });

  it("currency checked against the preference of the selected family", () => {
    const p = prefs({ hourlyCurrency: "EUR" });
    expect(evaluateSalaryFit(job({ salaryPeriod: "YEARLY" }), p).comparable).toBe(true);
    expect(evaluateSalaryFit(job({ salaryMin: 35, salaryPeriod: "HOURLY" }), p).reason).toBe("CURRENCY_MISMATCH");
  });

  it("N1: min else max; zero/null absent", () => {
    expect(evaluateSalaryFit(job({ salaryMin: null, salaryMax: 80000 }), prefs()).jobAmount).toBe(80000);
    expect(evaluateSalaryFit(job({ salaryMin: 0, salaryMax: 80000 }), prefs()).jobAmount).toBe(80000);
    expect(evaluateSalaryFit(job({ salaryMin: 50000, salaryMax: 80000 }), prefs()).jobAmount).toBe(50000);
    expect(evaluateSalaryFit(job({ salaryMin: 0, salaryMax: 0 }), prefs()).reason).toBe("NO_JOB_AMOUNT");
    expect(evaluateSalaryFit(job({ salaryMin: NaN, salaryMax: null }), prefs()).reason).toBe("NO_JOB_AMOUNT");
  });

  it("zero preference counts as unset", () => {
    expect(evaluateSalaryFit(job(), prefs({ salaryMin: 0 })).reason).toBe("NO_PREFERENCE");
  });

  describe("reason precedence", () => {
    const unset = prefs({ salaryMin: null, hourlyMin: null });
    it("unset preference -> NO_PREFERENCE for stated, legacy and inferred (never INFERENCE_BLOCKED)", () => {
      for (const salaryPeriod of ["YEARLY", "MONTHLY", "HOURLY", undefined, null] as const) {
        const f = evaluateSalaryFit(job({ salaryMin: 4000, currency: "EUR", salaryPeriod }), unset);
        expect(f.reason).toBe("NO_PREFERENCE");
      }
    });
    it("INFERENCE_BLOCKED only for inferred period + currency problem", () => {
      expect(evaluateSalaryFit(job({ salaryPeriod: null, currency: "EUR" }), prefs()).reason).toBe("INFERENCE_BLOCKED");
      expect(evaluateSalaryFit(job({ salaryPeriod: null, currency: null }), prefs()).reason).toBe("INFERENCE_BLOCKED");
      expect(evaluateSalaryFit(job({ salaryPeriod: "YEARLY", currency: "EUR" }), prefs()).reason).toBe("CURRENCY_MISMATCH");
      expect(evaluateSalaryFit(job({ currency: "EUR" }), prefs()).reason).toBe("CURRENCY_MISMATCH");
    });
    it("NO_JOB_AMOUNT wins over all", () => {
      const f = evaluateSalaryFit(
        job({ salaryMin: null, salaryMax: null, currency: "EUR", salaryPeriod: null }),
        unset,
      );
      expect(f.reason).toBe("NO_JOB_AMOUNT");
    });
  });
});

describe("evaluateSalaryFit non-string currency", () => {
  it("never throws and behaves as a missing currency", () => {
    for (const bad of [123, null, {}, undefined]) {
      const c = bad as unknown as string;
      expect(() => evaluateSalaryFit(job({ currency: c }), prefs())).not.toThrow();
      expect(evaluateSalaryFit(job({ currency: c }), prefs()).reason).toBe("CURRENCY_MISMATCH");
      expect(evaluateSalaryFit(job({ currency: c, salaryPeriod: null }), prefs()).reason).toBe("INFERENCE_BLOCKED");
      expect(
        evaluateSalaryFit(job(), prefs({ salaryCurrency: c })).reason
      ).toBe("CURRENCY_MISMATCH");
    }
  });
});
