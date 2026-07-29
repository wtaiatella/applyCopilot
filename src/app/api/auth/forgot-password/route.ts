import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import crypto from "crypto";
import { Resend } from "resend";
import { z } from "zod";
import { logger } from "@/lib/logging/logger";
import path from "path";
import fs from "fs";

const ForgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const resend = new Resend(process.env.RESEND_API_KEY || "re_mock_key");

// Resolve repository root directory dynamically
const getRepoRoot = (): string => {
  const cwd = process.cwd();
  if (cwd.endsWith("frontend")) {
    return path.join(cwd, "..");
  }
  return cwd;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsedData = ForgotPasswordSchema.safeParse(body);

    if (!parsedData.success) {
      return NextResponse.json(
        { success: false, errors: parsedData.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { email } = parsedData.data;

    // Search for user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Security practice: Return 200 even if user doesn't exist to prevent email enumeration
    if (!user) {
      logger.info("Password reset requested for non-existent email", { email });
      return NextResponse.json(
        { success: true, message: "If the email exists, a reset link has been sent" },
        { status: 200 }
      );
    }

    // Rate limiting: max 3 requests per hour per user
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentTokensCount = await prisma.passwordResetToken.count({
      where: {
        userId: user.id,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentTokensCount >= 3) {
      logger.warn("Password reset rate limit hit", { email, userId: user.id });
      return NextResponse.json(
        { success: false, message: "Too many password reset requests. Please try again in an hour." },
        { status: 429 }
      );
    }

    // Invalidate all existing unused reset tokens for this user by expiring them
    await prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        expiresAt: new Date(),
      },
    });

    // Generate random secure token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours expiry

    // Save hashed token in DB
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
      },
    });

    const resetLink = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/reset-password?token=${rawToken}`;

    // Send email using Resend
    let sentEmail = false;
    if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== "re_mock_key") {
      try {
        await resend.emails.send({
          from: process.env.FROM_EMAIL || "onboarding@resend.dev",
          to: email,
          subject: "Reset your ApplyCopilot password",
          html: `<p>You requested a password reset. Click <a href="${resetLink}">here</a> to reset your password. This link will expire in 24 hours.</p>`,
        });
        sentEmail = true;
        logger.info("Password reset email sent via Resend", { email, userId: user.id });
      } catch (emailError) {
        logger.error("Failed to send email via Resend API", { emailError, email });
      }
    }

    // Dev/Test mode email fallback
    if (process.env.NODE_ENV !== "production" || !sentEmail) {
      try {
        const repoRoot = getRepoRoot();
        const debugEmailsDir = path.join(repoRoot, "debug", "emails");

        if (!fs.existsSync(debugEmailsDir)) {
          fs.mkdirSync(debugEmailsDir, { recursive: true });
        }

        const logFilePath = path.join(debugEmailsDir, `reset-${email}-${Date.now()}.txt`);
        fs.writeFileSync(
          logFilePath,
          `To: ${email}\nLink: ${resetLink}\nSent via Resend: ${sentEmail}\nTimestamp: ${new Date().toISOString()}\n`
        );
        logger.info("Saved password reset link to debug directory", { logFilePath, resetLink });
      } catch (fsError) {
        logger.error("Failed to write password reset log file", { fsError });
      }
    }

    return NextResponse.json(
      { success: true, message: "If the email exists, a reset link has been sent" },
      { status: 200 }
    );
  } catch (error) {
    logger.error("Forgot password flow failed", { error });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
