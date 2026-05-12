import { Ollama } from 'ollama'

export interface OllamaConfig {
  baseUrl: string
  model: string
  timeout?: number
}

export interface OllamaResponse {
  model: string
  created_at: string
  response: string
  done: boolean
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

export interface StructuredDataRequest {
  prompt: string
  model?: string
  format?: 'json'
  options?: {
    temperature?: number
    top_p?: number
    num_predict?: number
  }
}

export class OllamaClient {
  private client: Ollama
  private config: OllamaConfig

  constructor(config: Partial<OllamaConfig> = {}) {
    // Modelo é definido no container Docker via OLLAMA_MODEL
    // Não usar fallback - garantir que a variável esteja configurada
    const model = process.env.OLLAMA_MODEL
    if (!model) {
      throw new Error('OLLAMA_MODEL environment variable is required. Set it in .env or docker-compose.yml')
    }

    this.config = {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model,
      timeout: 300000, // 5 minutos para processamento de CV
      ...config
    }

    this.client = new Ollama({
      host: this.config.baseUrl
    })
  }

  /**
   * Check if Ollama service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.client.list()
      return true
    } catch (error) {
      console.error('Ollama service not available:', error)
      return false
    }
  }

  /**
   * Get list of available models
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.client.list()
      return response.models.map(model => model.name)
    } catch (error) {
      console.error('Failed to get Ollama models:', error)
      return []
    }
  }

  /**
   * Pull a model if not available
   */
  async pullModel(modelName: string): Promise<void> {
    try {
      console.log(`Pulling Ollama model: ${modelName}`)
      await this.client.pull({ model: modelName })
      console.log(`Successfully pulled model: ${modelName}`)
    } catch (error) {
      console.error(`Failed to pull model ${modelName}:`, error)
      throw error
    }
  }

  /**
   * Generate text completion
   */
  async generateCompletion(prompt: string, options?: StructuredDataRequest['options']): Promise<string> {
    try {
      const response = await this.client.generate({
        model: this.config.model,
        prompt,
        options: {
          temperature: options?.temperature || 0.7,
          top_p: options?.top_p || 0.9,
          num_predict: options?.num_predict || 1000,
          ...options
        }
      })

      return response.response
    } catch (error) {
      console.error('Ollama generation failed:', error)
      throw error
    }
  }

  /**
   * Generate structured JSON data
   */
  async generateStructuredData<T>(
    prompt: string,
    schema?: Record<string, unknown>,
    options?: StructuredDataRequest['options']
  ): Promise<T> {
    try {
      const fullPrompt = this.buildStructuredPrompt(prompt, schema)
      
      const response = await this.client.generate({
        model: this.config.model,
        prompt: fullPrompt,
        format: 'json',
        options: {
          temperature: options?.temperature || 0.1, // Lower temperature for structured data
          top_p: options?.top_p || 0.9,
          num_predict: options?.num_predict || 2000,
          ...options
        }
      })

      // Parse JSON response
      const result = JSON.parse(response.response) as T
      return result
    } catch (error) {
      console.error('Ollama structured generation failed:', error)
      throw error
    }
  }

  /**
   * Build prompt for structured data generation
   */
  private buildStructuredPrompt(prompt: string, schema?: Record<string, unknown>): string {
    let fullPrompt = `You are a specialized AI that extracts structured data and returns it in valid JSON format.
    
${prompt}

`

    if (schema) {
      fullPrompt += `CRITICAL: You must respond ONLY with a JSON object that matches the structure below. 
Do NOT include the schema definitions, types, or descriptions in your response. 
Return ONLY the actual values for each key.

Example of expected format:
{
  "key1": "value1",
  "key2": ["item1", "item2"]
}

Target Structure:
${JSON.stringify(schema, null, 2)}

`
    }

    fullPrompt += `Final Instructions:
- Respond ONLY with valid JSON
- No conversational text, no explanations, no markdown blocks (unless requested)
- Ensure all required keys are present with their discovered values.`

    return fullPrompt
  }

