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
 * Generates the SystemConfig key that stores the block expiry timestamp for a given
 * capability + provider pair.
 *
 * Scoped by BOTH the capability (`providerConfigKey`, e.g. "AI_PROVIDER_PARSING") AND the
 * currently-resolved provider (e.g. "gemini", "gemma-26b") — a 429/401/402 from one provider
 * must not block a *different* provider an admin just switched that capability to. Before this,
 * the key was capability-only, so switching e.g. parsing from "gemini" to "gemma-26b" while
 * "gemini" was mid-cooldown left the capability blocked for the new, never-rate-limited provider
 * too, since the block key carried no provider identity at all.
 *
 * Example: ("AI_PROVIDER_PARSING", "gemini") → "AI_PROVIDER_PARSING_GEMINI_BLOCKED_UNTIL"
 */
export function getBlockedUntilKey(
  providerConfigKey: string,
  provider: string,
): string {
  return `${providerConfigKey}_${provider.toUpperCase()}_BLOCKED_UNTIL`;
}

/**
 * Checks whether the given capability + provider pair is currently blocked.
 *
 * A provider is considered BLOCKED if `SystemConfig` contains a `<key>_<PROVIDER>_BLOCKED_UNTIL`
 * entry whose value is a future ISO timestamp.
 *
 * @param providerConfigKey The SystemConfig key identifying the provider capability,
 *   e.g. "AI_PROVIDER_PARSING" or "AI_PROVIDER_SUMMARIES".
 * @param provider The currently-resolved provider for that capability, e.g. "gemini",
 *   "gemma-26b", "claude", "ollama" — callers get this from `resolveAIConfig(capability)`.
 * @returns `true` if blocked, `false` if healthy or unset.
 */
export async function isProviderBlocked(
  providerConfigKey: string,
  provider: string,
): Promise<boolean> {
  try {
    const blockedUntilKey = getBlockedUntilKey(providerConfigKey, provider);

    const config = await prisma.systemConfig.findUnique({
      where: { key: blockedUntilKey },
    });

    if (!config?.value) {
      return false;
    }

    const blockedUntil = new Date(config.value);

    if (isNaN(blockedUntil.getTime())) {
      // Corrupted or invalid date — treat as unblocked and clean up
      logger.warn(
        `Circuit breaker: invalid blockedUntil value for ${providerConfigKey}/${provider}. Resetting.`,
      );
      await resetProviderBlock(providerConfigKey, provider);
      return false;
    }

    const isBlocked = blockedUntil > new Date();

    if (!isBlocked) {
      // Block has expired — clean up the entry automatically
      logger.info(
        `Circuit breaker: cooldown expired for ${providerConfigKey}/${provider}. Auto-resetting.`,
      );
      await resetProviderBlock(providerConfigKey, provider);
    }

    return isBlocked;
  } catch (error) {
    logger.error(
      `Circuit breaker: error checking provider block for ${providerConfigKey}/${provider}`,
      { error },
    );
    // Fail open: if DB check fails, do not block the provider
    return false;
  }
}

/**
 * Marks an LLM provider as BLOCKED in `SystemConfig` for the configured cooldown period.
 * This is typically called when an HTTP 429, 401, or 402 response is received from the LLM API.
 *
 * @param providerConfigKey The SystemConfig key identifying the provider capability.
 * @param provider The provider that actually received the blocking response.
 * @param cooldownMs Optional cooldown duration in milliseconds. Defaults to 1 hour.
 */
export async function blockProvider(
  providerConfigKey: string,
  provider: string,
  cooldownMs: number = DEFAULT_COOLDOWN_MS,
): Promise<void> {
  try {
    const blockedUntilKey = getBlockedUntilKey(providerConfigKey, provider);
    const blockedUntil = new Date(Date.now() + cooldownMs).toISOString();

    await prisma.systemConfig.upsert({
      where: { key: blockedUntilKey },
      update: { value: blockedUntil },
      create: { key: blockedUntilKey, value: blockedUntil },
    });

    logger.warn(
      `Circuit breaker: ${providerConfigKey}/${provider} is now BLOCKED until ${blockedUntil} (cooldown: ${cooldownMs}ms)`,
    );
  } catch (error) {
    logger.error(
      `Circuit breaker: failed to block ${providerConfigKey}/${provider}`,
      { error },
    );
  }
}

/**
 * Manually resets a BLOCKED LLM provider, removing its cooldown entry from `SystemConfig`.
 * This can be triggered by the admin "Reset Provider" button in the Settings panel.
 *
 * @param providerConfigKey The SystemConfig key identifying the provider capability.
 * @param provider The provider whose block should be cleared.
 */
export async function resetProviderBlock(
  providerConfigKey: string,
  provider: string,
): Promise<void> {
  try {
    const blockedUntilKey = getBlockedUntilKey(providerConfigKey, provider);

    await prisma.systemConfig.delete({
      where: { key: blockedUntilKey },
    });

    logger.info(
      `Circuit breaker: ${providerConfigKey}/${provider} has been manually reset (unblocked).`,
    );
  } catch (error: unknown) {
    // P2025 = Record not found — this is fine, the block didn't exist
    if ((error as { code?: string })?.code !== "P2025") {
      logger.error(
        `Circuit breaker: failed to reset ${providerConfigKey}/${provider}`,
        { error },
      );
    }
  }
}

/**
 * Wraps an LLM API call with circuit breaker protection.
 * If the call throws an error with a blocking HTTP status, the provider is blocked automatically.
 *
 * @param providerConfigKey The SystemConfig key identifying the provider capability.
 * @param provider The provider actually in use for this call (from `resolveAIConfig`) — the
 *   block, if triggered, is scoped to this specific provider, not the capability as a whole.
 * @param fn The async function wrapping the LLM API call.
 * @param cooldownMs Optional cooldown duration in milliseconds.
 * @returns The result of the wrapped function.
 * @throws Re-throws the original error after marking the provider as blocked.
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
    const statusCode = extractHttpStatus(error);

    if (statusCode !== null && isBlockingHttpStatus(statusCode)) {
      await blockProvider(providerConfigKey, provider, cooldownMs);
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
    if (
      err.response &&
      typeof (err.response as Record<string, unknown>).status === "number"
    ) {
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
