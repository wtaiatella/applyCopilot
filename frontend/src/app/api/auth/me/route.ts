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
        message: 'Token not provided'
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
          message: 'User not found'
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
        message: 'Invalid or expired token'
      }, { status: 401 })
    }

  } catch (error: any) {
    console.error('Me endpoint error:', error)
    return NextResponse.json({
      success: false,
      message: 'Internal error while validating authentication',
      error: error.message
    }, { status: 500 })
  }
}
