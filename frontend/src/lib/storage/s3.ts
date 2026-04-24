// S3-compatible storage implementation (AWS S3, MinIO, etc.)
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Config, FileMetadata, UploadResult, generateFileId } from './config';
import { loggers } from '@/lib/logging';

// S3 client singleton
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: s3Config.region,
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
      },
      ...(s3Config.endpoint && {
        endpoint: s3Config.endpoint,
        forcePathStyle: true,
      }),
    });
  }
  return s3Client;
}

// Save file to S3
export async function saveFileS3(
  file: File,
  userId?: string
): Promise<UploadResult> {
  const startTime = Date.now();

  try {
    const fileId = generateFileId();
    const fileExtension = file.name.split('.').pop() || 'pdf';
    const key = `cvs/${userId || 'anonymous'}/${fileId}.${fileExtension}`;

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const client = getS3Client();
    const command = new PutObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      Metadata: {
        'original-name': encodeURIComponent(file.name),
        'user-id': userId || 'anonymous',
        'uploaded-at': new Date().toISOString(),
      },
    });

    await client.send(command);

    const metadata: FileMetadata = {
      fileId,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      uploadedAt: new Date(),
      userId,
    };

    // Generate presigned URL for immediate access
    const getCommand = new GetObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
    });
    const url = await getSignedUrl(client, getCommand, { expiresIn: 3600 });

    const duration = Date.now() - startTime;
    loggers.app.info('File saved to S3', {
      fileId,
      originalName: file.name,
      size: file.size,
      key,
      duration: `${duration}ms`,
    });

    return {
      success: true,
      fileId,
      url,
      metadata,
    };
  } catch (error) {
    loggers.app.error('Failed to save file to S3', {
      error: (error as Error).message,
      originalName: file.name,
    });

    return {
      success: false,
      fileId: '',
      url: '',
      metadata: {} as FileMetadata,
      error: 'Failed to save file to S3',
    };
  }
}

// Get file from S3 (returns presigned URL)
export async function getFileS3(fileId: string, userId?: string): Promise<string | null> {
  try {
    const client = getS3Client();

    // List objects to find the file
    const key = `cvs/${userId || 'anonymous'}/${fileId}`;

    const command = new GetObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
    });

    const url = await getSignedUrl(client, command, { expiresIn: 3600 });
    return url;
  } catch (error) {
    loggers.app.error('Failed to get file from S3', { fileId, error: (error as Error).message });
    return null;
  }
}

// Delete file from S3
export async function deleteFileS3(fileId: string, userId?: string): Promise<boolean> {
  try {
    const client = getS3Client();
    const key = `cvs/${userId || 'anonymous'}/${fileId}`;

    const command = new DeleteObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
    });

    await client.send(command);

    loggers.app.info('File deleted from S3', { fileId, key });
    return true;
  } catch (error) {
    loggers.app.error('Failed to delete file from S3', { fileId, error: (error as Error).message });
    return false;
  }
}
