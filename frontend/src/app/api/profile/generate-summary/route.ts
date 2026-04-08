import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt'

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization')
    const token = extractTokenFromHeader(authHeader)
    if (!token) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }
    
    try {
      verifyToken(token)
    } catch (e) {
      return NextResponse.json({ success: false, message: 'Invalid token' }, { status: 401 })
    }

    const { name, professionalTitle, skills, experiences } = await request.json()

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ 
        success: false, 
        message: 'AI Service currently unavailable (GEMINI_API_KEY missing)' 
      }, { status: 500 })
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = `
      You are an expert career consultant. Based on the following information, create a professional summary for a CV.
      The summary should be concise (3-4 sentences), impactful, and highlight key strengths.
      
      Name: ${name || 'N/A'}
      Professional Title: ${professionalTitle || 'N/A'}
      Skills: ${skills ? skills.join(', ') : 'N/A'}
      Experiences: ${experiences ? JSON.stringify(experiences) : 'N/A'}
      
      Write ONLY the summary text in English. Do not include any other text or formatting.
    `

    const result = await model.generateContent(prompt)
    const response = await result.response
    const summary = response.text().trim()

    return NextResponse.json({
      success: true,
      summary
    })

  } catch (error: any) {
    console.error('Generate summary error:', error)
    return NextResponse.json({
      success: false,
      message: 'Error generating summary',
      error: error.message
    }, { status: 500 })
  }
}
