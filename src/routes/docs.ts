import express from 'express';
import multer from 'multer';
import path from 'path';
import * as fs from 'fs-extra';
import { 
  createDocumentAgent,
  initializeDocumentAgent,
} from '../agents/DocumentAgent.js';
import { PDFFormData, SupportedMimeTypes } from '../types';
import { 
  extractFormFields, 
  fillPDFForm, 
  mapDataWithAI,
  initializePDFDirectories
} from '../services/pdfFormProcessor.js';

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