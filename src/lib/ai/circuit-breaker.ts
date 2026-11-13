import { prisma } from "../db/prisma";
import { logger } from "../logging/logger";

/** Default cooldown period in milliseconds when a model/provider gets blocked (1 hour) */
export const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * HTTP status codes that trigger a circuit breaker block on the LLM model.
 * - 429: Rate limit exceeded
 * - 401: Unauthorized / invalid API key
 * - 402: Payment required / quota exceeded
 */
export const BLOCKING_HTTP_STATUSES = [429, 401, 402];

/**
 * Checks whether an HTTP status code should trigger a circuit breaker block.
 */
export function isBlockingHttpStatus(statusCode: number): boolean {
  return BLOCKING_HTTP_STATUSES.includes(statusCode);
}

/**
 * Generates the SystemConfig key used to store a provider's cooldown timestamp.
 */
export function getBlockedUntilKey(
  providerConfigKey: string,
  provider: string,
): string {
  return `${providerConfigKey}_${provider.toUpperCase()}_BLOCKED_UNTIL`;
}

/**
 * Marks a provider as BLOCKED in SystemConfig for the configured cooldown period.
 */
export async function blockProvider(
  providerConfigKey: string,
  provider: string,
  cooldownMs: number = DEFAULT_COOLDOWN_MS,
): Promise<void> {
  const key = getBlockedUntilKey(providerConfigKey, provider);
  const blockedUntil = new Date(Date.now() + cooldownMs).toISOString();
  await prisma.systemConfig.upsert({
    where: { key },
    update: { value: blockedUntil },
    create: { key, value: blockedUntil },
  });
  logger.warn(
    `Circuit breaker: provider ${key} is now BLOCKED until ${blockedUntil} (cooldown: ${cooldownMs}ms)`,
  );
}

/**
 * Manually resets a BLOCKED provider cooldown in SystemConfig.
 */
export async function resetProviderBlock(
  providerConfigKey: string,
  provider: string,
): Promise<void> {
  const key = getBlockedUntilKey(providerConfigKey, provider);
  try {
    await prisma.systemConfig.delete({
      where: { key },
    });
    logger.info(`Circuit breaker: provider ${key} has been manually unblocked.`);
  } catch {
    // Record may not exist; nothing to unblock
  }
}

/**
 * Checks whether a provider is currently blocked via SystemConfig cooldown.
 */
export async function isProviderBlocked(
  providerConfigKey: string,
  provider?: string,
): Promise<boolean> {
  try {
    const key = provider
      ? getBlockedUntilKey(providerConfigKey, provider)
      : `${providerConfigKey}_BLOCKED_UNTIL`;
    const config = await prisma.systemConfig.findUnique({
      where: { key },
    });

    if (!config?.value) return false;
    const blockedUntil = new Date(config.value);
    return blockedUntil > new Date();
  } catch {
    return false;
  }
}

/**
 * Wraps an AI call with SystemConfig-backed circuit breaker protection.
 */
export async function withCircuitBreaker<T>(
  providerConfigKey: string,
  provider: string,
  fn: () => Promise<T>,
  cooldownMs: number = DEFAULT_COOLDOWN_MS,
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      (error as { name?: string }).name === "AIWorkerBackoffError"
    ) {
      throw error;
    }

    const statusCode = extractHttpStatus(error);

    if (statusCode !== null && isBlockingHttpStatus(statusCode)) {
      await blockProvider(providerConfigKey, provider, cooldownMs);
    }

    throw error;
  }
}

/**
 * Attempts to extract an HTTP status code from error shapes thrown by LLM SDKs / fetch.
 */
export function extractHttpStatus(error: unknown): number | null {
  if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;

    if (typeof err.status === "number") return err.status;
    if (typeof err.statusCode === "number") return err.statusCode;
    if (
      err.response &&
      typeof (err.response as Record<string, unknown>).status === "number"
    ) {
      return (err.response as Record<string, unknown>).status as number;
    }

    if (typeof err.message === "string") {
      const match = err.message.match(/\b(429|401|402)\b/);
      if (match) return parseInt(match[1], 10);
    }
  }

  return null;
}
