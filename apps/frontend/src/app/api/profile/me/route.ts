import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt'

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization')
    const token = extractTokenFromHeader(authHeader)
    if (!token) return NextResponse.json({ success: false, message: 'Não autorizado' }, { status: 401 })
    
    let decoded;
    try {
      decoded = verifyToken(token)
    } catch (e) {
      return NextResponse.json({ success: false, message: 'Token inválido' }, { status: 401 })
    }

    const profile = await prisma.profile.findUnique({
      where: { userId: decoded.userId }
    })

    if (!profile) {
      // Auto-create profile if missing
      const newProfile = await prisma.profile.create({
        data: { userId: decoded.userId }
      })
      return NextResponse.json({ success: true, data: newProfile })
    }

    return NextResponse.json({ success: true, data: profile })

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: 'Erro ao buscar perfil',
      error: error.message
    }, { status: 500 })
  }
}
