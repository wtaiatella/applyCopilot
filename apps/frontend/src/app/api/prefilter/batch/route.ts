import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt'
import { calculateFastMatchScore, prepareProfileForMatching, prepareJobForMatching } from '@/lib/tfjs/matching'

export async function POST(request: Request) {
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

    // 2. Get user profile data structure
    const profile = await prisma.profile.findUnique({
      where: { userId: decoded.userId }
    })
    
    if (!profile) {
      return NextResponse.json({ success: false, message: 'Seu perfil está incompleto para filtragem' }, { status: 404 })
    }

    // 3. Find jobs that haven't been filtered yet
    const jobsToFilter = await prisma.job.findMany({
      where: {
        userId: decoded.userId,
        status: { in: ['PARSING', 'DISCOVERED'] }
      }
    })

    if (jobsToFilter.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Nenhuma nova vaga pendente de filtragem encontrada.',
        data: []
      })
    }

    // Prepare profile text for embedding once
    const profileText = prepareProfileForMatching(profile)
    const results = []

    // 4. Run TensorFlow pre-filtering for each candidate job
    for (const job of jobsToFilter) {
      try {
        const jobText = prepareJobForMatching(job)
        const tfScore = await calculateFastMatchScore(profileText, jobText)
        
        const updatedJob = await prisma.job.update({
          where: { id: job.id },
          data: {
            tfScore: tfScore,
            status: 'PREFILTERED'
          }
        })
        results.push(updatedJob)
      } catch (jobError: any) {
        console.error(`Error pre-filtering job ${job.id}:`, jobError.message)
      }
    }

    return NextResponse.json({
      success: true,
      message: `${results.length} vagas pré-filtradas localmente com sucesso!`,
      data: results
    })

  } catch (error: any) {
    console.error('Batch Pre-filter API Error:', error)
    return NextResponse.json({
      success: false,
      message: 'Erro interno ao realizar pré-filtragem local',
      error: error.message
    }, { status: 500 })
  }
}
