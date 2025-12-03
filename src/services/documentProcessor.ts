import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import { marked } from 'marked';
import { 
  DocumentMetadata, 
  ProcessedDocument, 
  ProcessingResult, 
  DocumentStatus, 
  AnalysisType, 
  SupportedMimeTypes,
  AIAnalysis 
} from '../types';

// Document storage functions
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const PROCESSED_DIR = path.join(process.cwd(), 'processed');

// Initialize storage directories
export const initializeStorage = async (): Promise<void> => {
  await fs.ensureDir(UPLOADS_DIR);
  await fs.ensureDir(PROCESSED_DIR);
};

// Create document metadata
export const createDocumentMetadata = (
  filename: string,
  originalName: string,
  mimeType: string,
  size: number,
  filePath: string
): DocumentMetadata => ({
  id: uuidv4(),
  filename,
  originalName,
  mimeType,
  size,
  uploadedAt: new Date(),
  status: DocumentStatus.UPLOADED,
  filePath
});

// Extract text from different file types
export const extractTextFromPDF = async (filePath: string): Promise<{ text: string; pageCount: number }> => {
  const dataBuffer = await fs.readFile(filePath);
  //@ts-expect-error false positive
  const data = await pdfParse(dataBuffer);
  return {
    text: data.text,
    pageCount: data.numpages
  };
};

export const extractTextFromWord = async (filePath: string): Promise<string> => {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
};

export const extractTextFromPlain = async (filePath: string): Promise<string> => {
  return await fs.readFile(filePath, 'utf-8');
};

// Main text extraction function
export const extractText = async (filePath: string, mimeType: string): Promise<{ text: string; pageCount?: number }> => {
  switch (mimeType) {
    case SupportedMimeTypes.PDF:
      return await extractTextFromPDF(filePath);
    
    case SupportedMimeTypes.DOC:
    case SupportedMimeTypes.DOCX:
      const wordText = await extractTextFromWord(filePath);
      return { text: wordText };

      case SupportedMimeTypes.TXT:
      const plainText = await extractTextFromPlain(filePath);
      return { text: plainText };
    
    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }
};

// Count words in text
export const countWords = (text: string): number => {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
};

// Detect language (simple implementation)
export const detectLanguage = (text: string): string => {
  // Simple heuristic - can be replaced with a proper language detection library
  const sample = text.toLowerCase().slice(0, 1000);
  
  if (/\b(the|and|or|but|in|on|at|to|for|of|with|by)\b/.test(sample)) {
    return 'en';
  } else if (/\b(le|la|les|et|ou|mais|dans|sur|à|pour|de|avec|par)\b/.test(sample)) {
    return 'fr';
  } else if (/\b(der|die|das|und|oder|aber|in|auf|zu|für|von|mit|durch)\b/.test(sample)) {
    return 'de';
  }
  
  return 'unknown';
};

// Create processing result
export const createProcessingResult = (
  success: boolean,
  extractedText: string,
  pageCount?: number,
  aiAnalysis?: AIAnalysis,
  error?: string,
  processingTime: number = 0
): ProcessingResult => ({
  success,
  extractedText,
  wordCount: success ? countWords(extractedText) : 0,
  pageCount,
  language: success ? detectLanguage(extractedText) : undefined,
  aiAnalysis,
  error,
  processingTime
});

// Process document
export const processDocument = async (
  metadata: DocumentMetadata,
  analysisType: AnalysisType = AnalysisType.EXTRACTION
): Promise<ProcessingResult> => {
  const startTime = Date.now();
  
  try {
    // Extract text from file
    const { text, pageCount } = await extractText(metadata.filePath, metadata.mimeType);
    
    if (!text || text.trim().length === 0) {
      throw new Error('No text content found in document');
    }

    const processingTime = Date.now() - startTime;

    return createProcessingResult(
      true,
      text,
      pageCount,
      undefined, // AI analysis will be added separately
      undefined,
      processingTime
    );

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('Document processing error:', error);
    
    return createProcessingResult(
      false,
      '',
      undefined,
      undefined,
      error instanceof Error ? error.message : 'Unknown processing error',
      processingTime
    );
  }
};

// Save processed document
export const saveProcessedDocument = async (processedDoc: ProcessedDocument): Promise<string> => {
  const fileName = `${processedDoc.id}.json`;
  const filePath = path.join(PROCESSED_DIR, fileName);
  
  await fs.writeFile(filePath, JSON.stringify(processedDoc, null, 2), 'utf-8');
  return filePath;
};

// Load processed document
export const loadProcessedDocument = async (id: string): Promise<ProcessedDocument | null> => {
  const filePath = path.join(PROCESSED_DIR, `${id}.json`);
  
  if (!(await fs.pathExists(filePath))) {
    return null;
  }
  
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content) as ProcessedDocument;
};

// List all processed documents
export const listProcessedDocuments = async (): Promise<DocumentMetadata[]> => {
  const files = await fs.readdir(PROCESSED_DIR);
  const jsonFiles = files.filter(file => file.endsWith('.json'));
  
  const documents: DocumentMetadata[] = [];
  
  for (const file of jsonFiles) {
    try {
      const doc = await loadProcessedDocument(path.basename(file, '.json'));
      if (doc) {
        documents.push(doc.metadata);
      }
    } catch (error) {
      console.error(`Error loading document ${file}:`, error);
    }
  }
  
  return documents.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
};

// Delete processed document
export const deleteProcessedDocument = async (id: string): Promise<boolean> => {
  const processedPath = path.join(PROCESSED_DIR, `${id}.json`);
  
  try {
    // Load document to get original file path
    const doc = await loadProcessedDocument(id);
    
    // Delete processed document
    if (await fs.pathExists(processedPath)) {
      await fs.remove(processedPath);
    }
    
    // Delete original file if it exists
    if (doc && await fs.pathExists(doc.metadata.filePath)) {
      await fs.remove(doc.metadata.filePath);
    }
    
    return true;
  } catch (error) {
    console.error(`Error deleting document ${id}:`, error);
    return false;
  }
};