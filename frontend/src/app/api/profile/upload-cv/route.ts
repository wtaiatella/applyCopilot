// Profile CV Upload and Processing API Route
// POST /api/profile/upload-cv - Upload CV and extract profile data
// Based on API contract: specs/001-apply-copilot-system/contracts/api.md

import { NextRequest } from 'next/server';
import * as pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
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
import { saveFile, validateFile, getFile } from '@/lib/storage';
import { AIService } from '@/lib/ai';

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

    // Extract text from file
    let cvText: string;
    try {
      const fileResult = await getFile(saveResult.fileId);
      if (!fileResult || (typeof fileResult === 'string')) {
        throw new AIProcessingError('Failed to retrieve uploaded file');
      }

      const { buffer, metadata } = fileResult;

      // Extract text based on file type
      if (metadata.mimeType === 'application/pdf') {
        const pdfData = await (pdfParse as unknown as (b: Buffer) => Promise<{ text: string }>)(buffer);
        cvText = pdfData.text;
      } else if (
        metadata.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        metadata.mimeType === 'application/msword'
      ) {
        const docResult = await mammoth.extractRawText({ buffer });
        cvText = docResult.value;
      } else {
        throw new InvalidFileTypeError(['PDF', 'DOCX']);
      }

      if (!cvText || cvText.trim().length === 0) {
        throw new AIProcessingError('Could not extract text from CV file');
      }
    } catch (error) {
      loggers.ai.error('CV text extraction failed', {
        fileId: saveResult.fileId,
        error: (error as Error).message,
      });
      throw new AIProcessingError('Failed to extract text from CV file');
    }

    // Process CV with AI (Ollama)
    let extractedData;
    try {
      extractedData = await AIService.parseCV(cvText);
      loggers.ai.info('CV parsed successfully', { fileId: saveResult.fileId });
    } catch (error) {
      loggers.ai.error('CV AI processing failed', {
        fileId: saveResult.fileId,
        error: (error as Error).message,
      });
      throw new AIProcessingError('Failed to process CV with AI');
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
