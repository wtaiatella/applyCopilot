/**
 * @jest-environment node
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import "dotenv/config";
import { POST as registerHandler } from "@/app/api/auth/register/route";
import { POST as forgotPasswordHandler } from "@/app/api/auth/forgot-password/route";
import { POST as resetPasswordHandler } from "@/app/api/auth/reset-password/route";
import { prisma, pool } from "@/lib/db/prisma";
import { authConfig } from "@/lib/auth/authConfig";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

describe("Authentication & Password Reset Integration Tests", () => {
  const testEmail = `auth-integration-${Date.now()}@example.com`;
  const testPassword = "supersecurepassword123";
  let createdUserId: string;

  afterAll(async () => {
    // Clean up test user
    if (createdUserId) {
      await prisma.user.delete({
        where: { id: createdUserId },
      }).catch(() => {});
    }

    // Clean up temporary debug email files
    const debugEmailsDir = path.join(process.cwd(), "..", "debug", "emails");
    if (fs.existsSync(debugEmailsDir)) {
      const files = fs.readdirSync(debugEmailsDir);
      for (const file of files) {
        if (file.includes(testEmail)) {
          fs.unlinkSync(path.join(debugEmailsDir, file));
        }
      }
    }

    await prisma.$disconnect();
    await pool.end();
  });

  describe("POST /api/auth/register", () => {
    it("should successfully register a new user", async () => {
      const req = new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      });

      const res = await registerHandler(req);
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.success).toBe(true);

      const user = await prisma.user.findUnique({ where: { email: testEmail } });
      expect(user).toBeDefined();
      expect(user?.email).toBe(testEmail);
      createdUserId = user!.id;
    });

    it("should fail to register a duplicate email", async () => {
      const req = new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      });

      const res = await registerHandler(req);
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain("already exists");
    });

    it("should fail validation with invalid inputs", async () => {
      const req = new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email: "not-an-email", password: "123" }),
      });

      const res = await registerHandler(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.errors).toBeDefined();
    });
  });

  describe("POST /api/auth/forgot-password", () => {
    it("should generate a reset token, write to debug directory, and delete old tokens", async () => {
      // 1. Request first reset
      const req1 = new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: testEmail }),
      });

      const res1 = await forgotPasswordHandler(req1);
      expect(res1.status).toBe(200);

      const json1 = await res1.json();
      expect(json1.success).toBe(true);

      // Verify token created in DB
      const tokens1 = await prisma.passwordResetToken.findMany({
        where: { userId: createdUserId },
      });
      expect(tokens1).toHaveLength(1);

      // 2. Request second reset to verify invalidation of the first token
      const req2 = new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: testEmail }),
      });

      const res2 = await forgotPasswordHandler(req2);
      expect(res2.status).toBe(200);

      const tokens2 = await prisma.passwordResetToken.findMany({
        where: { userId: createdUserId },
        orderBy: { createdAt: "asc" },
      });
      expect(tokens2).toHaveLength(2); // The old token was expired, so total tokens is 2
      expect(tokens2[0].expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 5000); // First token is expired
      expect(tokens2[1].expiresAt.getTime()).toBeGreaterThan(Date.now()); // Second token is active

      // Verify email file written in debug directory
      const debugEmailsDir = path.join(process.cwd(), "..", "debug", "emails");
      const files = fs.readdirSync(debugEmailsDir);
      const userFiles = files.filter(file => file.includes(testEmail));
      expect(userFiles.length).toBeGreaterThanOrEqual(1);

      const fileContent = fs.readFileSync(path.join(debugEmailsDir, userFiles[userFiles.length - 1]), "utf-8");
      expect(fileContent).toContain(testEmail);
      expect(fileContent).toContain("reset-password?token=");
    });

    it("should enforce the 3 requests per hour rate limit", async () => {
      // We already made 2 requests in the previous test.
      // 3rd request:
      const req3 = new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: testEmail }),
      });
      const res3 = await forgotPasswordHandler(req3);
      expect(res3.status).toBe(200);

      // 4th request (triggers rate limit):
      const req4 = new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: testEmail }),
      });
      const res4 = await forgotPasswordHandler(req4);
      expect(res4.status).toBe(429);

      const json4 = await res4.json();
      expect(json4.success).toBe(false);
      expect(json4.message).toContain("Too many password reset requests");
    });
  });

  describe("POST /api/auth/reset-password", () => {
    it("should successfully reset password with valid token and update user credentials", async () => {
      // Clear rate-limited tokens and create one valid token for reset test
      await prisma.passwordResetToken.deleteMany({
        where: { userId: createdUserId },
      });

      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.passwordResetToken.create({
        data: {
          userId: createdUserId,
          token: hashedToken,
          expiresAt,
        },
      });

      // Reset password
      const newPassword = "newsupersecurepassword987";
      const req = new Request("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: rawToken, password: newPassword }),
      });

      const res = await resetPasswordHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify token marked as used
      const dbToken = await prisma.passwordResetToken.findUnique({
        where: { token: hashedToken },
      });
      expect(dbToken?.usedAt).not.toBeNull();

      // Verify user password updated
      const user = await prisma.user.findUnique({ where: { id: createdUserId } });
      const passwordUpdated = await bcrypt.compare(newPassword, user?.password || "");
      expect(passwordUpdated).toBe(true);
    });

    it("should reject used tokens", async () => {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.passwordResetToken.create({
        data: {
          userId: createdUserId,
          token: hashedToken,
          expiresAt,
          usedAt: new Date(), // Already used
        },
      });

      const req = new Request("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: rawToken, password: "somepassword123" }),
      });

      const res = await resetPasswordHandler(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain("already been used");
    });

    it("should reject expired tokens", async () => {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() - 1000); // Expired 1 second ago

      await prisma.passwordResetToken.create({
        data: {
          userId: createdUserId,
          token: hashedToken,
          expiresAt,
        },
      });

      const req = new Request("http://localhost:3000/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: rawToken, password: "somepassword123" }),
      });

      const res = await resetPasswordHandler(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain("expired");
    });
  });

  describe("NextAuth session role claim callbacks", () => {
    it("should map user role to JWT token", async () => {
      const jwtCallback = authConfig.callbacks?.jwt;
      expect(jwtCallback).toBeDefined();

      const mockUser = { id: "user-id-123", email: "admin@example.com", role: "ADMIN" };
      const mockToken = { sub: "sub-123" };

      const resultToken = await jwtCallback!({
        token: mockToken,
        user: mockUser as any,
        account: null as any,
        profile: null as any,
        trigger: "signIn",
      });

      expect(resultToken).toBeDefined();
      expect(resultToken.id).toBe("user-id-123");
      expect(resultToken.role).toBe("ADMIN");
    });

    it("should map token role to Session user object", async () => {
      const sessionCallback = authConfig.callbacks?.session;
      expect(sessionCallback).toBeDefined();

      const mockSession = {
        user: { name: "Test User", email: "test@example.com" },
        expires: new Date().toISOString(),
      };
      const mockToken = { id: "user-id-123", role: "ADMIN" };

      const resultSession = await sessionCallback!({
        session: mockSession as any,
        token: mockToken as any,
        user: null as any,
      });

      expect(resultSession).toBeDefined();
      expect(resultSession.user.id).toBe("user-id-123");
      expect(resultSession.user.role).toBe("ADMIN");
    });
  });
});
