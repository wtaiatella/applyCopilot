// Storage module - File upload handling for CV files
// Based on: specs/001-apply-copilot-system/research.md (temporary storage with cleanup)
// API contract: specs/001-apply-copilot-system/contracts/api.md

import {
  getStorageProvider,
  validateFile,
  FileMetadata,
  UploadResult,
} from './config';
import {
  saveFileLocal,
  getFileLocal,
  deleteFileLocal,
  cleanupExpiredFiles,
} from './local';
import {
  saveFileS3,
  getFileS3,
  deleteFileS3,
} from './s3';

// Main upload function
export async function saveFile(file: File, userId?: string): Promise<UploadResult> {
  // Validate first
  const validation = validateFile(file);
  if (!validation.valid) {
    return {
      success: false,
      fileId: '',
      url: '',
      metadata: {} as FileMetadata,
      error: validation.error,
    };
  }

  const provider = getStorageProvider();

  if (provider === 's3') {
    return saveFileS3(file, userId);
  }

  return saveFileLocal(file, userId);
}

// Main retrieval function
export async function getFile(fileId: string, userId?: string): Promise<{ buffer: Buffer; metadata: FileMetadata } | string | null> {
  const provider = getStorageProvider();

  if (provider === 's3') {
    return getFileS3(fileId, userId);
  }

  return getFileLocal(fileId);
}

// Main delete function
export async function deleteFile(fileId: string, userId?: string): Promise<boolean> {
  const provider = getStorageProvider();

  if (provider === 's3') {
    return deleteFileS3(fileId, userId);
  }

  return deleteFileLocal(fileId);
}

// Cleanup function (only for local storage)
export async function cleanupFiles(): Promise<number> {
  const provider = getStorageProvider();

  if (provider === 'local') {
    return cleanupExpiredFiles();
  }

  // S3 cleanup would use lifecycle policies
  return 0;
}

// Re-exports
export type { FileMetadata, UploadResult } from './config';
export { validateFile, getStorageProvider } from './config';
