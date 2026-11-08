/**
 * Pure salary period logic (APC-44). No I/O, no logger, no Prisma import.
 * Owns the months-to-year conversion, period inference thresholds and the
 * period-family comparison shared by the matcher and the preferences hint.
 */

export type SalaryPeriod = "HOURLY" | "MONTHLY" | "YEARLY";

export const MONTHS_PER_YEAR = 12;
export const INFER_YEARLY_ABOVE = 20_000;
export const INFER_MONTHLY_ABOVE = 500;

export interface JobSalaryInput {
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  /** undefined = legacy (treated as YEARLY); null = unknown (inferred). */
  salaryPeriod?: SalaryPeriod | null;
}

export interface SalaryPrefs {
  salaryMin: number | null;
  salaryCurrency: string | null;
  salaryPeriod: "YEARLY" | "MONTHLY";
  hourlyMin: number | null;
  hourlyCurrency: string | null;
}

export type SalaryFitReason =
  | "COMPARED"
  | "COMPARED_INFERRED"
  | "NO_JOB_AMOUNT"
  | "NO_PREFERENCE"
  | "CURRENCY_MISMATCH"
  | "INFERENCE_BLOCKED";

export interface SalaryFit {
  comparable: boolean;
  /** Same basis as prefAmount: yearly for the ANNUAL family, raw for HOURLY. */
  jobAmount?: number;
  prefAmount?: number;
  family?: "HOURLY" | "ANNUAL";
  inferred: boolean;
  reason: SalaryFitReason;
}

function usable(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** Literal thresholds: > 20,000 YEARLY; > 500 MONTHLY; otherwise HOURLY. */
export function inferPeriod(amount: number): SalaryPeriod {
  if (amount > INFER_YEARLY_ABOVE) return "YEARLY";
  if (amount > INFER_MONTHLY_ABOVE) return "MONTHLY";
  return "HOURLY";
}

export function toYearly(amount: number, period: "MONTHLY" | "YEARLY"): number {
  return period === "MONTHLY" ? amount * MONTHS_PER_YEAR : amount;
}

/** Rounded yearly equivalent of a monthly amount (display hint only). */
export function yearlyEquivalent(monthly: number): number {
  return Math.round(monthly * MONTHS_PER_YEAR);
}

function sameCurrency(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

export function evaluateSalaryFit(job: JobSalaryInput, prefs: SalaryPrefs): SalaryFit {
  const amount = usable(job.salaryMin)
    ? job.salaryMin
    : usable(job.salaryMax)
      ? job.salaryMax
      : null;

  if (amount === null) {
    return { comparable: false, inferred: false, reason: "NO_JOB_AMOUNT" };
  }

  const inferred = job.salaryPeriod === null;
  const period: SalaryPeriod = inferred
    ? inferPeriod(amount)
    : (job.salaryPeriod ?? "YEARLY");

  const family: "HOURLY" | "ANNUAL" = period === "HOURLY" ? "HOURLY" : "ANNUAL";
  const prefRaw = family === "HOURLY" ? prefs.hourlyMin : prefs.salaryMin;
  const prefCurrency = family === "HOURLY" ? prefs.hourlyCurrency : prefs.salaryCurrency;

  if (!usable(prefRaw)) {
    return { comparable: false, family, inferred, reason: "NO_PREFERENCE" };
  }

  if (!sameCurrency(job.currency, prefCurrency)) {
    return {
      comparable: false,
      family,
      inferred,
      reason: inferred ? "INFERENCE_BLOCKED" : "CURRENCY_MISMATCH",
    };
  }

  const jobAmount =
    family === "HOURLY" ? amount : toYearly(amount, period as "MONTHLY" | "YEARLY");
  const prefAmount = family === "HOURLY" ? prefRaw : toYearly(prefRaw, prefs.salaryPeriod);

  return {
    comparable: true,
    jobAmount,
    prefAmount,
    family,
    inferred,
    reason: inferred ? "COMPARED_INFERRED" : "COMPARED",
  };
}
