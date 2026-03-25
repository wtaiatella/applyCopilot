import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * Deep Analysis of job match using Google Gemini LLM.
 * This is intended for short-listed jobs where precision is needed.
 */
export async function deepAnalyzeJobWithGemini(profile: any, job: any) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Chave de API do Gemini (GEMINI_API_KEY) não configurada no ambiente.')
  }
  
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-1.5-flash', // Gemini Flash is fast and economical for this task
    generationConfig: {
      responseMimeType: 'application/json' // Request explicit JSON response
    }
  })

  // Prepare profile and job summaries to reduce token usage
  const profileSummary = {
    summary: profile.summary,
    skills: profile.skills,
    experiences: (profile.experiences as any[] || []).map(e => ({
      position: e.position,
      company: e.company,
      description: e.description,
      technologies: e.technologies
    }))
  }

  const jobSummary = {
    title: job.title,
    company: job.company,
    description: job.description,
    requirements: job.requirements,
    responsibilities: job.responsibilities
  }

  const prompt = `
    Analise a compatibilidade entre o candidato e a vaga de emprego descrita.
    Retorne um objeto JSON estritamente com este formato:
    {
      "matchScore": <número de 0 a 100>,
      "strengths": [<strings de pontos positivos para esta vaga>],
      "gaps": [<strings de gaps técnicos ou requisitos não atendidos>],
      "justification": "< explicação clara da nota atribuída >",
      "recommendations": "< como o candidato deve ajustar o discurso para esta vaga >"
    }

    --- PERFIL DO CANDIDATO ---
    ${JSON.stringify(profileSummary)}

    --- DESCRIÇÃO DA VAGA ---
    ${JSON.stringify(jobSummary)}

    Responda apenas com o JSON.
  `

  try {
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text().trim()
    
    // Some safety cleaning if needed, though responseMimeType: 'application/json' should handle it
    const cleanJson = text.replace(/```json|```/g, '')
    return JSON.parse(cleanJson)
  } catch (error: any) {
    console.error('Gemini Analysis Failed:', error.message)
    throw new Error('Deep analysis error: ' + error.message)
  }
}
