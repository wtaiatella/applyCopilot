// CV Parsing Service
// Orchestrates CV text extraction and AI-powered data extraction

import { PDFExtractor, PDFExtractionResult } from './pdf-extractor';
import { DOCXExtractor, DOCXExtractionResult } from './docx-extractor';
import { AIService } from '@/lib/ai';

export type CVFileFormat = 'PDF' | 'DOCX';

export interface CVExtractionResult {
  format: CVFileFormat;
  text: string;
  metadata?: PDFExtractionResult['metadata'] | DOCXExtractionResult['metadata'];
}

export interface ParsedCVData {
  basicData: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    location?: string;
  };
  experiences: Array<{
    company: string;
    position: string;
    startDate: string;
    endDate?: string;
    current: boolean;
    description: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string;
    field: string;
    startDate: string;
    endDate?: string;
    current: boolean;
  }>;
  projects: Array<{
    name: string;
    description: string[];
    technologies: string[];
  }>;
  skills: Array<{
    name: string;
    category: string;
    proficiency: string;
  }>;
}

export class CVParser {
  /**
   * Extract text from CV file (PDF or DOCX)
   */
  static async extractText(
    buffer: Buffer,
    mimeType: string
  ): Promise<CVExtractionResult> {
    if (mimeType === 'application/pdf') {
      const result = await PDFExtractor.extractText(buffer);
      return {
        format: 'PDF',
        text: result.text,
        metadata: result.metadata,
      };
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      const result = await DOCXExtractor.extractText(buffer);
      return {
        format: 'DOCX',
        text: result.text,
        metadata: result.metadata,
      };
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }
  }

  /**
   * Parse CV text into structured data using AI
   */
  static async parseCVData(cvText: string): Promise<ParsedCVData> {
    try {
      const extractedData = await AIService.parseCV(cvText);
      
      const parsedData: ParsedCVData = {
        basicData: {
          firstName: extractedData.basicData?.firstName,
          lastName: extractedData.basicData?.lastName,
          email: extractedData.basicData?.email,
          phone: extractedData.basicData?.phone,
          location: extractedData.basicData?.location,
        },
        experiences: (extractedData.experiences || []).map(exp => ({
          company: exp.company,
          position: exp.position,
          startDate: exp.startDate,
          endDate: exp.endDate,
          current: exp.current,
          description: exp.bulletPoints || (exp as any).description || [],
        })),
        education: (extractedData.education || []).map(edu => ({
          institution: edu.institution,
          degree: edu.degree,
          field: edu.field,
          startDate: edu.startDate,
          endDate: edu.endDate,
          current: edu.current,
        })),
        projects: (extractedData.projects || []).map(proj => ({
          name: proj.name,
          description: proj.bulletPoints || (proj as any).description || [],
          technologies: proj.technologies || [],
        })),
        skills: (extractedData.skills || []).map(skill => ({
          name: skill.name,
          category: skill.category,
          proficiency: skill.proficiency,
        })),
      };

      return parsedData;
    } catch (error) {
      console.error('CV parsing failed:', error);
      throw new Error(`Failed to parse CV data: ${(error as Error).message}`);
    }
  }

  /**
   * Full pipeline: extract text and parse data
   */
  static async processCV(
    buffer: Buffer,
    mimeType: string
  ): Promise<{
    extraction: CVExtractionResult;
    parsedData: ParsedCVData;
  }> {
    // Step 1: Extract text
    const extraction = await this.extractText(buffer, mimeType);

    if (!extraction.text || extraction.text.trim().length === 0) {
      throw new Error('Could not extract text from CV file');
    }

    // Step 2: Parse data with AI
    const parsedData = await this.parseCVData(extraction.text);

    return {
      extraction,
      parsedData,
    };
  }

  /**
   * Validate CV file format
   */
  static isValidCVFormat(mimeType: string): boolean {
    return (
      mimeType === 'application/pdf' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    );
  }

  /**
   * Get file format from mime type
   */
  static getFormatFromMimeType(mimeType: string): CVFileFormat | null {
    if (mimeType === 'application/pdf') return 'PDF';
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      return 'DOCX';
    }
    return null;
  }
}
