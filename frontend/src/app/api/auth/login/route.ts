import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { UserLoginSchema } from '@/types/schemas'
import { signToken } from '@/lib/jwt'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // Validate request body
    const validation = UserLoginSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({
        success: false,
        message: 'Dados inválidos',
        error: validation.error.format()
      }, { status: 400 })
    }

    const { email, password } = validation.data

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return NextResponse.json({
        success: false,
        message: 'Email ou senha inválidos'
      }, { status: 401 })
    }

    // Compare passwords
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash)
    
    if (!isPasswordValid) {
      return NextResponse.json({
        success: false,
        message: 'Email ou senha inválidos'
      }, { status: 401 })
    }

    // Sign JWT token
    const token = signToken({
      userId: user.id,
      email: user.email,
      name: user.name
    })

    // Prepare response data (excluding password)
    const userData = {
      id: user.id,
      email: user.email,
      full_name: user.name,
      created_at: user.createdAt,
      updated_at: user.updatedAt
    }

    return NextResponse.json({
      success: true,
      message: 'Login realizado com sucesso',
      data: {
        user: userData,
        token
      }
    }, { status: 200 })

  } catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json({
      success: false,
      message: 'Erro interno ao realizar login',
      error: error.message
    }, { status: 500 })
  }
}
