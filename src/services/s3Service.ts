import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Initialize S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  },
  requestHandler: {
    connectionTimeout: 5000,  // 5 seconds
    socketTimeout: 30000      // 30 seconds
  }
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || '';
const DEFAULT_EXPIRATION = 3600; // 1 hour

// Validate S3 configuration
export const validateS3Config = (): void => {
  if (!process.env.AWS_ACCESS_KEY_ID) {
    throw new Error('AWS_ACCESS_KEY_ID is required');
  }
  if (!process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS_SECRET_ACCESS_KEY is required');
  }
  if (!process.env.AWS_S3_BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET_NAME is required');
  }
};

/**
 * Generate S3 key for document storage
 * Format: applications/{applicationId}/{docType}/{fileName}
 */
export const generateS3Key = (
  applicationId: string,
  fileName: string,
): string => {
  return `applications/${applicationId}/${fileName}`;
};

/**
 * Upload a document to S3
 * @param applicationId - Application ID
 * @param fileName - Name of the file
 * @param buffer - File buffer
 * @param docType - Document type ('unsigned' or 'signed')
 * @returns Object with S3 key and URL
 */
export const uploadDocument = async (
  applicationId: string,
  fileName: string,
  buffer: Buffer,
): Promise<{ key: string; url: string }> => {
  try {
    const key = generateS3Key(applicationId, fileName);

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf',
      Metadata: {
        applicationId,
        uploadedAt: new Date().toISOString()
      }
    });

    await s3Client.send(command);

    const url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    console.log(`Document uploaded to S3: ${key}`);

    return { key, url };
  } catch (error) {
    console.error('Error uploading document to S3:', error);
    throw new Error(`Failed to upload document: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Upload document with retry logic
 * @param applicationId - Application ID
 * @param fileName - Name of the file
 * @param buffer - File buffer
 * @param docType - Document type ('unsigned' or 'signed')
 * @param maxRetries - Maximum number of retry attempts
 * @returns Object with S3 key and URL
 */
export const uploadDocumentWithRetry = async (
  applicationId: string,
  fileName: string,
  buffer: Buffer,
  maxRetries: number = 3
): Promise<{ key: string; url: string }> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await uploadDocument(applicationId, fileName, buffer);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.error(`Upload attempt ${attempt} failed:`, error);

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = 1000 * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed to upload after ${maxRetries} attempts: ${lastError?.message}`);
};

/**
 * Download a document from S3
 * @param s3Key - S3 key of the document
 * @returns File buffer
 */
export const downloadDocument = async (s3Key: string): Promise<Buffer> => {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error('No data returned from S3');
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    const stream = response.Body as any;

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);

    console.log(`Document downloaded from S3: ${s3Key}`);

    return buffer;
  } catch (error) {
    console.error('Error downloading document from S3:', error);
    throw new Error(`Failed to download document: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Generate a pre-signed URL for temporary access to a document
 * @param s3Key - S3 key of the document
 * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns Pre-signed URL
 */
export const generatePresignedUrl = async (
  s3Key: string,
  expiresIn: number = DEFAULT_EXPIRATION
): Promise<string> => {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });

    console.log(`Generated pre-signed URL for: ${s3Key} (expires in ${expiresIn}s)`);

    return presignedUrl;
  } catch (error) {
    console.error('Error generating pre-signed URL:', error);
    throw new Error(`Failed to generate pre-signed URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Delete a document from S3
 * @param s3Key - S3 key of the document
 * @returns True if successful
 */
export const deleteDocument = async (s3Key: string): Promise<boolean> => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error('Error deleting document from S3:', error);
    throw new Error(`Failed to delete document: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * List all documents for an application
 * @param applicationId - Application ID
 * @returns Array of S3 keys
 */
export const listDocuments = async (applicationId: string): Promise<string[]> => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: `applications/${applicationId}/`
    });

    const response = await s3Client.send(command);

    const keys = response.Contents?.map(item => item.Key || '') || [];

    console.log(`Found ${keys.length} documents for application ${applicationId}`);

    return keys.filter(key => key !== '');
  } catch (error) {
    console.error('Error listing documents from S3:', error);
    throw new Error(`Failed to list documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Delete all documents for an application
 * @param applicationId - Application ID
 * @returns Number of documents deleted
 */
export const deleteApplicationDocuments = async (applicationId: string): Promise<number> => {
  try {
    const keys = await listDocuments(applicationId);

    let deletedCount = 0;

    for (const key of keys) {
      await deleteDocument(key);
      deletedCount++;
    }

    console.log(`Deleted ${deletedCount} documents for application ${applicationId}`);

    return deletedCount;
  } catch (error) {
    console.error('Error deleting application documents:', error);
    throw new Error(`Failed to delete application documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
