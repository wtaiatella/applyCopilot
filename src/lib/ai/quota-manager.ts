import { AIModel, AIUsageCounter } from "@prisma/client";

export interface EvaluateQuotaOptions {
  isWorker?: boolean;
  activeUserRequests?: number;
}

export interface LazyResetResult {
  isAvailable: boolean;
  isBlocked: boolean;
  hasMinuteQuota: boolean;
  hasDayQuota: boolean;
  effectiveRpm: number;
  effectiveRpd: number;
  workerEffectiveRpm: number;
  workerEffectiveRpd: number;
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
  options?: EvaluateQuotaOptions,
): LazyResetResult {
  const currentMinStart = floorToMinute(now);
  const currentDayStart = floorToUtcDay(now);

  const effectiveRpm = Math.max(1, Math.floor(model.rpm * model.safetyMargin));
  const effectiveRpd = Math.max(1, Math.floor(model.rpd * model.safetyMargin));

  // Reserve interactive safety headroom for background workers
  const reservedRpm = effectiveRpm >= 2 ? 1 : 0;
  const workerEffectiveRpm = effectiveRpm - reservedRpm;

  const reservedRpd =
    effectiveRpd >= 2 ? Math.max(1, Math.floor(effectiveRpd * 0.05)) : 0;
  const workerEffectiveRpd = effectiveRpd - reservedRpd;

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
  const isWorker = Boolean(options?.isWorker);
  const activeUserRequests = options?.activeUserRequests ?? 0;

  const applicableRpm = isWorker ? workerEffectiveRpm : effectiveRpm;
  const applicableRpd = isWorker ? workerEffectiveRpd : effectiveRpd;

  const yieldedSingleSlotToActiveUser =
    isWorker && effectiveRpm === 1 && activeUserRequests > 0;

  const hasMinuteQuota =
    !yieldedSingleSlotToActiveUser && countRequestsMin < applicableRpm;
  const hasDayQuota = countRequestsDay < applicableRpd;

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
    isBlocked,
    hasMinuteQuota,
    hasDayQuota,
    effectiveRpm,
    effectiveRpd,
    workerEffectiveRpm,
    workerEffectiveRpd,
    countRequestsMin,
    countRequestsDay,
    windowStartMin,
    windowStartDay,
    resetsMinInSeconds,
    resetsDayInSeconds,
  };
}
