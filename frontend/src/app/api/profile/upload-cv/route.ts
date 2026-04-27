// Profile CV Upload and Processing API Route
// POST /api/profile/upload-cv - Upload CV and extract profile data
// Based on API contract: specs/001-apply-copilot-system/contracts/api.md

import { NextRequest } from 'next/server';
import * as pdfjsLib from 'pdfjs-dist';
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

    // TEMPORARY: Skip authentication for testing
    // TODO: Remove this and restore authentication check after testing

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
        loggers.app.error('File retrieval failed', { fileId: saveResult.fileId, fileResult });
        throw new AIProcessingError('Failed to retrieve uploaded file');
      }

      const { buffer, metadata } = fileResult;
      loggers.app.info('File retrieved successfully', { 
        fileId: saveResult.fileId, 
        bufferSize: buffer.length,
        mimeType: metadata.mimeType 
      });

      // Extract text based on file type
      if (metadata.mimeType === 'application/pdf') {
        loggers.app.info('Starting PDF extraction', { fileId: saveResult.fileId });
        // Use pdfjs-dist directly for PDF text extraction
        const loadingTask = pdfjsLib.getDocument({ data: buffer });
        const pdf = await loadingTask.promise;
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + '\n';
        }
        
        cvText = fullText;
        loggers.app.info('PDF extraction completed', { 
          fileId: saveResult.fileId, 
          textLength: cvText.length,
          pages: pdf.numPages
        });
      } else if (
        metadata.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        metadata.mimeType === 'application/msword'
      ) {
        loggers.app.info('Starting DOCX extraction', { fileId: saveResult.fileId });
        const docResult = await mammoth.extractRawText({ buffer });
        cvText = docResult.value;
        loggers.app.info('DOCX extraction completed', { 
          fileId: saveResult.fileId, 
          textLength: cvText.length 
        });
      } else {
        loggers.app.error('Unsupported file type', { mimeType: metadata.mimeType });
        throw new InvalidFileTypeError(['PDF', 'DOCX']);
      }

      if (!cvText || cvText.trim().length === 0) {
        loggers.app.error('Extracted text is empty', { fileId: saveResult.fileId });
        throw new AIProcessingError('Could not extract text from CV file');
      }
    } catch (error) {
      loggers.app.error('CV text extraction failed', {
        fileId: saveResult.fileId,
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      throw new AIProcessingError('Failed to extract text from CV file: ' + (error as Error).message);
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
      // Return partial success with extracted text even if AI parsing fails
      return createdResponse({
        fileId: saveResult.fileId,
        extractedText: cvText,
        error: 'AI parsing failed',
      });
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
