import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import prisma from '@/lib/prisma'
import {
  createdResponse,
  handleApiError,
  BadRequestError,
  AlreadyExistsError,
  DatabaseError,
} from '@/lib/api'
import { loggers } from '@/lib/logging'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const { name, email, password } = await request.json()

    loggers.auth.info('Signup attempt', { email })

    // Validation
    if (!name || !email || !password) {
      throw new BadRequestError('All fields are required')
    }

    if (password.length < 8) {
      throw new BadRequestError('Password must be at least 8 characters', {
        field: 'password',
        minLength: 8,
      })
    }

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
