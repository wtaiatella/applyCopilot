// CV Upload API Route
// POST /api/upload/cv - Upload CV file for processing
// Based on API contract: specs/001-apply-copilot-system/contracts/api.md

import { NextRequest } from 'next/server';
import {
  createdResponse,
  handleApiError,
  ValidationError,
  FileTooLargeError,
  InvalidFileTypeError,
} from '@/lib/api';
import { loggers } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';
import { saveFile, validateFile } from '@/lib/storage';

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

    loggers.app.info('CV upload started', {
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
    const result = await saveFile(file);

    if (!result.success) {
      throw new ValidationError(result.error || 'Failed to save file');
    }

    const duration = Date.now() - startTime;
    loggers.app.info('CV upload completed', {
      fileId: result.fileId,
      originalName: file.name,
      size: file.size,
      duration: `${duration}ms`,
    });

    // Return success response per API contract
    return createdResponse({
      fileId: result.fileId,
      originalName: result.metadata.originalName,
      size: result.metadata.size,
      type: result.metadata.mimeType,
      url: result.url,
    });
  } catch (error) {
    loggers.app.error('CV upload failed', {
      error: (error as Error).message,
    });
    return handleApiError(error);
  }
}
