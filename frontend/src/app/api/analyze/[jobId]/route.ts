import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt'
import { deepAnalyzeJobWithGemini } from '@/lib/ai/gemini'

export async function POST(
  request: Request,
  { params }: { params: { jobId: string } }
) {
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

    const { jobId } = await params

    // 2. Fetch job and profile
    const job = await prisma.job.findUnique({
      where: { 
        id: jobId,
        userId: decoded.userId // Security check: user must own this job record
      }
    })

    if (!job) {
      return NextResponse.json({ success: false, message: 'Vaga não encontrada em sua base de dados.' }, { status: 404 })
    }

    const profile = await prisma.profile.findUnique({
      where: { userId: decoded.userId }
    })

    if (!profile || (!profile.summary && !profile.skills.length)) {
      return NextResponse.json({ 
        success: false, 
        message: 'Por favor, complete as informações do seu perfil antes de realizar análise profunda.' 
      }, { status: 400 })
    }

    // 3. Execution of premium LLM analysis (Gemini Pro/Flash)
    // Note: It's expected that GEMINI_API_KEY is present in .env
    const analysisResults = await deepAnalyzeJobWithGemini(profile, job)

    // 4. Update the job with premium matching scores and insights
    const analyzedJob = await prisma.job.update({
      where: { id: jobId },
      data: {
        aiMatchScore: analysisResults.matchScore,
        aiAnalysis: analysisResults as any, // Typed as Json in Prisma
        status: 'ANALYZED',
        analyzedAt: new Date()
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Análise premium de compatibilidade concluída com sucesso!',
      data: analyzedJob
    })

  } catch (error: any) {
    console.error('Deep Match API Error:', error)
    return NextResponse.json({
      success: false,
      message: 'Erro durante a análise profunda. Verifique o console ou a chave do Gemini.',
      error: error.message
    }, { status: 500 })
  }
}
