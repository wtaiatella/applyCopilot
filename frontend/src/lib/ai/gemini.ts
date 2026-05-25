// Gemini AI client for high-value content generation
// Uses Gemini 1.5 Flash for cover letters, CV suggestions, and nuanced matching
import { GoogleGenAI, Type } from '@google/genai';
import { aiConfig } from './config';
import { loggers } from '@/lib/logging';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
}

export interface CoverLetterRequest {
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  candidateProfile: {
    firstName: string;
    lastName: string;
    experiences: Array<{
      position: string;
      company: string;
      highlights: string[];
    }>;
    skills: string[];
    summary?: string;
  };
  tone: 'PROFESSIONAL' | 'FRIENDLY' | 'ENTHUSIASTIC' | 'FORMAL';
  highlightExperience: boolean;
  customInstructions?: string;
}

export interface CVSuggestionRequest {
  profileData: {
    summary?: string;
    experiences: Array<{
      position: string;
      company: string;
      bulletPoints: string[];
    }>;
    skills: string[];
    projects?: Array<{
      name: string;
      description: string;
    }>;
  };
  targetJobTitle?: string;
  targetIndustry?: string;
}

export interface JobCompatibilityRequest {
  profile: {
    summary: string;
    experiences: Array<{
      position: string;
      company: string;
      duration: string;
      highlights: string[];
    }>;
    skills: string[];
    yearsOfExperience: number;
  };
  job: {
    title: string;
    description: string;
    requirements: string[];
    preferredSkills: string[];
    minExperience?: number;
    location: string;
    remote: boolean;
  };
}

export class GeminiClient {
  private client: GoogleGenAI;
  private config: GeminiConfig;

  constructor(config?: Partial<GeminiConfig>) {
    this.config = {
      apiKey: config?.apiKey || aiConfig.gemini.apiKey || '',
      model: config?.model || aiConfig.gemini.model || 'gemini-1.5-flash',
      maxOutputTokens: config?.maxOutputTokens || 2048,
      temperature: config?.temperature || 0.7,
      topP: config?.topP || 0.9,
      topK: config?.topK || 40,
    };

    if (!this.config.apiKey) {
      loggers.ai.warn('Gemini API key not configured');
    }

    this.client = new GoogleGenAI({ apiKey: this.config.apiKey });
  }

  /**
   * Check if Gemini service is available
   */
  isAvailable(): boolean {
    return !!this.config.apiKey;
  }

