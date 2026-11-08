/**
 * Salary display formatter (APC-44, D8). Pure, fixed en-US style output.
 * Deliberately avoids Intl / toLocaleString to prevent SSR/CSR hydration
 * mismatches and ICU differences between runtimes.
 */
import { usable, type SalaryPeriod } from "./salary";

export type SalaryFormatMode = "compact" | "full";

export interface FormattableSalary {
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  /** undefined = legacy (rendered as /yr); null = unknown (no suffix). */
  salaryPeriod?: SalaryPeriod | null;
}

const SYMBOLS: Record<string, string> = {
  USD: "US$",
  EUR: "€",
  GBP: "£",
  BRL: "R$",
};

const SUFFIXES: Record<SalaryPeriod, string> = {
  HOURLY: "/hr",
  MONTHLY: "/mo",
  YEARLY: "/yr",
};

/** Round to at most `decimals` places and drop trailing zeros. */
function trim(n: number, decimals: number): string {
  const f = 10 ** decimals;
  return String(Math.round(n * f) / f);
}

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatNumber(amount: number, mode: SalaryFormatMode): string {
  if (mode === "compact") {
    if (amount >= 1000) return `${trim(amount / 1000, 1)}k`;
    return trim(amount, 2);
  }
  const [int, dec] = trim(amount, 2).split(".");
  return dec ? `${group(int)}.${dec}` : group(int);
}

function currencyPrefix(currency: unknown): string {
  if (typeof currency !== "string") return "";
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return "";
  return Object.hasOwn(SYMBOLS, code) ? SYMBOLS[code] : `${code} `;
}

/** One amount with its currency symbol/prefix, no period suffix. */
export function formatMoney(
  amount: number,
  currency: string | null | undefined,
  mode: SalaryFormatMode = "full"
): string {
  return `${currencyPrefix(currency)}${formatNumber(amount, mode)}`;
}

/**
 * Formats a job salary, e.g. "US$5k - US$8k/mo". Returns null when no usable
 * (finite, > 0) amount exists. Never throws on unknown currency codes.
 */
export function formatSalary(
  salary: FormattableSalary,
  mode: SalaryFormatMode = "compact"
): string | null {
  const min = usable(salary.salaryMin) ? salary.salaryMin : null;
  const max = usable(salary.salaryMax) ? salary.salaryMax : null;
  if (min === null && max === null) return null;

  const period = salary.salaryPeriod === undefined ? "YEARLY" : salary.salaryPeriod;
  const suffix = period ? SUFFIXES[period] : "";

  const lo = min ?? max!;
  const hi = max ?? min!;
  const body =
    lo === hi
      ? formatMoney(lo, salary.currency, mode)
      : `${formatMoney(lo, salary.currency, mode)} - ${formatMoney(hi, salary.currency, mode)}`;
  return `${body}${suffix}`;
}
