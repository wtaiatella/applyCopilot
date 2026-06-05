// Storage configuration for file uploads
// Supports local filesystem (dev) and S3-compatible storage (production)

// Storage provider type
export type StorageProvider = 'local' | 's3';

// Get storage provider from environment
export function getStorageProvider(): StorageProvider {
  return (process.env.STORAGE_PROVIDER as StorageProvider) || 'local';
}

// Local storage configuration
export const localStorageConfig = {
  uploadDir: process.env.UPLOAD_DIR || './debug',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
    'application/msword', // DOC
  ] as const,
  cleanupInterval: 24 * 60 * 60 * 1000, // 24 hours in ms
  maxFileAge: 24 * 60 * 60 * 1000, // 24 hours in ms
};

// S3 configuration (for production)
export const s3Config = {
  region: process.env.AWS_REGION || 'us-east-1',
  bucket: process.env.S3_BUCKET_NAME || 'applycopilot-uploads',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  endpoint: process.env.S3_ENDPOINT, // For MinIO or other S3-compatible services
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: localStorageConfig.allowedTypes,
};

// File metadata
export interface FileMetadata {
  fileId: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  userId?: string;
  expiresAt?: Date;
}

// Upload result
export interface UploadResult {
  success: boolean;
  fileId: string;
  url: string;
  metadata: FileMetadata;
  error?: string;
}

// File validation
export function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > localStorageConfig.maxFileSize) {
    return {
      valid: false,
      error: `File size exceeds 10MB limit. Received ${(file.size / 1024 / 1024).toFixed(2)}MB`,
    };
  }

  // Check file type
  const allowedTypes = [...localStorageConfig.allowedTypes];
  if (!allowedTypes.includes(file.type as typeof allowedTypes[number])) {
    return {
      valid: false,
      error: `Invalid file type: ${file.type}. Only PDF and DOCX files are allowed.`,
    };
  }

  return { valid: true };
}

// Generate unique file ID
export function generateFileId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${random}`;
}
