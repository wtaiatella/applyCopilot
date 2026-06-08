import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { consumeRateLimit } from '@/lib/rate-limit';
import logger from '@/lib/logging/logger';

// Validation schema
const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export type ForgotPasswordRequest = z.infer<typeof forgotPasswordSchema>;

/**
 * POST /api/auth/forgot-password
 * Request password reset link
 * Rate limit: 3 requests per hour per IP
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Apply rate limiting (3 requests per hour)
    const rateLimitResult = await consumeRateLimit('PASSWORD_RESET', request);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter || 3600) } }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = forgotPasswordSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid email address', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { email } = validation.data;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always return success even if user not found (security best practice)
    if (!user) {
      logger.info('Password reset requested for non-existent user', { email });
      return NextResponse.json(
        { message: 'If an account exists, a reset link has been sent.' },
        { status: 200 }
      );
    }

    // Generate secure token (32 bytes = 64 hex chars)
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Invalidate any existing unused tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });

    // Create new reset token
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // Build reset URL
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;

    // Send password reset email
    const { getPasswordResetTemplate } = await import('@/lib/email/templates');
    const emailTemplate = getPasswordResetTemplate(resetUrl);

    await sendEmail({
      to: user.email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      text: emailTemplate.text,
    });

    logger.info('Password reset token generated', {
      userId: user.id,
      email: user.email,
    });

    return NextResponse.json(
      { message: 'If an account exists, a reset link has been sent.' },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Forgot password error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
