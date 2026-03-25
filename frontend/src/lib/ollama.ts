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
    Analise o texto do currículo abaixo e retorne APENAS um objeto JSON estruturado com as seguintes chaves:
    - summary: um resumo profissional de 2-3 frases.
    - skills: um array de strings com as habilidades técnicas identificadas.
    - experiences: um array de objetos, cada um com as chaves:
        - company: nome da empresa.
        - position: cargo ocupado.
        - startDate: data de início.
        - endDate: data de término ou null se for o emprego atual.
        - description: breve descrição das responsabilidades.
        - achievements: um array de conquistas em bullet points.
        - technologies: um array de tecnologias usadas nessa experiência.
    - education: um array de objetos, cada um com as chaves:
        - institution: nome da instituição.
        - degree: grau (Ex: Bacharelado).
        - field: curso (Ex: Ciência da Computação).
        - startDate: data de início.
        - endDate: data de término.
        - description: descrição adicional se houver.

    Currículo:
    ${cvText}

    Responda APENAS com o JSON válido.
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
      throw new Error('Falha ao comunicar com Ollama')
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
    Analise o texto da vaga de emprego abaixo (em Markdown) e retorne APENAS um objeto JSON estruturado com as seguintes chaves:
    - title: título da vaga.
    - company: nome da empresa.
    - location: localização (cidade/país).
    - jobType: tipo (Full-time, Contract, etc).
    - workModality: modalidade (Remote, Hybrid, On-site).
    - salary: faixa salarial se mencionada, senão "Não informado".
    - description: descrição resumida das atividades.
    - requirements: um array de strings com os requisitos e qualificações.
    - responsibilities: um array de strings com as responsabilidades.
    - benefits: um array de strings com os benefícios.

    Vaga:
    ${jobMarkdown}

    Responda APENAS com o JSON válido.
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
      throw new Error('Falha ao comunicar com Ollama')
    }

    const data = await response.json()
    return JSON.parse(data.response) as JobParseResponse
  } catch (error: any) {
    console.error('Ollama Job Parse Error:', error)
    throw new Error('Ollama job parsing failed: ' + error.message)
  }
}
