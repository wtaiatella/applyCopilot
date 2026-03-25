import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt'
// @ts-ignore
import pdf from 'pdf-parse'
import mammoth from 'mammoth'
import { parseCVWithOllama } from '@/lib/ollama'

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

    // 2. Parse file from FormData
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) {
      return NextResponse.json({ success: false, message: 'Arquivo não enviado' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    let extractedText = ''
    if (file.type === 'application/pdf') {
      try {
        const data = await pdf(buffer)
        extractedText = data.text
      } catch (pdfError: any) {
        throw new Error('Falha ao extrair texto do PDF: ' + pdfError.message)
      }
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      try {
        const result = await mammoth.extractRawText({ buffer })
        extractedText = result.value
      } catch (mammothError: any) {
        throw new Error('Falha ao extrair texto do DOCX: ' + mammothError.message)
      }
    } else if (file.type === 'text/plain') {
      extractedText = buffer.toString('utf-8')
    } else {
      return NextResponse.json({ success: false, message: 'Tipo de arquivo não suportado' }, { status: 400 })
    }

    if (!extractedText.trim()) {
      return NextResponse.json({ success: false, message: 'Não foi possível extrair texto do arquivo' }, { status: 422 })
    }

    // 3. AI Structuring (local Ollama)
    // Note: Make sure the local Ollama server is running and the model is downloaded
    let structuredData;
    try {
      structuredData = await parseCVWithOllama(extractedText)
    } catch (ollamaError: any) {
      console.warn('Ollama failure, profile text saved as raw:', ollamaError.message)
      // Fallback: save raw text if Ollama fails
      await prisma.profile.update({
        where: { userId: decoded.userId },
        data: {
          summary: "Ollama offline. Favor preencher o perfil.",
          cvParsedAt: new Date()
        }
      })
      
      return NextResponse.json({
        success: true,
        message: 'Currículo extraído, mas estruturação de IA falhou (Ollama offline).',
        rawText: extractedText
      })
    }

    // 4. Persistence into MongoDB
    await prisma.profile.update({
      where: { userId: decoded.userId },
      data: {
        summary: structuredData.summary,
        skills: structuredData.skills,
        experiences: structuredData.experiences as any, 
        education: structuredData.education as any,
        cvParsedAt: new Date()
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Currículo processado e salvo com sucesso!',
      data: {
        file_path: decoded.userId,
        extracted_data: structuredData,
        status: 'completed'
      }
    })

  } catch (error: any) {
    console.error('CV Upload API Error:', error)
    return NextResponse.json({
      success: false,
      message: 'Erro interno ao processar currículo',
      error: error.message
    }, { status: 500 })
  }
}
