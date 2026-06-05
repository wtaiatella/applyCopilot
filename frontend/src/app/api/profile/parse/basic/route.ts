import { NextRequest } from 'next/server';
import { createdResponse, handleApiError, ValidationError } from '@/lib/api';
import { loggers, saveDebugArtifact } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';
import { AIService } from '@/lib/ai';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  // Prefer the requestId forwarded from the client (upload session) so all
  // debug artifacts land in the same folder.
  const requestId =
    request.headers.get('x-request-id') ?? Math.random().toString(36).substring(7);

  loggers.app.debug(`[${requestId}] === PARSE BASIC DATA STARTED ===`);

  try {
    // Check rate limit
    const { allowed, response } = await checkRateLimit('FILE_UPLOAD', request);
    if (!allowed) {
      loggers.app.warn(`[${requestId}] Rate limit exceeded`);
      return response!;
    }

    const body = await request.json();
    const { cvText } = body;

    if (!cvText || typeof cvText !== 'string' || cvText.trim().length === 0) {
      throw new ValidationError('cvText is required and must be a non-empty string');
    }

    loggers.app.info('Focused basic parsing started', { requestId, textLength: cvText.length });

    // DEBUG: Save input text sent to AI
    await saveDebugArtifact(requestId, '03_input_basic.txt', cvText);

    const extractedData = await AIService.extractBasicData(cvText);

    // DEBUG: Save AI response
    await saveDebugArtifact(requestId, '03_output_basic.json', extractedData);

    const duration = Date.now() - startTime;
    loggers.app.info('Focused basic parsing completed', {
      requestId,
      duration: `${duration}ms`,
    });

    return createdResponse(extractedData);
  } catch (error) {
    loggers.app.error(`[${requestId}] Focused basic parsing failed`, {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    return handleApiError(error);
  }
}
