// Local filesystem storage implementation
import fs from 'fs/promises';
import path from 'path';
import { localStorageConfig, FileMetadata, UploadResult, generateFileId } from './config';
import { loggers } from '@/lib/logging';

// Ensure upload directory exists
async function ensureUploadDir(): Promise<string> {
  const uploadDir = path.resolve(localStorageConfig.uploadDir);
  try {
    await fs.access(uploadDir);
  } catch {
    await fs.mkdir(uploadDir, { recursive: true });
    loggers.app.info('Created upload directory', { path: uploadDir });
  }
  return uploadDir;
}

// Save file to local storage
export async function saveFileLocal(
  file: File,
  userId?: string
): Promise<UploadResult> {
  const startTime = Date.now();

  try {
    const uploadDir = await ensureUploadDir();
    const fileId = generateFileId();
    const fileExtension = path.extname(file.name) || '.pdf';
    const fileName = `${fileId}${fileExtension}`;
    const filePath = path.join(uploadDir, fileName);

    // Convert File to Buffer and save
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(filePath, buffer);

    const metadata: FileMetadata = {
      fileId,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      uploadedAt: new Date(),
      userId,
      expiresAt: new Date(Date.now() + localStorageConfig.maxFileAge),
    };

    // Save metadata alongside file
    const metadataPath = path.join(uploadDir, `${fileId}.json`);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    const duration = Date.now() - startTime;
    loggers.app.info('File saved locally', {
      fileId,
      originalName: file.name,
      size: file.size,
      duration: `${duration}ms`,
    });

    return {
      success: true,
      fileId,
      url: `/uploads/${fileName}`,
      metadata,
    };
  } catch (error) {
    loggers.app.error('Failed to save file locally', {
      error: (error as Error).message,
      originalName: file.name,
    });

    return {
      success: false,
      fileId: '',
      url: '',
      metadata: {} as FileMetadata,
      error: 'Failed to save file',
    };
  }
}

// Retrieve file from local storage
export async function getFileLocal(fileId: string): Promise<{ buffer: Buffer; metadata: FileMetadata } | null> {
  try {
    const uploadDir = await ensureUploadDir();
    const metadataPath = path.join(uploadDir, `${fileId}.json`);

    // Read metadata
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata: FileMetadata = JSON.parse(metadataContent);

    // Find file with any extension
    const files = await fs.readdir(uploadDir);
    const fileName = files.find(f => f.startsWith(fileId) && !f.endsWith('.json'));

    if (!fileName) {
      return null;
    }

    const filePath = path.join(uploadDir, fileName);
    const buffer = await fs.readFile(filePath);

    return { buffer, metadata };
  } catch {
    return null;
  }
}

// Delete file from local storage
export async function deleteFileLocal(fileId: string): Promise<boolean> {
  try {
    const uploadDir = await ensureUploadDir();
    const metadataPath = path.join(uploadDir, `${fileId}.json`);

    // Find and delete the actual file
    const files = await fs.readdir(uploadDir);
    const fileName = files.find(f => f.startsWith(fileId) && !f.endsWith('.json'));

    if (fileName) {
      await fs.unlink(path.join(uploadDir, fileName));
    }

    // Delete metadata
    await fs.unlink(metadataPath).catch(() => {});

    loggers.app.info('File deleted locally', { fileId });
    return true;
  } catch (error) {
    loggers.app.error('Failed to delete file', { fileId, error: (error as Error).message });
    return false;
  }
}

// Clean up expired files
export async function cleanupExpiredFiles(): Promise<number> {
  try {
    const uploadDir = await ensureUploadDir();
    const files = await fs.readdir(uploadDir);
    let deletedCount = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const metadataPath = path.join(uploadDir, file);
        const metadataContent = await fs.readFile(metadataPath, 'utf-8');
        const metadata: FileMetadata = JSON.parse(metadataContent);

        if (metadata.expiresAt && new Date(metadata.expiresAt) < new Date()) {
          const fileId = file.replace('.json', '');
          await deleteFileLocal(fileId);
          deletedCount++;
        }
      } catch {
        // Skip files with invalid metadata
      }
    }

    if (deletedCount > 0) {
      loggers.app.info('Cleaned up expired files', { count: deletedCount });
    }

    return deletedCount;
  } catch (error) {
    loggers.app.error('Failed to cleanup expired files', { error: (error as Error).message });
    return 0;
  }
}
