import { ScraperStrategy } from "./engine";

const registry = new Map<string, ScraperStrategy>();

export function registerStrategy(strategy: ScraperStrategy) {
  registry.set(strategy.portalId, strategy);
}

export function getStrategy(portalId: string): ScraperStrategy | undefined {
  return registry.get(portalId);
}

export function getAllStrategies(): ScraperStrategy[] {
  return Array.from(registry.values());
}