  /**
   * Extract CV data from text
   */
  async extractCVData(cvText: string): Promise<{
    basicData: {
      firstName?: string
      lastName?: string
      email?: string
      phone?: string
      location?: string
      website?: string
      github?: string
    }
    experiences: Array<{
      company: string
      position: string
      startDate: string
      endDate?: string
      current: boolean
      bulletPoints: string[]
    }>
    education: Array<{
      institution: string
      degree: string
      field: string
      startDate: string
      endDate?: string
      current: boolean
    }>
    projects: Array<{
      name: string
      bulletPoints: string[]
      technologies: string[]
    }>
    skills: Array<{
      name: string
      category: string
      proficiency: string
    }>
  }> {
    const prompt = `Extract structured data from this CV/resume text:

${cvText}

Return ONLY a JSON object with the extracted data in this exact format:
{
  "basicData": {
    "firstName": "extracted first name",
    "lastName": "extracted last name",
    "email": "extracted email",
    "phone": "extracted phone",
    "location": "extracted location",
    "website": "extracted portfolio/website URL",
    "github": "extracted github profile URL"
  },
  "experiences": [
    {
      "company": "company name",
      "position": "job title",
      "startDate": "start date (e.g., Sep 2024)",
      "endDate": "end date or 'Present'",
      "current": true/false,
      "bulletPoints": ["description line 1", "description line 2"]
    }
  ],
  "education": [
    {
      "institution": "institution name",
      "degree": "degree name",
      "field": "field of study",
      "startDate": "start date",
      "endDate": "end date or null",
      "current": true/false
    }
  ],
  "projects": [
    {
      "name": "project name",
      "bulletPoints": ["description"],
      "technologies": ["tech1", "tech2"]
    }
  ],
  "skills": [
    {
      "name": "skill name",
      "category": "category (e.g., Frontend, Backend, DevOps, Database, Cloud)",
      "proficiency": "level (e.g., Beginner, Intermediate, Advanced)"
    }
  ]
}

IMPORTANT:
- If a person is currently working somewhere, set "endDate" to "Present" and "current" to true.
- Extract portfolio/personal website URL into "website".
- Extract GitHub profile URL into "github".
- Extract skills from the Summary section and experience descriptions if no separate skills section exists.
- Return ONLY the JSON object with actual data.`

    const schema = {
      type: "object",
      properties: {
        basicData: {
          type: "object",
          properties: {
            firstName: { type: "string" },
            lastName: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            location: { type: "string" },
            website: { type: "string" },
            github: { type: "string" }
          }
        },
        experiences: {
          type: "array",
          items: {
            type: "object",
            properties: {
              company: { type: "string" },
              position: { type: "string" },
              startDate: { type: "string" },
              endDate: { type: "string" },
              current: { type: "boolean" },
              bulletPoints: { type: "array", items: { type: "string" } }
            },
            required: ["company", "position", "startDate", "current", "bulletPoints"]
          }
        },
        education: {
          type: "array",
          items: {
            type: "object",
            properties: {
              institution: { type: "string" },
              degree: { type: "string" },
              field: { type: "string" },
              startDate: { type: "string" },
              endDate: { type: "string" },
              current: { type: "boolean" }
            },
            required: ["institution", "degree", "startDate", "current"]
          }
        },
        projects: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              bulletPoints: { type: "array", items: { type: "string" } },
              technologies: { type: "array", items: { type: "string" } }
            },
            required: ["name", "bulletPoints", "technologies"]
          }
        },
        skills: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              category: { type: "string" },
              proficiency: { type: "string" }
            },
            required: ["name", "category", "proficiency"]
          }
        }
      },
      required: ["basicData", "experiences", "education", "projects", "skills"]
    }

    return this.generateStructuredData(prompt, schema)
  }

  /**
   * Parse job listing data
   */
  async parseJobListing(jobText: string): Promise<{
    title: string
    company: string
    location?: string
    remote: boolean
    type: string
    description: string
    requirements: string[]
    responsibilities: string[]
    technologies: string[]
    salary?: {
      min?: number
      max?: number
      currency: string
    }
  }> {
    const prompt = `Parse structured data from this job listing:

${jobText}

Extract the following information:
1. Job title and company name
2. Location and remote work status
3. Employment type (full-time, part-time, contract, etc.)
4. Job description
5. Requirements and responsibilities
6. Required technologies/skills
7. Salary information if available`

    const schema = {
      type: "object",
      properties: {
        title: { type: "string" },
        company: { type: "string" },
        location: { type: "string" },
        remote: { type: "boolean" },
        type: { type: "string" },
        description: { type: "string" },
        requirements: { type: "array", items: { type: "string" } },
        responsibilities: { type: "array", items: { type: "string" } },
        technologies: { type: "array", items: { type: "string" } },
        salary: {
          type: "object",
          properties: {
            min: { type: "number" },
            max: { type: "number" },
            currency: { type: "string" }
          }
        }
      },
      required: ["title", "company", "remote", "type", "description", "requirements", "responsibilities", "technologies"]
    }

    return this.generateStructuredData(prompt, schema)
  }

  /**
   * Generate compatibility analysis
   */
  async analyzeCompatibility(profileData: unknown, jobData: unknown): Promise<{
    overallScore: number
    skillsMatch: number
    experienceMatch: number
    educationMatch: number
    strengths: string[]
    improvementAreas: string[]
    recommendations: string[]
  }> {
    const prompt = `Analyze compatibility between a candidate profile and a job listing:

Candidate Profile:
${JSON.stringify(profileData, null, 2)}

Job Listing:
${JSON.stringify(jobData, null, 2)}

Provide a detailed compatibility analysis including:
1. Overall compatibility score (0-100)
2. Skills, experience, and education match scores
3. Candidate's strengths for this role
4. Areas for improvement
5. Specific recommendations for the candidate`

    const schema = {
      type: "object",
      properties: {
        overallScore: { type: "number", minimum: 0, maximum: 100 },
        skillsMatch: { type: "number", minimum: 0, maximum: 100 },
        experienceMatch: { type: "number", minimum: 0, maximum: 100 },
        educationMatch: { type: "number", minimum: 0, maximum: 100 },
        strengths: { type: "array", items: { type: "string" } },
        improvementAreas: { type: "array", items: { type: "string" } },
        recommendations: { type: "array", items: { type: "string" } }
      },
      required: ["overallScore", "skillsMatch", "experienceMatch", "educationMatch", "strengths", "improvementAreas", "recommendations"]
    }

    return this.generateStructuredData(prompt, schema)
  }
}

// Singleton instance
export const ollamaClient = new OllamaClient()
