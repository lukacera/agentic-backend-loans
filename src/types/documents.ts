export interface DocumentMetadata {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  processedAt?: Date;
  status: DocumentStatus;
  filePath: string;
}

export interface ProcessedDocument {
  id: string;
  content: string;
  summary?: string;
  metadata: DocumentMetadata;
  processingResult: ProcessingResult;
}

export interface ProcessingResult {
  success: boolean;
  extractedText: string;
  wordCount: number;
  pageCount?: number;
  language?: string;
  aiAnalysis?: AIAnalysis;
  error?: string;
  processingTime: number;
}

export interface AIAnalysis {
  summary: string;
  keyPoints: string[];
  category?: string;
  sentiment?: string;
  extractedEntities?: string[];
}

export interface DocumentUploadRequest {
  processImmediately?: boolean;
  analysisType?: AnalysisType;
  customPrompt?: string;
}

export interface DocumentProcessRequest {
  documentId: string;
  analysisType: AnalysisType;
  customPrompt?: string;
}

export enum DocumentStatus {
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed'
}

export enum AnalysisType {
  SUMMARY = 'summary',
  EXTRACTION = 'extraction',
  ANALYSIS = 'analysis',
  CUSTOM = 'custom'
}

export enum SupportedMimeTypes {
  PDF = 'application/pdf',
  DOC = 'application/msword',
  DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  TXT = 'text/plain',
  MD = 'text/markdown'
}