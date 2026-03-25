import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt'

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization')
    const token = extractTokenFromHeader(authHeader)

    if (!token) {
      return NextResponse.json({
        success: false,
        message: 'Token não fornecido'
      }, { status: 401 })
    }

    try {
      const decoded = verifyToken(token)
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          updatedAt: true
        }
      })

      if (!user) {
        return NextResponse.json({
          success: false,
          message: 'Usuário não encontrado'
        }, { status: 404 })
      }

      // Rename name to full_name for matching Frontend interface
      const userData = {
        ...user,
        full_name: user.name
      }

      return NextResponse.json({
        success: true,
        data: userData
      }, { status: 200 })

    } catch (tokenError) {
      return NextResponse.json({
        success: false,
        message: 'Token inválido ou expirado'
      }, { status: 401 })
    }

  } catch (error: any) {
    console.error('Me endpoint error:', error)
    return NextResponse.json({
      success: false,
      message: 'Erro interno ao validar autenticação',
      error: error.message
    }, { status: 500 })
  }
}
