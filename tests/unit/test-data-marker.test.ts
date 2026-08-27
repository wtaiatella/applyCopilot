import {
  isTestEmail,
  makeTestEmail,
  sweepTestData,
  TEST_EMAIL_DOMAIN,
} from "@/lib/testing/test-data-marker";

describe("test-data-marker — isTestEmail", () => {
  it("returns true for an @example.com email", () => {
    expect(isTestEmail("x@example.com")).toBe(true);
  });

  it("returns false for a non-marker domain email", () => {
    expect(isTestEmail("x@realcorp.com")).toBe(false);
  });
});

describe("test-data-marker — makeTestEmail", () => {
  it("ends with the marker domain", () => {
    expect(makeTestEmail("foo")).toMatch(new RegExp(`@${TEST_EMAIL_DOMAIN}$`));
  });

  it("produces a unique string across two calls", () => {
    const first = makeTestEmail("foo");
    const second = makeTestEmail("foo");
    expect(first).not.toBe(second);
  });
});

describe("test-data-marker — sweepTestData env guard", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalNodeEnv,
      writable: true,
      configurable: true,
    });
  });

  it("throws when NODE_ENV is 'production' and execute is true, without touching prisma", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      writable: true,
      configurable: true,
    });
    const prismaStub = {
      user: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    } as never;

    await expect(sweepTestData(prismaStub, { execute: true })).rejects.toThrow(
      /production/i,
    );
  });
});
