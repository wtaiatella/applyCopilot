import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import prisma from '@/lib/prisma'
import {
  createdResponse,
  handleApiError,
  AlreadyExistsError,
  DatabaseError,
  ValidationError,
} from '@/lib/api'
import { loggers } from '@/lib/logging'
import { checkRateLimit } from '@/lib/rate-limit'
import { signUpSchema, SignUpInput } from '@/lib/validation'
import { sendEmail } from '@/lib/email'
import { getWelcomeEmailTemplate } from '@/lib/email/templates'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Check rate limit (5 requests per minute for auth endpoints)
  const { allowed, response } = await checkRateLimit('AUTH', request)
  if (!allowed) {
    return response!
  }

  try {
    const body = await request.json()

    // Validate with Zod
    const validationResult = signUpSchema.safeParse(body)
    if (!validationResult.success) {
      const errors = validationResult.error.flatten().fieldErrors
      throw new ValidationError('Invalid input', errors)
    }

    const { name, email, password }: SignUpInput = validationResult.data

    loggers.auth.info('Signup attempt', { email })

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      loggers.auth.warn('Signup failed - user already exists', { email })
      throw new AlreadyExistsError('User')
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12)

    // Create user
    let user
    try {
      user = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
        },
      })
    } catch {
      throw new DatabaseError('Failed to create user')
    }

    // Send welcome email (non-blocking)
    try {
      const firstName = name.split(' ')[0]
      const emailTemplate = getWelcomeEmailTemplate(firstName)
      await sendEmail({
        to: email,
        subject: emailTemplate.subject,
        html: emailTemplate.html,
        text: emailTemplate.text,
      })
      loggers.email.info('Welcome email sent', { userId: user.id, email })
    } catch (emailError) {
      // Log error but don't fail registration if email fails
      loggers.email.error('Failed to send welcome email', {
        userId: user.id,
        email,
        error: (emailError as Error).message,
      })
    }

    const duration = Date.now() - startTime
    loggers.auth.info('User created successfully', {
      userId: user.id,
      email: user.email,
      duration: `${duration}ms`,
    })

    return createdResponse({
      id: user.id,
      name: user.name,
      email: user.email,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
