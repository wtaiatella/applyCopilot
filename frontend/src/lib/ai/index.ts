// AI module - Unified AI service clients for ApplyCopilot
// Based on research.md: "Decision: Use Ollama for local tasks, Gemini for premium"

// Configuration
export { aiConfig, defaultAIConfig } from './config';
export type { AIConfig } from './config';

// Ollama client (local AI for CV parsing, job extraction, basic matching)
export { OllamaClient } from './ollama';
export type {
  OllamaConfig,
  OllamaResponse,
  StructuredDataRequest,
} from './ollama';

// Gemini client (premium AI for cover letters, CV suggestions, nuanced analysis)
export { GeminiClient } from './gemini';
export type {
  GeminiConfig,
  CoverLetterRequest,
  CVSuggestionRequest,
  JobCompatibilityRequest,
} from './gemini';

// TensorFlow matcher (local ML for job compatibility scoring)
export { JobMatcher, jobMatcher } from './tensorflow-matcher';
export type { JobCompatibilityVector, CompatibilityScore } from './tensorflow-matcher';

// Re-export singletons
import { OllamaClient } from './ollama';
import { GeminiClient } from './gemini';
import type { CoverLetterRequest, CVSuggestionRequest, JobCompatibilityRequest } from './gemini';

export const ollamaClient = new OllamaClient();
export const geminiClient = new GeminiClient();

// Unified AI service - automatic routing between Ollama and Gemini based on task
export class AIService {
  /**
   * Parse CV and extract structured data
   * Uses Ollama (local) - cost efficient
   */
  static async parseCV(cvText: string) {
    return ollamaClient.extractCVData(cvText);
  }

  /**
   * Parse job listing and extract structured data
   * Uses Ollama (local) - cost efficient
   */
  static async parseJobListing(jobText: string) {
    return ollamaClient.parseJobListing(jobText);
  }

  /**
   * Basic compatibility analysis
   * Uses Ollama (local) - cost efficient
   */
  static async analyzeCompatibilityBasic(profileData: unknown, jobData: unknown) {
    return ollamaClient.analyzeCompatibility(profileData, jobData);
  }

  /**
   * Generate cover letter
   * Uses Gemini (premium) - high-quality generation
   */
  static async generateCoverLetter(request: CoverLetterRequest) {
    if (!geminiClient.isAvailable()) {
      // Fallback to Ollama if Gemini not configured
      throw new Error('Premium AI not available. Please configure Gemini API key.');
    }
    return geminiClient.generateCoverLetter(request);
  }

  /**
   * Generate CV suggestions
   * Uses Gemini (premium) - nuanced suggestions
   */
  static async generateCVSuggestions(request: CVSuggestionRequest) {
    if (!geminiClient.isAvailable()) {
      throw new Error('Premium AI not available. Please configure Gemini API key.');
    }
    return geminiClient.generateCVSuggestions(request);
  }

  /**
   * Detailed job compatibility analysis
   * Uses Gemini (premium) - comprehensive insights
   */
  static async analyzeCompatibilityDetailed(request: JobCompatibilityRequest) {
    if (!geminiClient.isAvailable()) {
      throw new Error('Premium AI not available. Please configure Gemini API key.');
    }
    return geminiClient.analyzeJobCompatibility(request);
  }

  /**
   * Check service availability
   */
  static async checkAvailability() {
    const [ollamaAvailable, geminiAvailable] = await Promise.all([
      ollamaClient.isAvailable(),
      geminiClient.isAvailable(),
    ]);

    return {
      ollama: ollamaAvailable,
      gemini: geminiAvailable,
      tensorflow: true, // Always available (local)
    };
  }
}
