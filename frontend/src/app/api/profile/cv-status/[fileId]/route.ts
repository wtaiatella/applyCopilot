import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt'

export async function GET(
  request: Request,
  { params }: { params: { fileId: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization')
    const token = extractTokenFromHeader(authHeader)
    if (!token) {
      return NextResponse.json({ success: false, message: 'Não autorizado' }, { status: 401 })
    }
    
    try {
      verifyToken(token)
    } catch (e) {
      return NextResponse.json({ success: false, message: 'Token inválido' }, { status: 401 })
    }

    // In Next.js 15+ and 16, params must be awaited
    const { fileId } = await params

    const profile = await prisma.profile.findUnique({
      where: { userId: fileId }
    })

    if (!profile || !profile.cvParsedAt) {
      return NextResponse.json({
        success: true,
        data: {
          status: 'processing',
          progress: 50
        }
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        status: 'completed',
        progress: 100,
        extracted_data: {
          summary: profile.summary,
          skills: profile.skills,
          experiences: profile.experiences,
          education: profile.education
        }
      }
    })

  } catch (error: any) {
    console.error('Status check error:', error)
    return NextResponse.json({
      success: false,
      message: 'Erro ao verificar status',
      error: error.message
    }, { status: 500 })
  }
}
