// Profile CV Upload and Processing API Route
// POST /api/profile/upload-cv - Upload CV and extract profile data
// Based on API contract: specs/001-apply-copilot-system/contracts/api.md

import { NextRequest } from 'next/server';
import { PDFExtractor } from '@/lib/parsing/pdf-extractor';
import mammoth from 'mammoth';
import {
  createdResponse,
  handleApiError,
  ValidationError,
  FileTooLargeError,
  InvalidFileTypeError,
  AIProcessingError,
} from '@/lib/api';
import { loggers, saveDebugArtifact } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';
import { saveFile, validateFile, getFile } from '@/lib/storage';
import { AIService } from '@/lib/ai';

interface CVSectionLines {
  basicData: number;
  summary: number;
  experiences: number;
  education: number;
  projects: number;
  skills: number;
}

function segmentText(cvText: string, sectionLines: CVSectionLines) {
  const lines = cvText.split('\n');
  
  const sections = [
    { name: 'basicData', line: sectionLines.basicData - 1 },
    { name: 'summary', line: sectionLines.summary - 1 },
    { name: 'experiences', line: sectionLines.experiences - 1 },
    { name: 'education', line: sectionLines.education - 1 },
    { name: 'projects', line: sectionLines.projects - 1 },
    { name: 'skills', line: sectionLines.skills - 1 },
  ]
    .filter(s => s.line >= 0 && s.line < lines.length)
    .sort((a, b) => a.line - b.line);

  const segments: Record<string, string> = {
    basicData: '',
    summary: '',
    experiences: '',
    education: '',
    projects: '',
    skills: '',
  };

  for (let i = 0; i < sections.length; i++) {
    const current = sections[i];
    const nextLine = (i + 1 < sections.length) ? sections[i + 1].line : lines.length;
    
    const sectionLinesArray = lines.slice(current.line, nextLine);
    segments[current.name] = sectionLinesArray.join('\n');
  }

  if (!segments.basicData) {
    segments.basicData = lines.slice(0, Math.min(25, lines.length)).join('\n');
  }

  return segments;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  loggers.app.debug(`[${requestId}] === UPLOAD CV REQUEST STARTED ===`);

  try {
    loggers.app.debug(`[${requestId}] Step 1: Checking rate limit`);
    // Check rate limit (5 requests per minute for file uploads)
    const { allowed, response } = await checkRateLimit('FILE_UPLOAD', request);
    if (!allowed) {
      loggers.app.warn(`[${requestId}] Rate limit exceeded`);
      return response!;
    }
    loggers.app.debug(`[${requestId}] Step 1: Rate limit check passed`);

    loggers.app.debug(`[${requestId}] Step 2: Parsing multipart form data`);
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      loggers.app.error(`[${requestId}] No file provided in request`);
      throw new ValidationError('No file provided');
    }
    loggers.app.debug(`[${requestId}] Step 2: Form data parsed successfully`, {
      originalName: file.name,
      size: file.size,
      type: file.type,
    });

    // TEMPORARY: Skip authentication for testing
    // TODO: Remove this and restore authentication check after testing
    loggers.app.debug(`[${requestId}] Step 3: Authentication skipped (testing mode)`);

    loggers.app.info('Profile CV upload started', {
      requestId,
      originalName: file.name,
      size: file.size,
      type: file.type,
    });

    loggers.app.debug(`[${requestId}] Step 4: Validating file`);
    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      loggers.app.error(`[${requestId}] File validation failed`, { validation });
      if (validation.error?.includes('size')) {
        throw new FileTooLargeError();
      }
      if (validation.error?.includes('type')) {
        throw new InvalidFileTypeError(['PDF', 'DOCX']);
      }
      throw new ValidationError(validation.error);
    }
    loggers.app.debug(`[${requestId}] Step 4: File validation passed`);

    loggers.app.debug(`[${requestId}] Step 5: Saving file to storage`);
    // Save file
    const saveResult = await saveFile(file);

    if (!saveResult.success) {
      loggers.app.error(`[${requestId}] File save failed`, { saveResult });
      throw new ValidationError(saveResult.error || 'Failed to save file');
    }
    loggers.app.debug(`[${requestId}] Step 5: File saved successfully`, { fileId: saveResult.fileId });

    loggers.app.debug(`[${requestId}] Step 6: Retrieving file for text extraction`);
    // Extract text from file
    let cvText: string;
    let pageCount = 0;
    try {
      const fileResult = await getFile(saveResult.fileId);
      if (!fileResult || (typeof fileResult === 'string')) {
        loggers.app.error(`[${requestId}] File retrieval failed`, { fileId: saveResult.fileId, fileResult });
        throw new AIProcessingError('Failed to retrieve uploaded file');
      }

      const { buffer, metadata } = fileResult;
      loggers.app.info('File retrieved successfully', {
        requestId,
        fileId: saveResult.fileId,
        bufferSize: buffer.length,
        mimeType: metadata.mimeType
      });
      loggers.app.debug(`[${requestId}] Step 6: File retrieved successfully`);

      loggers.app.debug(`[${requestId}] Step 7: Extracting text from file`, { mimeType: metadata.mimeType });
      // Extract text based on file type
      if (metadata.mimeType === 'application/pdf') {
        loggers.app.info('Starting PDF extraction', { requestId, fileId: saveResult.fileId });
        // Use PDFExtractor for PDF text extraction (Node.js compatible)
        const pdfData = await PDFExtractor.extractText(buffer);
        cvText = pdfData.text;
        pageCount = pdfData.pages || 0;
        loggers.app.info('PDF extraction completed', {
          requestId,
          fileId: saveResult.fileId,
          textLength: cvText.length,
          pages: pageCount
        });
      } else if (
        metadata.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        metadata.mimeType === 'application/msword'
      ) {
        loggers.app.info('Starting DOCX extraction', { requestId, fileId: saveResult.fileId });
        const docResult = await mammoth.extractRawText({ buffer });
        cvText = docResult.value;
        loggers.app.info('DOCX extraction completed', {
          requestId,
          fileId: saveResult.fileId,
          textLength: cvText.length
        });
      } else {
        loggers.app.error(`[${requestId}] Unsupported file type`, { mimeType: metadata.mimeType });
        throw new InvalidFileTypeError(['PDF', 'DOCX']);
      }

      if (!cvText || cvText.trim().length === 0) {
        loggers.app.error(`[${requestId}] Extracted text is empty`, { fileId: saveResult.fileId });
        throw new AIProcessingError('Could not extract text from CV file');
      }
      loggers.app.debug(`[${requestId}] Step 7: Text extraction completed`, { textLength: cvText.length });

      // DEBUG: Save raw extracted text
      await saveDebugArtifact(requestId, '01_extractedCV.txt', cvText);
    } catch (error) {
      loggers.app.error(`[${requestId}] CV text extraction failed`, {
        fileId: saveResult.fileId,
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      throw new AIProcessingError('Failed to extract text from CV file: ' + (error as Error).message);
    }

    loggers.app.debug(`[${requestId}] Step 8: Classifying CV sections using local LLM.`);
    let segments = null;
    try {
      const sectionLines = await AIService.identifyCVSections(cvText);
      loggers.app.info(`[${requestId}] Identified CV starting lines:`, sectionLines);
      segments = segmentText(cvText, sectionLines);

      // DEBUG: Save section line numbers and resulting segments
      await saveDebugArtifact(requestId, '02_sectionLines.json', sectionLines);
      await saveDebugArtifact(requestId, '02_segments.json', segments);
    } catch (segmentError) {
      loggers.app.error(`[${requestId}] Failed to segment CV sections, falling back to full text:`, {
        error: (segmentError as Error).message,
      });
    }

    const duration = Date.now() - startTime;
    loggers.app.info('Profile CV upload and text extraction completed', {
      requestId,
      fileId: saveResult.fileId,
      originalName: file.name,
      duration: `${duration}ms`,
    });
    loggers.app.debug(`[${requestId}] === UPLOAD CV REQUEST COMPLETED ===`);

    // Return response containing full extracted text and segments for client-side orchestration
    return createdResponse({
      fileId: saveResult.fileId,
      cvText,
      fullTextLength: cvText.length,
      pages: pageCount,
      segments,
    });
  } catch (error) {
    loggers.app.error(`[${requestId}] Profile CV upload failed`, {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    return handleApiError(error);
  }
}
