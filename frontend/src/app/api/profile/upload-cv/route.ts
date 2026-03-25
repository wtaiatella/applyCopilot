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
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }
    
    let decoded;
    try {
      decoded = verifyToken(token)
    } catch (e) {
      return NextResponse.json({ success: false, message: 'Invalid token' }, { status: 401 })
    }

    // 2. Parse file from FormData
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) {
      return NextResponse.json({ success: false, message: 'File not uploaded' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    let extractedText = ''
    if (file.type === 'application/pdf') {
      try {
        const data = await pdf(buffer)
        extractedText = data.text
      } catch (pdfError: any) {
        throw new Error('Failed to extract text from PDF: ' + pdfError.message)
      }
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      try {
        const result = await mammoth.extractRawText({ buffer })
        extractedText = result.value
      } catch (mammothError: any) {
        throw new Error('Failed to extract text from DOCX: ' + mammothError.message)
      }
    } else if (file.type === 'text/plain') {
      extractedText = buffer.toString('utf-8')
    } else {
      return NextResponse.json({ success: false, message: 'Unsupported file type' }, { status: 400 })
    }

    if (!extractedText.trim()) {
      return NextResponse.json({ success: false, message: 'Could not extract text from file' }, { status: 422 })
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
          summary: "Ollama offline. Please fill in your profile.",
          cvParsedAt: new Date()
        }
      })
      
      return NextResponse.json({
        success: true,
        message: 'CV extracted, but AI structuring failed (Ollama offline).',
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
      message: 'CV processed and saved successfully!',
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
      message: 'Internal error while processing CV',
      error: error.message
    }, { status: 500 })
  }
}
