import { logger, saveAuditPayload } from "@/lib/logging/logger";
import fs from "fs";

jest.mock("fs", () => {
  const actualFs = jest.requireActual("fs");
  return {
    ...actualFs,
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    existsSync: jest.fn().mockReturnValue(true),
  };
});

describe("Winston Logger & Audit Payload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LOG_LEVEL = "debug";
  });

  afterEach(() => {
    delete process.env.LOG_LEVEL;
  });

  it("should have a configured winston logger instance", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("should write audit payloads when LOG_LEVEL is debug", () => {
    saveAuditPayload("test-request-id", "test-doc", "json", "{}");

    expect(fs.writeFileSync).toHaveBeenCalled();
    const [filePath, content] = (fs.writeFileSync as jest.Mock).mock.calls[0];
    expect(filePath).toContain("test-request-id-test-doc.json");
    expect(content).toBe("{}");
  });

  it("should not write audit payloads when LOG_LEVEL is info", () => {
    process.env.LOG_LEVEL = "info";
    saveAuditPayload("test-request-id", "test-doc", "json", "{}");

    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
