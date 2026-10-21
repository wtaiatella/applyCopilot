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
 * Legacy key generation helper for SystemConfig compatibility.
 */
export function getBlockedUntilKey(
  providerConfigKey: string,
  provider: string,
): string {
  return `${providerConfigKey}_${provider.toUpperCase()}_BLOCKED_UNTIL`;
}

/**
 * Legacy blockProvider helper.
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
}

/**
 * Legacy resetProviderBlock helper.
 */
export async function resetProviderBlock(
  providerConfigKey: string,
  provider: string,
): Promise<void> {
  try {
    const key = getBlockedUntilKey(providerConfigKey, provider);
    await prisma.systemConfig.delete({
      where: { key },
    });
  } catch {}
}

/**
 * Checks whether the given model is currently blocked by the circuit breaker.
 */
export async function isModelBlocked(modelId: string): Promise<boolean> {
  try {
    const model = await prisma.aIModel.findUnique({
      where: { id: modelId },
      select: { blockedUntil: true },
    });

    if (!model?.blockedUntil) {
      return false;
    }

    const now = new Date();
    const isBlocked = model.blockedUntil > now;

    if (!isBlocked) {
      // Cooldown expired, clear blockedUntil automatically
      await prisma.aIModel.update({
        where: { id: modelId },
        data: { blockedUntil: null },
      });
      logger.info(`Circuit breaker: cooldown expired for model ${modelId}. Unblocked.`);
    }

    return isBlocked;
  } catch (error) {
    logger.error(`Circuit breaker: error checking block for model ${modelId}`, {
      error,
    });
    return false;
  }
}

/**
 * Marks an LLM model as BLOCKED for the configured cooldown period.
 */
export async function blockModel(
  modelId: string,
  cooldownMs: number = DEFAULT_COOLDOWN_MS,
): Promise<void> {
  try {
    const blockedUntil = new Date(Date.now() + cooldownMs);

    await prisma.aIModel.update({
      where: { id: modelId },
      data: { blockedUntil },
    });

    logger.warn(
      `Circuit breaker: model ${modelId} is now BLOCKED until ${blockedUntil.toISOString()} (cooldown: ${cooldownMs}ms)`,
    );
  } catch (error) {
    logger.error(`Circuit breaker: failed to block model ${modelId}`, { error });
  }
}

/**
 * Manually resets a BLOCKED LLM model.
 */
export async function resetModelBlock(modelId: string): Promise<void> {
  try {
    await prisma.aIModel.update({
      where: { id: modelId },
      data: { blockedUntil: null },
    });

    logger.info(`Circuit breaker: model ${modelId} has been manually unblocked.`);
  } catch (error) {
    logger.error(`Circuit breaker: failed to unblock model ${modelId}`, { error });
    throw error;
  }
}

/**
 * Legacy compatibility helper for checking provider blocks via SystemConfig (e.g. embeddings).
 */
export async function isProviderBlocked(
  providerConfigKey: string,
  _provider?: string,
): Promise<boolean> {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: `${providerConfigKey}_BLOCKED_UNTIL` },
    });

    if (!config?.value) return false;
    const blockedUntil = new Date(config.value);
    return blockedUntil > new Date();
  } catch {
    return false;
  }
}

/**
 * Wraps an LLM API call with circuit breaker protection for an AIModel.
 */
export async function withCircuitBreaker<T>(
  modelIdOrKey: string,
  _provider: string,
  fn: () => Promise<T>,
  cooldownMs: number = DEFAULT_COOLDOWN_MS,
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    const statusCode = extractHttpStatus(error);

    if (statusCode !== null && isBlockingHttpStatus(statusCode)) {
      // Check if modelIdOrKey is an AIModel ID or legacy SystemConfig key
      try {
        await blockModel(modelIdOrKey, cooldownMs);
      } catch {
        // If not found in AIModel table, fallback to legacy SystemConfig
        const blockedUntilKey = `${modelIdOrKey}_BLOCKED_UNTIL`;
        const blockedUntil = new Date(Date.now() + cooldownMs).toISOString();
        await prisma.systemConfig.upsert({
          where: { key: blockedUntilKey },
          update: { value: blockedUntil },
          create: { key: blockedUntilKey, value: blockedUntil },
        });
      }
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
