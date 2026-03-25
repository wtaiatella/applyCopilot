import { NextResponse } from 'next/server'
export const runtime = 'nodejs';
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { UserRegisterSchema } from '@/types/schemas'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // Validate request body
    const validation = UserRegisterSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({
        success: false,
        message: 'Invalid data',
        error: validation.error.format()
      }, { status: 400 })
    }

    const { email, full_name, password } = validation.data

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return NextResponse.json({
        success: false,
        message: 'Email already registered',
      }, { status: 400 })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user and initial profile
    const user = await prisma.user.create({
      data: {
        email,
        name: full_name,
        passwordHash: hashedPassword,
        profile: {
          create: {} // Create an empty profile for the new user
        }
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true
      }
    })

    return NextResponse.json({
      success: true,
      message: 'User registered successfully',
      data: user
    }, { status: 201 })

  } catch (error: any) {
    console.error('Registration error:', error)
    return NextResponse.json({
      success: false,
      message: 'Internal error while registering user',
      error: error.message
    }, { status: 500 })
  }
}
