import express from 'express';
import multer from 'multer';
import path from 'path';
import * as fs from 'fs-extra';
import { 
  createDocumentAgent,
  initializeDocumentAgent,
  processUploadedDocument,
  getProcessedDocument,
  getAllDocuments,
  removeDocument,
  reprocessDocument,
  getDocumentAgentCapabilities
} from '../agents/DocumentAgent.js';
import { getAgentStatus } from '../agents/BaseAgent.js';
import { AnalysisType, SupportedMimeTypes } from '../types/documents.js';
import { 
  extractFormFields, 
  fillPDFForm, 
  mapDataWithAI,
  initializePDFDirectories
} from '../services/pdfFormProcessor.js';
import { PDFFormData } from '../types/pdfForms.js';

const router = express.Router();

// Initialize document agent
const documentAgent = createDocumentAgent();

// Initialize storage on startup
initializeDocumentAgent().catch(console.error);
initializePDFDirectories().catch(console.error);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = Object.values(SupportedMimeTypes);
  
  if (allowedTypes.includes(file.mimetype as SupportedMimeTypes)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}. Supported types: ${allowedTypes.join(', ')}`));
  }
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Routes

// GET /api/docs - Agent info and capabilities
router.get('/', (req, res) => {
  const status = getAgentStatus(documentAgent);
  const capabilities = getDocumentAgentCapabilities();
  
  res.json({
    agent: 'DocumentAgent',
    status,
    capabilities,
    endpoints: {
      upload: 'POST /api/docs/upload',
      process: 'POST /api/docs/process',
      getDocument: 'GET /api/docs/:id',
      listDocuments: 'GET /api/docs/list',
      deleteDocument: 'DELETE /api/docs/:id',
      status: 'GET /api/docs/status'
    },
    supportedFileTypes: Object.values(SupportedMimeTypes),
    analysisTypes: Object.values(AnalysisType)
  });
});

// POST /api/docs/upload - Upload and process document
router.post('/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please provide a document file'
      });
    }

    const analysisType = (req.body.analysisType as AnalysisType) || AnalysisType.EXTRACTION;
    const customPrompt = req.body.customPrompt;

    // Validate analysis type
    if (!Object.values(AnalysisType).includes(analysisType)) {
      return res.status(400).json({
        error: 'Invalid analysis type',
        message: `Supported types: ${Object.values(AnalysisType).join(', ')}`
      });
    }

    const result = await processUploadedDocument(
      documentAgent,
      req.file,
      analysisType,
      customPrompt
    );

    if (!result.success) {
      return res.status(500).json({
        error: 'Processing failed',
        message: result.error,
        processingTime: result.processingTime
      });
    }

    res.json({
      message: 'Document processed successfully',
      document: result.data,
      processingTime: result.processingTime
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/docs/list - List all processed documents
router.get('/list', async (req, res) => {
  try {
    const result = await getAllDocuments();
    
    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to list documents',
        message: result.error
      });
    }

    res.json({
      documents: result.data,
      count: result.data?.length || 0
    });

  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({
      error: 'Failed to list documents',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/docs/process/:id - Reprocess document with different analysis
router.post('/process/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { analysisType, customPrompt } = req.body;

    if (!analysisType || !Object.values(AnalysisType).includes(analysisType)) {
      return res.status(400).json({
        error: 'Invalid or missing analysis type',
        message: `Supported types: ${Object.values(AnalysisType).join(', ')}`
      });
    }

    const result = await reprocessDocument(
      documentAgent,
      id,
      analysisType,
      customPrompt
    );

    if (!result.success) {
      return res.status(404).json({
        error: 'Reprocessing failed',
        message: result.error,
        processingTime: result.processingTime
      });
    }

    res.json({
      message: 'Document reprocessed successfully',
      document: result.data,
      processingTime: result.processingTime
    });

  } catch (error) {
    console.error('Reprocess error:', error);
    res.status(500).json({
      error: 'Reprocessing failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/docs/:id - Delete document
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await removeDocument(id);

    if (!result.success) {
      return res.status(404).json({
        error: 'Delete failed',
        message: result.error
      });
    }

    res.json({
      message: 'Document deleted successfully',
      deleted: true
    });

  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({
      error: 'Delete failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/docs/status - Get agent status
router.get('/status', (req, res) => {
  const status = getAgentStatus(documentAgent);
  
  res.json({
    agent: 'DocumentAgent',
    status,
    timestamp: new Date().toISOString()
  });
});

// PDF FORM FILLING ENDPOINTS

// GET /api/docs/forms/:filename/fields - Analyze PDF form fields
router.get('/forms/:filename/fields', async (req, res) => {
  try {
    const { filename } = req.params;
    const templatePath = path.join(process.cwd(), 'templates', filename);
    if (!(await fs.pathExists(templatePath))) {
      return res.status(404).json({
        error: 'Template not found',
        message: `Template ${filename} does not exist`
      });
    }

    const analysis = await extractFormFields(templatePath);
    
    res.json({
      message: 'Form analysis completed',
      template: filename,
      analysis,
      instructions: {
        fillForm: `POST /api/docs/forms/${filename}/fill`,
        autoFill: `POST /api/docs/forms/${filename}/auto-fill`
      }
    });

  } catch (error) {
    console.error('Form analysis error:', error);
    res.status(500).json({
      error: 'Form analysis failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/docs/forms/:filename/fill - Fill PDF form with exact field mapping
router.post('/forms/:filename/fill', async (req, res) => {
  try {
    const { filename } = req.params;
    const { data, outputFileName } = req.body;
    
    if (!data || typeof data !== 'object') {
      return res.status(400).json({
        error: 'Invalid data',
        message: 'Please provide form data as an object with field names as keys'
      });
    }

    const templatePath = path.join(process.cwd(), 'templates', filename);
    
    if (!(await fs.pathExists(templatePath))) {
      return res.status(404).json({
        error: 'Template not found',
        message: `Template ${filename} does not exist`
      });
    }

    const result = await fillPDFForm(templatePath, data as PDFFormData, outputFileName);
    
    if (!result.success) {
      return res.status(500).json({
        error: 'Form filling failed',
        message: result.error,
        processingTime: result.processingTime
      });
    }

    res.json({
      message: 'Form filled successfully',
      result,
      downloadPath: result.outputPath,
      fieldsProcessed: result.fieldsProcessed,
      unmappedFields: result.unmappedFields
    });

  } catch (error) {
    console.error('Form filling error:', error);
    res.status(500).json({
      error: 'Form filling failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/docs/forms/:filename/auto-fill - AI-assisted form filling
router.post('/forms/:filename/auto-fill', async (req, res) => {
  try {
    const { filename } = req.params;
    const { userData, customInstructions, outputFileName } = req.body;
    
    if (!userData || typeof userData !== 'object') {
      return res.status(400).json({
        error: 'Invalid user data',
        message: 'Please provide userData as an object'
      });
    }

    const templatePath = path.join(process.cwd(), 'templates', filename);
    
    if (!(await fs.pathExists(templatePath))) {
      return res.status(404).json({
        error: 'Template not found',
        message: `Template ${filename} does not exist`
      });
    }

    // First, analyze the form to get field structure
    const analysis = await extractFormFields(templatePath);
    // Use AI to map user data to form fields
    const mappedData = await mapDataWithAI(
      analysis.fields,
      userData,
      documentAgent,
      customInstructions
    );
    console.log('Mapped data for auto-fill:', mappedData);
    // Fill the form with mapped data
    const result = await fillPDFForm(templatePath, mappedData, outputFileName);
    
    if (!result.success) {
      return res.status(500).json({
        error: 'Auto-fill failed',
        message: result.error,
        processingTime: result.processingTime
      });
    }

    res.json({
      message: 'Form auto-filled successfully',
      result,
      mappedData,
      downloadPath: result.outputPath,
      fieldsProcessed: result.fieldsProcessed,
      unmappedFields: result.unmappedFields,
      formAnalysis: analysis
    });

  } catch (error) {
    console.error('Auto-fill error:', error);
    res.status(500).json({
      error: 'Auto-fill failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/docs/templates - List available templates
router.get('/templates', async (req, res) => {
  try {
    const templatesDir = path.join(process.cwd(), 'templates');
    console.log('Templates directory:', templatesDir);
    const files = await fs.readdir(templatesDir);
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
    
    const templates = await Promise.all(
      pdfFiles.map(async (file) => {
        try {
          const filePath = path.join(templatesDir, file);
          const stats = await fs.stat(filePath);
          const analysis = await extractFormFields(filePath);
          
          return {
            filename: file,
            size: stats.size,
            lastModified: stats.mtime,
            fieldCount: analysis.totalFields,
            estimatedTime: analysis.estimatedCompletionTime
          };
        } catch (error) {
          return {
            filename: file,
            error: 'Could not analyze form'
          };
        }
      })
    );
    
    res.json({
      templates,
      count: templates.length,
      instructions: {
        analyzeForm: 'GET /api/docs/forms/{filename}/fields',
        fillForm: 'POST /api/docs/forms/{filename}/fill',
        autoFill: 'POST /api/docs/forms/{filename}/auto-fill'
      }
    });

  } catch (error) {
    console.error('Templates listing error:', error);
    res.status(500).json({
      error: 'Failed to list templates',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;