  /**
   * Generate a personalized cover letter
   */
  async generateCoverLetter(request: CoverLetterRequest): Promise<{
    content: string;
    highlights: string[];
    tokensUsed: number;
  }> {
    if (!this.isAvailable()) {
      throw new Error('Gemini API not configured');
    }

    const startTime = Date.now();

    const prompt = this.buildCoverLetterPrompt(request);

    try {
      const response = await this.client.models.generateContent({
        model: this.config.model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          maxOutputTokens: this.config.maxOutputTokens,
          temperature: this.config.temperature,
          topP: this.config.topP,
          topK: this.config.topK,
        },
      });

      const content = response.text || '';
      const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

      const duration = Date.now() - startTime;
      loggers.ai.info('Cover letter generated', {
        jobTitle: request.jobTitle,
        company: request.companyName,
        tone: request.tone,
        tokensUsed,
        duration: `${duration}ms`,
      });

      return {
        content,
        highlights: this.extractHighlights(content),
        tokensUsed,
      };
    } catch (error) {
      loggers.ai.error('Cover letter generation failed', {
        error: (error as Error).message,
        jobTitle: request.jobTitle,
      });
      throw error;
    }
  }

  /**
   * Generate CV improvement suggestions
   */
  async generateCVSuggestions(request: CVSuggestionRequest): Promise<{
    suggestions: Array<{
      section: 'SUMMARY' | 'EXPERIENCE' | 'SKILLS' | 'PROJECTS';
      original: string;
      suggestion: string;
      reason: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
    tokensUsed: number;
  }> {
    if (!this.isAvailable()) {
      throw new Error('Gemini API not configured');
    }

    const startTime = Date.now();

    const prompt = this.buildCVSuggestionsPrompt(request);

    try {
      const response = await this.client.models.generateContent({
        model: this.config.model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    section: {
                      type: Type.STRING,
                      enum: ['SUMMARY', 'EXPERIENCE', 'SKILLS', 'PROJECTS'],
                    },
                    original: { type: Type.STRING },
                    suggestion: { type: Type.STRING },
                    reason: { type: Type.STRING },
                    priority: {
                      type: Type.STRING,
                      enum: ['HIGH', 'MEDIUM', 'LOW'],
                    },
                  },
                  required: ['section', 'original', 'suggestion', 'reason', 'priority'],
                },
              },
            },
            required: ['suggestions'],
          },
          maxOutputTokens: this.config.maxOutputTokens,
          temperature: 0.3, // Lower temperature for structured suggestions
        },
      });

      const result = JSON.parse(response.text || '{}');
      const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

      const duration = Date.now() - startTime;
      loggers.ai.info('CV suggestions generated', {
        targetJob: request.targetJobTitle,
        suggestionsCount: result.suggestions?.length || 0,
        tokensUsed,
        duration: `${duration}ms`,
      });

      return {
        suggestions: result.suggestions || [],
        tokensUsed,
      };
    } catch (error) {
      loggers.ai.error('CV suggestions generation failed', {
        error: (error as Error).message,
        targetJob: request.targetJobTitle,
      });
      throw error;
    }
  }

  /**
   * Analyze job compatibility with detailed insights
   */
  async analyzeJobCompatibility(request: JobCompatibilityRequest): Promise<{
    overallScore: number;
    skillMatch: {
      score: number;
      matched: string[];
      missing: string[];
      recommendations: string[];
    };
    experienceMatch: {
      score: number;
      yearsRequired?: number;
      yearsUserHas: number;
      analysis: string;
    };
    summary: string;
    tokensUsed: number;
  }> {
    if (!this.isAvailable()) {
      throw new Error('Gemini API not configured');
    }

    const startTime = Date.now();

    const prompt = this.buildCompatibilityPrompt(request);

    try {
      const response = await this.client.models.generateContent({
        model: this.config.model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallScore: { type: Type.INTEGER },
              skillMatch: {
                type: Type.OBJECT,
                properties: {
                  score: { type: Type.INTEGER },
                  matched: { type: Type.ARRAY, items: { type: Type.STRING } },
                  missing: { type: Type.ARRAY, items: { type: Type.STRING } },
                  recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
              },
              experienceMatch: {
                type: Type.OBJECT,
                properties: {
                  score: { type: Type.INTEGER },
                  yearsRequired: { type: Type.INTEGER },
                  yearsUserHas: { type: Type.INTEGER },
                  analysis: { type: Type.STRING },
                },
              },
              summary: { type: Type.STRING },
            },
            required: ['overallScore', 'skillMatch', 'experienceMatch', 'summary'],
          },
          maxOutputTokens: this.config.maxOutputTokens,
          temperature: 0.2,
        },
      });

      const result = JSON.parse(response.text || '{}');
      const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

      const duration = Date.now() - startTime;
      loggers.ai.info('Job compatibility analyzed', {
        jobTitle: request.job.title,
        overallScore: result.overallScore,
        tokensUsed,
        duration: `${duration}ms`,
      });

      return {
        ...result,
        tokensUsed,
      };
    } catch (error) {
      loggers.ai.error('Compatibility analysis failed', {
        error: (error as Error).message,
        jobTitle: request.job.title,
      });
      throw error;
    }
  }

  /**
   * Generate a versioned professional summary with AI
   */
  async generateProfileSummary(
    profileData: any,
    instructions: string,
    existingContent?: string
  ): Promise<{
    content: string;
    title: string;
    tokensUsed: number;
  }> {
    if (!this.isAvailable()) {
      throw new Error('Gemini API not configured');
    }

    const startTime = Date.now();

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
   - "title": A short, catchy title/headline for this summary version (e.g. "Lead React Engineer", "Full Stack Generalist").

Response format: ONLY valid JSON without markdown block or conversational text.`;

    try {
      const response = await this.client.models.generateContent({
        model: this.config.model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              content: { type: Type.STRING },
              title: { type: Type.STRING },
            },
            required: ['content', 'title'],
          },
          maxOutputTokens: this.config.maxOutputTokens,
          temperature: 0.7,
        },
      });

      const result = JSON.parse(response.text || '{}');
      const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

      const duration = Date.now() - startTime;
      loggers.ai.info('Profile summary generated with Gemini', {
        tokensUsed,
        duration: `${duration}ms`,
      });

      return {
        content: result.content || '',
        title: result.title || 'Suggested Summary',
        tokensUsed,
      };
    } catch (error) {
      loggers.ai.error('Gemini profile summary generation failed', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Build cover letter generation prompt
   */
  private buildCoverLetterPrompt(request: CoverLetterRequest): string {
    const toneInstructions = {
      PROFESSIONAL: 'professional and confident',
      FRIENDLY: 'warm and approachable',
      ENTHUSIASTIC: 'energetic and passionate',
      FORMAL: 'formal and traditional',
    };

    return `Generate a compelling cover letter for the following job application.

Job Details:
- Title: ${request.jobTitle}
- Company: ${request.companyName}
- Description: ${request.jobDescription}

Candidate Profile:
- Name: ${request.candidateProfile.firstName} ${request.candidateProfile.lastName}
- Summary: ${request.candidateProfile.summary || 'Not provided'}

Work Experience:
${request.candidateProfile.experiences.map(exp =>
  `- ${exp.position} at ${exp.company}:\n  ${exp.highlights.join('\n  ')}`
).join('\n')}

Key Skills: ${request.candidateProfile.skills.join(', ')}

Instructions:
- Tone: ${toneInstructions[request.tone]}
- ${request.highlightExperience ? 'Highlight relevant experience that matches the job requirements' : 'Focus on skills and potential'}
- Keep it concise (250-400 words)
- Show genuine interest in the company and role
- ${request.customInstructions || ''}

Write a professional cover letter that will make the candidate stand out.`;
  }

  /**
   * Build CV suggestions prompt
   */
  private buildCVSuggestionsPrompt(request: CVSuggestionRequest): string {
    return `Analyze this CV/resume and provide improvement suggestions.

${request.targetJobTitle ? `Target Job Title: ${request.targetJobTitle}` : ''}
${request.targetIndustry ? `Target Industry: ${request.targetIndustry}` : ''}

Current Profile:
${request.profileData.summary ? `Summary: ${request.profileData.summary}` : 'No summary provided'}

Experience:
${request.profileData.experiences.map(exp =>
  `- ${exp.position} at ${exp.company}:\n  ${exp.bulletPoints.join('\n  ')}`
).join('\n')}

Skills: ${request.profileData.skills.join(', ')}

${request.profileData.projects ? `Projects:
${request.profileData.projects.map(p => `- ${p.name}: ${p.description}`).join('\n')}` : ''}

Provide specific, actionable suggestions to improve this CV. Focus on:
1. Making the summary more impactful
2. Strengthening bullet points with quantifiable achievements
3. Highlighting skills relevant to the target role
4. Improving project descriptions`;
  }

  /**
   * Build job compatibility analysis prompt
   */
  private buildCompatibilityPrompt(request: JobCompatibilityRequest): string {
    return `Analyze the compatibility between this candidate and job position.

Job Details:
- Title: ${request.job.title}
- Location: ${request.job.location} (${request.job.remote ? 'Remote' : 'On-site'})
- Description: ${request.job.description}

Requirements:
${request.job.requirements.map(r => `- ${r}`).join('\n')}

Preferred Skills:
${request.job.preferredSkills.map(s => `- ${s}`).join('\n')}

Candidate Profile:
- Years of Experience: ${request.profile.yearsOfExperience}
- Summary: ${request.profile.summary}

Experience:
${request.profile.experiences.map(exp =>
  `- ${exp.position} at ${exp.company} (${exp.duration}):\n  ${exp.highlights.join('\n  ')}`
).join('\n')}

Candidate Skills: ${request.profile.skills.join(', ')}

Provide a detailed compatibility analysis including:
1. Overall score (0-100)
2. Skill match analysis with specific matched/missing skills
3. Experience match with detailed analysis
4. Brief summary of fit`;
  }

  /**
   * Extract key highlights from generated cover letter
   */
  private extractHighlights(content: string): string[] {
    // Simple extraction - could be enhanced with NLP
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    return sentences
      .filter(s =>
        s.toLowerCase().includes('experience') ||
        s.toLowerCase().includes('skill') ||
        s.toLowerCase().includes('achieved') ||
        s.toLowerCase().includes('expertise')
      )
      .slice(0, 3)
      .map(s => s.trim());
  }
}

// Singleton instance
export const geminiClient = new GeminiClient();
