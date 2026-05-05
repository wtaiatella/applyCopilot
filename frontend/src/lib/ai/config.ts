export interface AIConfig {
  ollama: {
    baseUrl: string
    model: string
    timeout: number
  }
  tensorflow: {
    modelPath?: string
    useGPU: boolean
  }
  gemini: {
    apiKey?: string
    model: string
  }
}

export const defaultAIConfig: AIConfig = {
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    // Modelo definido no Docker - sem fallback para garantir configuração explícita
    model: process.env.OLLAMA_MODEL || '',
    timeout: 300000 // 5 minutos para processamento de CV
  },
  tensorflow: {
    useGPU: false // Set to true if GPU is available
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-1.5-flash'
  }
}

export const aiConfig = defaultAIConfig
