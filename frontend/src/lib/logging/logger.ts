import winston from "winston";
import path from "path";
import fs from "fs";

// Resolve repository root directory dynamically
const getRepoRoot = (): string => {
  if (process.env.REPO_ROOT) {
    return process.env.REPO_ROOT;
  }
  const cwd = process.cwd();
  // If running inside the frontend subdirectory, repository root is one level up
  if (cwd.endsWith("frontend")) {
    return path.join(cwd, "..");
  }
  return cwd;
};

const repoRoot = getRepoRoot();
const debugDir = path.join(repoRoot, "debug");

const logLevel = process.env.LOG_LEVEL || "info";
const isDebug = logLevel.toLowerCase() === "debug";
const saveGlobalLogs = process.env.DEBUG_SAVE_EXTRACTED_TEXT === "true";

// Custom format for terminal logs
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

// Custom format for file logs (structured JSON logs)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const transports: winston.transport[] = [
  new winston.transports.Console({
    level: logLevel,
    format: consoleFormat,
  }),
];

// Add global log file if debug mode is active and saveGlobalLogs is enabled
if (isDebug && saveGlobalLogs) {
  // Ensure debug directory exists
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }
  transports.push(
    new winston.transports.File({
      filename: path.join(debugDir, "global.log"),
      level: "debug",
      format: fileFormat,
    })
  );
}

export const logger = winston.createLogger({
  level: logLevel,
  transports,
});

/**
 * Saves audit payloads to the debug folder during development mode when log level is debug.
 * Filename format: YYYY-MM-DD-HH-mm-ss-<requestId>-<description>.<ext>
 */
export const saveAuditPayload = (
  requestId: string,
  description: string,
  ext: string,
  content: string | Buffer
): void => {
  if (!isDebug) {
    return;
  }

  try {
    const targetDir = description === "upload" 
      ? path.join(debugDir, "uploads")
      : debugDir;

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate()
    )}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

    // Normalize description and ext to prevent directory traversal
    const safeDescription = description.replace(/[^a-zA-Z0-9_-]/g, "");
    const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "");
    const safeRequestId = requestId.replace(/[^a-zA-Z0-9_-]/g, "");

    const filename = `${timestamp}-${safeRequestId}-${safeDescription}.${safeExt}`;
    const filePath = path.join(targetDir, filename);

    fs.writeFileSync(filePath, content);
    logger.debug(`Saved audit payload: ${filename}`, { requestId, filePath });
  } catch (error) {
    logger.error("Failed to save audit payload", { error, requestId, description });
  }
};
