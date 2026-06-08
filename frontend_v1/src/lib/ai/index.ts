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
import { loggers } from '@/lib/logging';
import { OllamaClient } from './ollama';
import { GeminiClient } from './gemini';
import type { CoverLetterRequest, CVSuggestionRequest, JobCompatibilityRequest } from './gemini';

export const ollamaClient = new OllamaClient();
export const geminiClient = new GeminiClient();

// Unified AI service - automatic routing between Ollama and Gemini based on task
export class AIService {
  static async identifyCVSections(cvText: string) {
    return ollamaClient.identifyCVSections(cvText);
  }

  /**
   * Parse CV and extract structured data
   * Uses Ollama (local) - cost efficient
   */
  static async parseCV(cvText: string) {
    return ollamaClient.extractCVData(cvText);
  }

  static async extractBasicData(cvText: string) {
    return ollamaClient.extractBasicData(cvText);
  }

  static async extractExperiences(cvText: string) {
    return ollamaClient.extractExperiences(cvText);
  }

  static async extractProjects(cvText: string) {
    return ollamaClient.extractProjects(cvText);
  }

  static async extractEducationSkills(cvText: string) {
    return ollamaClient.extractEducationSkills(cvText);
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
   * Generate/Refine professional summary
   * Uses Gemini (premium) with Ollama fallback
   */
  static async generateProfileSummary(profileData: any, instructions: string, existingContent?: string) {
    if (geminiClient.isAvailable()) {
      try {
        const result = await geminiClient.generateProfileSummary(profileData, instructions, existingContent);
        return {
          ...result,
          isAIGenerated: true,
        };
      } catch (error) {
        loggers.ai.warn('Gemini summary generation failed, falling back to Ollama', { error: (error as Error).message });
      }
    }

    // Fallback to Ollama
    const modePrompt = existingContent
      ? `You are asked to refine/revise an existing professional summary.\nExisting Summary: "${existingContent}"`
      : `You are asked to generate a new professional introduction/summary of 3 to 5 lines maximum.`;

    const experiencesText = (profileData.experiences || [])
      .map((exp: any) => {
        const dateRange = (exp.startDate || '') + ' to ' + (exp.endDate || 'Present');
        const desc = exp.bulletPoints ? exp.bulletPoints.join(', ') : (exp.description || '');
        return '- ' + exp.position + ' at ' + exp.company + ' (' + dateRange + '): ' + desc;
      })
      .join('\n');

    const educationText = (profileData.education || [])
      .map((edu: any) => '- ' + edu.degree + ' in ' + (edu.field || '') + ' from ' + edu.institution)
      .join('\n');

    const projectsText = (profileData.projects || [])
      .map((proj: any) => {
        const desc = proj.bulletPoints ? proj.bulletPoints.join(', ') : (proj.description || '');
        return '- ' + proj.name + ': ' + desc;
      })
      .join('\n');

    const skillsText = (profileData.skills || [])
      .map((s: any) => '- ' + s.name + ' (' + (s.category || 'TECHNICAL') + ')')
      .join('\n');

    const profileText = `
Candidate Profile Details:
- Name: ${profileData.firstName || ''} ${profileData.lastName || ''}
- Job Title: ${profileData.title || ''}
- Experiences:
${experiencesText}
- Education:
${educationText}
- Projects:
${projectsText}
- Skills:
${skillsText}
`;

    const prompt = `${modePrompt}

Use the following candidate profile details as context:
${profileText}

USER GUIDELINES (MANDATORY):
You MUST strictly follow these instructions from the user to generate/refine the summary:
"${instructions}"

CRITICAL INSTRUCTIONS:
1. Generate the summary in English.
2. The summary MUST be professional, high impact, and strictly follow the USER GUIDELINES listed above (e.g., if they request bullet points or a specific list structure, format it accordingly).
3. Write the summary in the first person (e.g. "I am...", "My expertise is...") or starting directly with active verbs (e.g. "Experienced full-stack developer specialized in..."). DO NOT write in the third person (e.g. "John is a...", "He has...").
4. In the "content" field of the JSON response, you are requested and fully authorized to use markdown formatting (such as bullet points using '-' or '*' for lists, or bold text) to highlight achievements and qualities if requested by the user.
5. Provide a JSON response with two keys:
   - "content": The generated professional summary.
   - "title": A short, catchy title/headline for this summary version (e.g. "Lead React Engineer", "Full Stack Generalist").`;

    try {
      const response = await ollamaClient.generateStructuredData<{ content: string; title: string }>(
        prompt,
        {
          type: "object",
          properties: {
            content: { type: "string" },
            title: { type: "string" }
          },
          required: ["content", "title"]
        }
      );
      return {
        content: response.content || '',
        title: response.title || 'Suggested Summary',
        isAIGenerated: true,
        tokensUsed: 0,
      };
    } catch (error) {
      loggers.ai.error('Ollama summary generation failed', { error: (error as Error).message });
      throw error;
    }
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
