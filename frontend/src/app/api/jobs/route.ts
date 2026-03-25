import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt'

export async function GET(request: Request) {
  try {
    // 1. Auth check
    const authHeader = request.headers.get('Authorization')
    const token = extractTokenFromHeader(authHeader)
    if (!token) {
      return NextResponse.json({ success: false, message: 'Não autorizado' }, { status: 401 })
    }
    
    let decoded;
    try {
      decoded = verifyToken(token)
    } catch (e) {
      return NextResponse.json({ success: false, message: 'Token inválido' }, { status: 401 })
    }

    // 2. Fetch jobs from MongoDB
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    
    const where: any = { userId: decoded.userId }
    if (status) where.status = status

    const jobs = await prisma.job.findMany({
      where,
      orderBy: { scrapedAt: 'desc' }
    })

    return NextResponse.json({
      success: true,
      data: jobs
    })

  } catch (error: any) {
    console.error('Fetch Jobs API Error:', error)
    return NextResponse.json({
      success: false,
      message: 'Erro ao buscar vagas guardadas',
      error: error.message
    }, { status: 500 })
  }
}
