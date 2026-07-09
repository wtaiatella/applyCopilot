import { prisma } from "../db/prisma";
import { logger } from "../logging/logger";

/** Default cooldown period in milliseconds when a provider gets blocked (1 hour) */
const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * HTTP status codes that trigger a circuit breaker block on the LLM provider.
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
 * Generates the SystemConfig key that stores the block expiry timestamp for a given provider config key.
 *
 * Example: "AI_PROVIDER_PARSING" → "AI_PROVIDER_PARSING_BLOCKED_UNTIL"
 */
export function getBlockedUntilKey(providerConfigKey: string): string {
  return `${providerConfigKey}_BLOCKED_UNTIL`;
}

/**
 * Checks whether the given LLM provider config key is currently blocked.
 *
 * A provider is considered BLOCKED if `SystemConfig` contains a `<key>_BLOCKED_UNTIL`
 * entry whose value is a future ISO timestamp.
 *
 * @param providerConfigKey The SystemConfig key identifying the provider capability,
 *   e.g. "AI_PROVIDER_PARSING" or "AI_PROVIDER_SUMMARIES".
 * @returns `true` if blocked, `false` if healthy or unset.
 */
export async function isProviderBlocked(providerConfigKey: string): Promise<boolean> {
  try {
    const blockedUntilKey = getBlockedUntilKey(providerConfigKey);

    const config = await prisma.systemConfig.findUnique({
      where: { key: blockedUntilKey },
    });

    if (!config?.value) {
      return false;
    }

    const blockedUntil = new Date(config.value);

    if (isNaN(blockedUntil.getTime())) {
      // Corrupted or invalid date — treat as unblocked and clean up
      logger.warn(`Circuit breaker: invalid blockedUntil value for ${providerConfigKey}. Resetting.`);
      await resetProviderBlock(providerConfigKey);
      return false;
    }

    const isBlocked = blockedUntil > new Date();

    if (!isBlocked) {
      // Block has expired — clean up the entry automatically
      logger.info(`Circuit breaker: cooldown expired for ${providerConfigKey}. Auto-resetting.`);
      await resetProviderBlock(providerConfigKey);
    }

    return isBlocked;
  } catch (error) {
    logger.error(`Circuit breaker: error checking provider block for ${providerConfigKey}`, { error });
    // Fail open: if DB check fails, do not block the provider
    return false;
  }
}

/**
 * Marks an LLM provider as BLOCKED in `SystemConfig` for the configured cooldown period.
 * This is typically called when an HTTP 429, 401, or 402 response is received from the LLM API.
 *
 * @param providerConfigKey The SystemConfig key identifying the provider capability.
 * @param cooldownMs Optional cooldown duration in milliseconds. Defaults to 1 hour.
 */
export async function blockProvider(
  providerConfigKey: string,
  cooldownMs: number = DEFAULT_COOLDOWN_MS
): Promise<void> {
  try {
    const blockedUntilKey = getBlockedUntilKey(providerConfigKey);
    const blockedUntil = new Date(Date.now() + cooldownMs).toISOString();

    await prisma.systemConfig.upsert({
      where: { key: blockedUntilKey },
      update: { value: blockedUntil },
      create: { key: blockedUntilKey, value: blockedUntil },
    });

    logger.warn(
      `Circuit breaker: provider ${providerConfigKey} is now BLOCKED until ${blockedUntil} (cooldown: ${cooldownMs}ms)`
    );
  } catch (error) {
    logger.error(`Circuit breaker: failed to block provider ${providerConfigKey}`, { error });
  }
}

/**
 * Manually resets a BLOCKED LLM provider, removing its cooldown entry from `SystemConfig`.
 * This can be triggered by the admin "Reset Provider" button in the Settings panel.
 *
 * @param providerConfigKey The SystemConfig key identifying the provider capability.
 */
export async function resetProviderBlock(providerConfigKey: string): Promise<void> {
  try {
    const blockedUntilKey = getBlockedUntilKey(providerConfigKey);

    await prisma.systemConfig.delete({
      where: { key: blockedUntilKey },
    });

    logger.info(`Circuit breaker: provider ${providerConfigKey} has been manually reset (unblocked).`);
  } catch (error: unknown) {
    // P2025 = Record not found — this is fine, the block didn't exist
    if ((error as { code?: string })?.code !== "P2025") {
      logger.error(`Circuit breaker: failed to reset provider ${providerConfigKey}`, { error });
    }
  }
}

/**
 * Wraps an LLM API call with circuit breaker protection.
 * If the call throws an error with a blocking HTTP status, the provider is blocked automatically.
 *
 * @param providerConfigKey The SystemConfig key identifying the provider capability.
 * @param fn The async function wrapping the LLM API call.
 * @param cooldownMs Optional cooldown duration in milliseconds.
 * @returns The result of the wrapped function.
 * @throws Re-throws the original error after marking the provider as blocked.
 */
export async function withCircuitBreaker<T>(
  providerConfigKey: string,
  fn: () => Promise<T>,
  cooldownMs: number = DEFAULT_COOLDOWN_MS
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    const statusCode = extractHttpStatus(error);

    if (statusCode !== null && isBlockingHttpStatus(statusCode)) {
      await blockProvider(providerConfigKey, cooldownMs);
    }

    throw error;
  }
}

/**
 * Attempts to extract an HTTP status code from various error shapes thrown by LLM SDKs.
 */
function extractHttpStatus(error: unknown): number | null {
  if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;

    // Common patterns: { status: 429 }, { statusCode: 429 }, { response: { status: 429 } }
    if (typeof err.status === "number") return err.status;
    if (typeof err.statusCode === "number") return err.statusCode;
    if (err.response && typeof (err.response as Record<string, unknown>).status === "number") {
      return (err.response as Record<string, unknown>).status as number;
    }

    // Error message pattern: "429" or "status 429"
    if (typeof err.message === "string") {
      const match = err.message.match(/\b(429|401|402)\b/);
      if (match) return parseInt(match[1], 10);
    }
  }

  return null;
}
