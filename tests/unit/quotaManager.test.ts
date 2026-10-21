import {
  evaluateAndLazyReset,
  floorToMinute,
  floorToUtcDay,
} from "../../src/lib/ai/quota-manager";

describe("Quota Manager & Lazy Reset Unit Tests", () => {
  it("floors date to wall-clock minute (:00)", () => {
    const date = new Date("2026-08-31T14:35:42.500Z");
    const floored = floorToMinute(date);
    expect(floored.getSeconds()).toBe(0);
    expect(floored.getMilliseconds()).toBe(0);
    expect(floored.getMinutes()).toBe(35);
  });

  it("floors date to 00:00:00.000 UTC of that day", () => {
    const date = new Date("2026-08-31T14:35:42.500Z");
    const floored = floorToUtcDay(date);
    expect(floored.getUTCHours()).toBe(0);
    expect(floored.getUTCMinutes()).toBe(0);
    expect(floored.getUTCSeconds()).toBe(0);
    expect(floored.getUTCMilliseconds()).toBe(0);
    expect(floored.getUTCDate()).toBe(31);
  });

  it("calculates effective limits using safetyMargin", () => {
    const model = {
      rpm: 100,
      rpd: 1000,
      safetyMargin: 0.9,
      blockedUntil: null,
    };

    const result = evaluateAndLazyReset(model, null, new Date());
    expect(result.effectiveRpm).toBe(90);
    expect(result.effectiveRpd).toBe(900);
    expect(result.isAvailable).toBe(true);
  });

  it("marks model unavailable if blocked by circuit breaker", () => {
    const now = new Date("2026-08-31T12:00:00Z");
    const model = {
      rpm: 100,
      rpd: 1000,
      safetyMargin: 0.9,
      blockedUntil: new Date("2026-08-31T12:30:00Z"), // in future
    };

    const result = evaluateAndLazyReset(model, null, now);
    expect(result.isAvailable).toBe(false);
  });

  it("marks model unavailable if minute quota reached", () => {
    const now = new Date("2026-08-31T12:00:10Z");
    const model = {
      rpm: 10,
      rpd: 1000,
      safetyMargin: 0.9, // effective RPM = 9
      blockedUntil: null,
    };

    const counter = {
      windowStartMin: new Date("2026-08-31T12:00:00Z"),
      countRequestsMin: 9,
      countTokensMin: 0,
      windowStartDay: new Date("2026-08-31T00:00:00Z"),
      countRequestsDay: 50,
      countTokensDay: 0,
    };

    const result = evaluateAndLazyReset(model, counter, now);
    expect(result.isAvailable).toBe(false);
  });

  it("performs lazy reset when now crosses minute boundary", () => {
    const now = new Date("2026-08-31T12:01:05Z"); // next minute
    const model = {
      rpm: 10,
      rpd: 1000,
      safetyMargin: 0.9, // effective RPM = 9
      blockedUntil: null,
    };

    const counter = {
      windowStartMin: new Date("2026-08-31T12:00:00Z"),
      countRequestsMin: 9,
      countTokensMin: 0,
      windowStartDay: new Date("2026-08-31T00:00:00Z"),
      countRequestsDay: 50,
      countTokensDay: 0,
    };

    const result = evaluateAndLazyReset(model, counter, now);
    expect(result.isAvailable).toBe(true);
    expect(result.countRequestsMin).toBe(0);
    expect(result.windowStartMin.getMinutes()).toBe(1);
  });

  it("performs lazy reset when now crosses UTC day boundary", () => {
    const now = new Date("2026-09-01T00:00:05Z"); // next day UTC
    const model = {
      rpm: 10,
      rpd: 100,
      safetyMargin: 0.9, // effective RPD = 90
      blockedUntil: null,
    };

    const counter = {
      windowStartMin: new Date("2026-09-01T00:00:00Z"),
      countRequestsMin: 1,
      countTokensMin: 0,
      windowStartDay: new Date("2026-08-31T00:00:00Z"),
      countRequestsDay: 90,
      countTokensDay: 0,
    };

    const result = evaluateAndLazyReset(model, counter, now);
    expect(result.isAvailable).toBe(true);
    expect(result.countRequestsDay).toBe(0);
    expect(result.windowStartDay.getUTCDate()).toBe(1);
  });
});
