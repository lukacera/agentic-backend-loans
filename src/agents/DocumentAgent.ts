import { AgentState, createAgent, createResponse } from './BaseAgent.js';
import { 
  initializeStorage,
  createDocumentMetadata,
  processDocument,
  saveProcessedDocument,
  loadProcessedDocument,
  listProcessedDocuments,
  deleteProcessedDocument
} from '../services/documentProcessor.js';
import { 
  DocumentMetadata, 
  ProcessedDocument, 
  AnalysisType, 
  DocumentStatus,
  BaseAgentResponse
} from '../types';

// Create document agent
export const createDocumentAgent = (): AgentState => {
  return createAgent('DocumentAgent', {
    maxConcurrentTasks: 3,
    timeout: 60000 // 60 seconds
  });
};

// Initialize document agent
export const initializeDocumentAgent = async (): Promise<void> => {
  await initializeStorage();
  console.log('Document agent initialized successfully');
};

// Process uploaded document
export const processUploadedDocument = async (
  agent: AgentState,
  file: Express.Multer.File,
  analysisType: AnalysisType = AnalysisType.EXTRACTION,
  customPrompt?: string
): Promise<BaseAgentResponse<ProcessedDocument>> => {
  const startTime = Date.now();

  try {
    // Create document metadata
    const metadata = createDocumentMetadata(
      file.filename,
      file.originalname,
      file.mimetype,
      file.size,
      file.path
    );

    // Update metadata status
    metadata.status = DocumentStatus.PROCESSING;

    // Process document (extract text)
    const processingResult = await processDocument(metadata, analysisType);

    if (!processingResult.success) {
      return createResponse<ProcessedDocument>(
        false,
        undefined,
        processingResult.error,
        Date.now() - startTime
      );
    }

    // Update processing result with AI analysis
    // Create processed document
    metadata.status = DocumentStatus.PROCESSED;
    metadata.processedAt = new Date();

    const processedDocument: ProcessedDocument = {
      id: metadata.id,
      content: processingResult.extractedText,
      metadata,
      processingResult
    };

    // Save processed document
    await saveProcessedDocument(processedDocument);

    const totalProcessingTime = Date.now() - startTime;

    return createResponse(
      true,
      processedDocument,
      undefined,
      totalProcessingTime
    );

  } catch (error) {
    console.error('Document processing error:', error);
    return createResponse<ProcessedDocument>(
      false,
      undefined,
      error instanceof Error ? error.message : 'Unknown error occurred',
      Date.now() - startTime
    );
  }
};

// Get processed document by ID
export const getProcessedDocument = async (
  documentId: string
): Promise<BaseAgentResponse<ProcessedDocument>> => {
  try {
    const document = await loadProcessedDocument(documentId);
    
    if (!document) {
      return createResponse<ProcessedDocument>(
        false,
        undefined,
        'Document not found'
      );
    }

    return createResponse(true, document);
    
  } catch (error) {
    console.error('Error retrieving document:', error);
    return createResponse<ProcessedDocument>(
      false,
      undefined,
      error instanceof Error ? error.message : 'Failed to retrieve document'
    );
  }
};

// List all processed documents
export const getAllDocuments = async (): Promise<BaseAgentResponse<DocumentMetadata[]>> => {
  try {
    const documents = await listProcessedDocuments();
    return createResponse(true, documents);
    
  } catch (error) {
    console.error('Error listing documents:', error);
    return createResponse<DocumentMetadata[]>(
      false,
      undefined,
      error instanceof Error ? error.message : 'Failed to list documents'
    );
  }
};

// Delete document
export const removeDocument = async (
  documentId: string
): Promise<BaseAgentResponse<boolean>> => {
  try {
    const success = await deleteProcessedDocument(documentId);
    
    if (!success) {
      return createResponse(
        false,
        false,
        'Failed to delete document'
      );
    }

    return createResponse(true, true);
    
  } catch (error) {
    console.error('Error deleting document:', error);
    return createResponse(
      false,
      false,
      error instanceof Error ? error.message : 'Failed to delete document'
    );
  }
};

// Reprocess document with different analysis
export const reprocessDocument = async (
  agent: AgentState,
  documentId: string,
  analysisType: AnalysisType,
  customPrompt?: string
): Promise<BaseAgentResponse<ProcessedDocument>> => {
  const startTime = Date.now();

  try {
    // Load existing document
    const existingDoc = await loadProcessedDocument(documentId);
    
    if (!existingDoc) {
      return createResponse<ProcessedDocument>(
        false,
        undefined,
        'Document not found',
        Date.now() - startTime
      );
    }

    existingDoc.metadata.processedAt = new Date();

    // Save updated document
    await saveProcessedDocument(existingDoc);

    return createResponse(
      true,
      existingDoc,
      undefined,
      Date.now() - startTime
    );

  } catch (error) {
    console.error('Document reprocessing error:', error);
    return createResponse<ProcessedDocument>(
      false,
      undefined,
      error instanceof Error ? error.message : 'Failed to reprocess document',
      Date.now() - startTime
    );
  }
};

// Get agent capabilities
export const getDocumentAgentCapabilities = (): string[] => [
  'PDF document processing',
  'Word document processing (DOC, DOCX)',
  'Markdown file processing',
  'Plain text file processing',
  'AI-powered content analysis',
  'Document summarization',
  'Key point extraction',
  'Content categorization',
  'Sentiment analysis',
  'Entity extraction',
  'Custom analysis with prompts'
];