import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import logger from '@/lib/logging/logger';

// Validation schema
const resetPasswordSchema = z.object({
  token: z.string().min(64, 'Invalid token'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password is too long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;

/**
 * POST /api/auth/reset-password
 * Reset password using token
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validation = resetPasswordSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { token, password } = validation.data;

    // Find valid token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    // Check if token exists and is valid
    if (!resetToken) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 400 }
      );
    }

    // Check if token is already used
    if (resetToken.usedAt) {
      return NextResponse.json(
        { error: 'Token has already been used' },
        { status: 400 }
      );
    }

    // Check if token is expired
    if (resetToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Token has expired' },
        { status: 400 }
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update user password in transaction
    await prisma.$transaction(async (tx) => {
      // Update user password
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      });

      // Mark token as used
      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      });

      // Invalidate all user sessions for security
      await tx.session.deleteMany({
        where: { userId: resetToken.userId },
      });
    });

    logger.info('Password reset successful', {
      userId: resetToken.userId,
      email: resetToken.user.email,
    });

    return NextResponse.json(
      { message: 'Password has been reset successfully. Please sign in with your new password.' },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Reset password error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
