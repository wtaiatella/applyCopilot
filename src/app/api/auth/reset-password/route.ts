import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { logger } from "@/lib/logging/logger";

const ResetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsedData = ResetPasswordSchema.safeParse(body);

    if (!parsedData.success) {
      return NextResponse.json(
        { success: false, errors: parsedData.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { token: rawToken, password } = parsedData.data;

    // Hash the token to compare with the stored SHA-256 hash
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    // Search for valid token
    const resetTokenRecord = await prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
      include: { user: true },
    });

    if (!resetTokenRecord) {
      return NextResponse.json(
        { success: false, message: "Invalid password reset token" },
        { status: 400 }
      );
    }

    if (resetTokenRecord.usedAt !== null) {
      return NextResponse.json(
        { success: false, message: "Reset token has already been used" },
        { status: 400 }
      );
    }

    if (resetTokenRecord.expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, message: "Reset token has expired" },
        { status: 400 }
      );
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update password and mark token as used in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetTokenRecord.userId },
        data: { password: hashedPassword },
      });

      await tx.passwordResetToken.update({
        where: { id: resetTokenRecord.id },
        data: { usedAt: new Date() },
      });
    });

    logger.info("User password reset successfully", { userId: resetTokenRecord.userId });

    return NextResponse.json(
      { success: true, message: "Password reset successful" },
      { status: 200 }
    );
  } catch (error) {
    logger.error("Password reset failed", { error });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
