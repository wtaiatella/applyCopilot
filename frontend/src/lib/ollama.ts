export interface CVParseResponse {
  summary: string
  skills: string[]
  experiences: Array<{
    company: string
    position: string
    startDate: string
    endDate: string | null
    description: string
    achievements: string[]
    technologies: string[]
  }>
  education: Array<{
    institution: string
    degree: string
    field: string
    startDate: string
    endDate: string | null
    description: string
  }>
}

export interface JobParseResponse {
  title: string
  company: string
  location: string
  jobType: string
  workModality: string
  salary: string
  description: string
  requirements: string[]
  responsibilities: string[]
  benefits: string[]
}

export async function parseCVWithOllama(cvText: string): Promise<CVParseResponse> {
  const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
  const MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b'

  const prompt = `
    Analyze the resume text below and return ONLY a structured JSON object with the following keys. 
    IMPORTANT: Extract the information EXACTLY as it appears in the text. Do NOT summarize, rephrase, or improve the text. Maintain the original language and wording.

    Keys:
    - summary: the professional summary section prefixing the experience.
    - skills: an array of strings with identified technical and soft skills.
    - experiences: an array of objects, each with the keys:
        - company: name of the company.
        - position: job title held.
        - startDate: start date of the position.
        - endDate: end date or null if currently employed.
        - description: the original responsibility/description text.
        - achievements: an array of the original bullet points found in this experience.
        - technologies: an array of technologies/tools explicitly mentioned.
    - education: an array of objects, each with the keys:
        - institution: name of the educational institution.
        - degree: degree obtained.
        - field: field of study.
        - startDate: start date.
        - endDate: end date.
        - description: original additional details if any.

    Resume Content:
    ${cvText}

    Return ONLY the valid JSON object.
  `

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        format: 'json'
      })
    })

    if (!response.ok) {
      throw new Error('Failed to communicate with Ollama server')
    }

    const data = await response.json()
    return JSON.parse(data.response) as CVParseResponse
  } catch (error: any) {
    console.error('Ollama CV Parse Error:', error)
    throw new Error('Ollama CV parsing failed: ' + error.message)
  }
}

export async function parseJobWithOllama(jobMarkdown: string): Promise<JobParseResponse> {
  const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
  const MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b'

  const prompt = `
    Analyze the job posting text below (in Markdown) and return ONLY a structured JSON object with the following keys:
    - title: job title.
    - company: name of the company.
    - location: location (city/country/remote).
    - jobType: type (Full-time, Contract, etc).
    - workModality: modality (Remote, Hybrid, On-site).
    - salary: salary range if mentioned, otherwise "Not informed".
    - description: summary of the job and company.
    - requirements: an array of strings with requirements and qualifications.
    - responsibilities: an array of strings with main responsibilities.
    - benefits: an array of strings with benefits.

    Job Content:
    ${jobMarkdown}

    Return ONLY the valid JSON object.
  `

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        format: 'json'
      })
    })

    if (!response.ok) {
      throw new Error('Failed to communicate with Ollama server')
    }

    const data = await response.json()
    return JSON.parse(data.response) as JobParseResponse
  } catch (error: any) {
    console.error('Ollama Job Parse Error:', error)
    throw new Error('Ollama job parsing failed: ' + error.message)
  }
}
