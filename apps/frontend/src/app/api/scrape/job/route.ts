import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt'
import { scrapeJobPage } from '@/lib/scraper/engine'
import { parseJobWithOllama } from '@/lib/ollama'

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

    // 2. Get URL from request
    const body = await request.json()
    const { url } = body
    if (!url) {
      return NextResponse.json({ success: false, message: 'URL da vaga é obrigatória' }, { status: 400 })
    }

    // Check if the job already exists for this user to avoid duplicates
    const existingJob = await prisma.job.findFirst({
      where: {
        userId: decoded.userId,
        sourceUrl: url
      }
    })

    if (existingJob) {
      return NextResponse.json({
        success: true,
        message: 'Esta vaga já foi cadastrada anteriormente',
        data: existingJob
      })
    }

    // 3. Scraping: Extract raw content and convert to Markdown
    let markdown = ''
    try {
      markdown = await scrapeJobPage(url)
    } catch (scrapeError: any) {
      return NextResponse.json({
        success: false,
        message: 'Falha ao realizar scraping da página: ' + scrapeError.message
      }, { status: 502 })
    }

    // 4. AI Structuring: Convert Markdown to structured JSON using Ollama
    let structuredData;
    let jobStatus: 'DISCOVERED' | 'PARSING' = 'DISCOVERED'
    
    try {
      structuredData = await parseJobWithOllama(markdown)
      jobStatus = 'PARSING' 
    } catch (ollamaError: any) {
      console.warn('Ollama failure for job parsing, saving raw markdown only:', ollamaError.message)
    }

    // 5. Persistence into MongoDB
    const platform = new URL(url).hostname.replace('www.', '').split('.')[0]
    
    const job = await prisma.job.create({
      data: {
        userId: decoded.userId,
        sourceUrl: url,
        sourcePlatform: platform.charAt(0).toUpperCase() + platform.slice(1),
        rawMarkdown: markdown,
        
        // Structured data (if Ollama succeeded)
        title: structuredData?.title || 'Título não identificado',
        company: structuredData?.company || 'Empresa não identificada',
        companyLocation: structuredData?.location,
        jobType: structuredData?.jobType,
        workModality: structuredData?.workModality,
        salaryRange: structuredData?.salary,
        description: structuredData?.description,
        requirements: structuredData?.requirements || [],
        responsibilities: structuredData?.responsibilities || [],
        benefits: structuredData?.benefits || [],
        
        status: jobStatus
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Vaga descoberta e estruturada com sucesso!',
      data: job
    })

  } catch (error: any) {
    console.error('Job Discovery API Error:', error)
    return NextResponse.json({
      success: false,
      message: 'Erro interno ao processar descoberta de vaga',
      error: error.message
    }, { status: 500 })
  }
}
