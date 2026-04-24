// Profile CV Upload and Processing API Route
// POST /api/profile/upload-cv - Upload CV and extract profile data
// Based on API contract: specs/001-apply-copilot-system/contracts/api.md

import { NextRequest } from 'next/server';
import {
  createdResponse,
  handleApiError,
  ValidationError,
  FileTooLargeError,
  InvalidFileTypeError,
  AIProcessingError,
} from '@/lib/api';
import { loggers } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';
import { saveFile, validateFile } from '@/lib/storage';

// Mock AI processing function (will be replaced with actual Ollama/Gemini integration in T021)
async function processCVWithAI(fileId: string): Promise<{
  basicData: {
    firstName: string;
    lastName: string;
    phone?: string;
    location?: string;
    portfolioLinks: string[];
  };
  experiences: unknown[];
  education: unknown[];
  projects: unknown[];
  skills: unknown[];
  references: unknown[];
}> {
  // TODO: Implement actual AI processing in T021
  // This is a placeholder that returns mock data
  return {
    basicData: {
      firstName: 'John',
      lastName: 'Doe',
      phone: '+1 555-123-4567',
      location: 'San Francisco, CA',
      portfolioLinks: ['https://johndoe.dev'],
    },
    experiences: [],
    education: [],
    projects: [],
    skills: [],
    references: [],
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Check rate limit (5 requests per minute for file uploads)
    const { allowed, response } = await checkRateLimit('FILE_UPLOAD', request);
    if (!allowed) {
      return response!;
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      throw new ValidationError('No file provided');
    }

    loggers.app.info('Profile CV upload started', {
      originalName: file.name,
      size: file.size,
      type: file.type,
    });

    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      if (validation.error?.includes('size')) {
        throw new FileTooLargeError();
      }
      if (validation.error?.includes('type')) {
        throw new InvalidFileTypeError(['PDF', 'DOCX']);
      }
      throw new ValidationError(validation.error);
    }

    // Save file
    const saveResult = await saveFile(file);

    if (!saveResult.success) {
      throw new ValidationError(saveResult.error || 'Failed to save file');
    }

    // Process CV with AI (mock for now, real implementation in T021)
    let extractedData;
    try {
      extractedData = await processCVWithAI(saveResult.fileId);
    } catch {
      throw new AIProcessingError('Failed to extract data from CV');
    }

    const duration = Date.now() - startTime;
    loggers.app.info('Profile CV upload completed', {
      fileId: saveResult.fileId,
      originalName: file.name,
      duration: `${duration}ms`,
    });

    // Return response per API contract
    return createdResponse({
      profileId: saveResult.fileId, // Will be replaced with actual profile ID
      extractedData,
    });
  } catch (error) {
    loggers.app.error('Profile CV upload failed', {
      error: (error as Error).message,
    });
    return handleApiError(error);
  }
}
