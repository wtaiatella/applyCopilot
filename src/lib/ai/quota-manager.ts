import { AIModel, AIUsageCounter } from "@prisma/client";

export interface LazyResetResult {
  isAvailable: boolean;
  effectiveRpm: number;
  effectiveRpd: number;
  countRequestsMin: number;
  countRequestsDay: number;
  windowStartMin: Date;
  windowStartDay: Date;
  resetsMinInSeconds: number;
  resetsDayInSeconds: number;
}

/**
 * Floors a date to the nearest wall-clock minute (:00.000) in UTC/local.
 */
export function floorToMinute(date: Date): Date {
  const d = new Date(date.getTime());
  d.setSeconds(0, 0);
  return d;
}

/**
 * Floors a date to 00:00:00.000 UTC of the given date.
 */
export function floorToUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}

/**
 * Evaluates usage against rate limits with lazy reset on wall-clock boundaries.
 */
export function evaluateAndLazyReset(
  model: Pick<AIModel, "rpm" | "rpd" | "safetyMargin" | "blockedUntil">,
  counter: Pick<
    AIUsageCounter,
    | "windowStartMin"
    | "countRequestsMin"
    | "countTokensMin"
    | "windowStartDay"
    | "countRequestsDay"
    | "countTokensDay"
  > | null,
  now: Date = new Date(),
): LazyResetResult {
  const currentMinStart = floorToMinute(now);
  const currentDayStart = floorToUtcDay(now);

  const effectiveRpm = Math.max(1, Math.floor(model.rpm * model.safetyMargin));
  const effectiveRpd = Math.max(1, Math.floor(model.rpd * model.safetyMargin));

  let windowStartMin = counter?.windowStartMin
    ? new Date(counter.windowStartMin)
    : currentMinStart;
  let countRequestsMin = counter?.countRequestsMin ?? 0;

  let windowStartDay = counter?.windowStartDay
    ? new Date(counter.windowStartDay)
    : currentDayStart;
  let countRequestsDay = counter?.countRequestsDay ?? 0;

  // Lazy reset for minute window
  if (now.getTime() >= windowStartMin.getTime() + 60 * 1000) {
    windowStartMin = currentMinStart;
    countRequestsMin = 0;
  }

  // Lazy reset for day window
  if (now.getTime() >= windowStartDay.getTime() + 24 * 60 * 60 * 1000) {
    windowStartDay = currentDayStart;
    countRequestsDay = 0;
  }

  const isBlocked = Boolean(model.blockedUntil && model.blockedUntil > now);
  const hasMinuteQuota = countRequestsMin < effectiveRpm;
  const hasDayQuota = countRequestsDay < effectiveRpd;

  const isAvailable = !isBlocked && hasMinuteQuota && hasDayQuota;

  // Seconds until window resets
  const nextMinReset = windowStartMin.getTime() + 60 * 1000;
  const nextDayReset = windowStartDay.getTime() + 24 * 60 * 60 * 1000;

  const resetsMinInSeconds = Math.max(
    0,
    Math.ceil((nextMinReset - now.getTime()) / 1000),
  );
  const resetsDayInSeconds = Math.max(
    0,
    Math.ceil((nextDayReset - now.getTime()) / 1000),
  );

  return {
    isAvailable,
    effectiveRpm,
    effectiveRpd,
    countRequestsMin,
    countRequestsDay,
    windowStartMin,
    windowStartDay,
    resetsMinInSeconds,
    resetsDayInSeconds,
  };
}
