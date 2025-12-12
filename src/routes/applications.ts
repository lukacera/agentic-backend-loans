import express from 'express';
import multer from 'multer';
import {
  createApplication,
  getApplicationByBusinessName,
  getApplicationByPhone,
  getApplications,
  handleSignedDocuments,
  markUnsignedDocumentAsSigned,
  deleteSignedDocument,
  submitApplicationToBank,
  addUserProvidedDocuments,
  createOffer,
  updateOfferStatus,
  calculateSBAEligibilityForBuyer,
  calculateSBAEligibilityForOwner,
  calculateSBAEligibilityForBuyerVAPI,
  calculateSBAEligibilityForOwnerVAPI
} from '../services/applicationService.js';
import {
  ApplicationSubmissionRequest,
  ApplicationStatus,
  UserProvidedDocumentType,
  LoanChanceResult,
  SBAApplicationData
} from '../types/index.js';
import { Application } from '../models/Application.js';
import { generatePresignedUrl } from '../services/s3Service.js';
import { formatApplicationStatus } from '../utils/formatters.js';
import websocketService from '../services/websocket.js';

const router = express.Router();

const SAMPLE_CONTRACT_FILE_NAME = 'Sample_Contract.pdf';
const SAMPLE_CONTRACT_S3_KEY = 'Sample_Contract.pdf';

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

const extractToolCallArguments = (payload: any): Record<string, unknown> => {
  const aggregatedArgs: Record<string, unknown> = {};

  const toolCalls = payload?.message?.toolCalls;
  if (!Array.isArray(toolCalls)) {
    return aggregatedArgs;
  }

  for (const toolCall of toolCalls) {
    const rawArgs = toolCall?.function?.arguments;
    if (!rawArgs) {
      continue;
    }

    let parsedArgs: Record<string, unknown> | null = null;

    if (typeof rawArgs === 'string') {
      try {
        parsedArgs = JSON.parse(rawArgs);
      } catch (error) {
        console.error('⚠️ Failed to parse tool call arguments string:', error);
        continue;
      }
    } else if (typeof rawArgs === 'object') {
      parsedArgs = rawArgs as Record<string, unknown>;
    }

    if (parsedArgs) {
      Object.assign(aggregatedArgs, parsedArgs);
    }
  }
  return aggregatedArgs;
};

const extractBusinessName = (
  payload: any,
  preParsedArgs: Record<string, unknown> | null = null
): string | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const toolCallArgs = preParsedArgs ?? extractToolCallArguments(payload);
  const candidates = [
    payload.businessName,
    payload?.message?.businessName,
    payload?.message?.data?.businessName,
    payload?.message?.payload?.businessName,
    payload?.message?.input?.businessName,
    payload?.message?.toolCallList?.[0]?.arguments?.businessName,
    payload?.data?.businessName,
    payload?.payload?.businessName,
    payload?.fields?.businessName,
    toolCallArgs?.['businessName']
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
};

const extractBusinessPhone = (
  payload: any,
  preParsedArgs: Record<string, unknown> | null = null
): string | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const toolCallArgs = preParsedArgs ?? extractToolCallArguments(payload);
  const candidates = [
    payload.businessPhone,
    payload?.message?.businessPhone,
    payload?.message?.data?.businessPhone,
    payload?.message?.payload?.businessPhone,
    payload?.message?.toolCallList?.[0]?.arguments?.businessPhone,
    payload?.message?.toolCallList?.[0]?.arguments?.businessPhoneNumber,
    payload?.data?.businessPhone,
    payload?.payload?.businessPhone,
    payload?.fields?.businessPhone,
    payload.businessPhoneNumber,
    payload?.message?.data?.businessPhoneNumber,
    toolCallArgs?.['businessPhone'],
    toolCallArgs?.['businessPhoneNumber']
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
};

interface NormalizedFieldResult {
  valid: boolean;
  stringValue?: string;
  numberValue?: number;
}

const normalizeNonEmptyString = (value: unknown): NormalizedFieldResult => {
  if (value === undefined || value === null) {
    return { valid: false };
  }

  const stringValue = String(value).trim();

  if (stringValue.length === 0) {
    return { valid: false };
  }

  return { valid: true, stringValue };
};

const normalizeNumericInput = (value: unknown): NormalizedFieldResult => {
  if (value === undefined || value === null) {
    return { valid: false };
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return { valid: false };
    }
    return {
      valid: true,
      stringValue: value.toString(),
      numberValue: value
    };
  }

  const stringValue = String(value).trim();

  if (stringValue.length === 0) {
    return { valid: false };
  }

  const numberValue = Number(stringValue);

  if (Number.isNaN(numberValue) || !Number.isFinite(numberValue)) {
    return { valid: false };
  }

  return {
    valid: true,
    stringValue,
    numberValue
  };
};

// POST /api/applications - Submit new SBA loan application
router.post('/', async (req, res) => {
  try {
    const { name, businessName, businessPhone, creditScore, yearFounded }: ApplicationSubmissionRequest = req.body;
    
    // Validate required fields
    if (!name || !businessName || !businessPhone || !yearFounded) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, businessName, businessPhone, and yearFounded are required'
      });
    }
    
    // Validate field types and formats
    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Name must be a non-empty string'
      });
    }
    
    if (typeof businessName !== 'string' || businessName.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Business name must be a non-empty string'
      });
    }
    
    if (typeof businessPhone !== 'string' || businessPhone.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Business phone number must be a non-empty string'
      });
    }
    
    if (yearFounded < 0) {
      return res.status(400).json({
        success: false,
        error: 'Years in business must be a positive number'
      });
    }
    
    // Create application
    const userType = req.body.userType === 'owner' ? 'owner' : 'buyer';
    const applicationPayload: SBAApplicationData = {
      name: name.trim(),
      businessName: businessName.trim(),
      businessPhoneNumber: businessPhone.trim(),
      creditScore,
      yearFounded,
      isUSCitizen: req.body.isUSCitizen === true,
      userType
    };

    if (typeof req.body.annualRevenue === 'number') {
      applicationPayload.annualRevenue = req.body.annualRevenue;
    } else if (req.body.annualRevenue !== undefined && req.body.annualRevenue !== null) {
      const parsedAnnualRevenue = Number(req.body.annualRevenue);
      if (!Number.isNaN(parsedAnnualRevenue)) {
        applicationPayload.annualRevenue = parsedAnnualRevenue;
      }
    }

    if (userType === 'owner') {
      const ownerFieldConfigs: Array<{ key: string; type: 'numeric' | 'string' }> = [
        { key: 'monthlyRevenue', type: 'numeric' },
        { key: 'monthlyExpenses', type: 'numeric' },
        { key: 'existingDebtPayment', type: 'numeric' },
        { key: 'requestedLoanAmount', type: 'numeric' },
        { key: 'loanPurpose', type: 'string' },
        { key: 'ownerCreditScore', type: 'numeric' },
        { key: 'businessYearsRunning', type: 'numeric' }
      ];

      const ownerErrors: string[] = [];
      const ownerValues: Record<string, string | number> = {};

      for (const field of ownerFieldConfigs) {
        const rawValue = req.body[field.key];

        if (field.type === 'numeric') {
          const normalized = normalizeNumericInput(rawValue);

          if (!normalized.valid) {
            ownerErrors.push(`Field ${field.key} is required and must be a valid number for owner applications`);
            continue;
          }

          if (field.key === 'businessYearsRunning') {
            ownerValues[field.key] = normalized.numberValue ?? Number(normalized.stringValue as string);
          } else {
            ownerValues[field.key] = normalized.stringValue as string;
          }

        } else {
          const normalized = normalizeNonEmptyString(rawValue);

          if (!normalized.valid) {
            ownerErrors.push(`Field ${field.key} is required for owner applications`);
            continue;
          }

          ownerValues[field.key] = normalized.stringValue as string;
        }
      }

      if (ownerErrors.length > 0) {
        return res.status(400).json({
          success: false,
          error: ownerErrors.join('; ')
        });
      }

      applicationPayload.monthlyRevenue = ownerValues.monthlyRevenue as string;
      applicationPayload.monthlyExpenses = ownerValues.monthlyExpenses as string;
      applicationPayload.existingDebtPayment = ownerValues.existingDebtPayment as string;
      applicationPayload.requestedLoanAmount = ownerValues.requestedLoanAmount as string;
      applicationPayload.loanPurpose = ownerValues.loanPurpose as string;
      applicationPayload.ownerCreditScore = ownerValues.ownerCreditScore as string;
      applicationPayload.businessYearsRunning = ownerValues.businessYearsRunning as number;
    } else {
      const buyerFieldConfigs: Array<{ key: string; type: 'numeric' | 'string' }> = [
        { key: 'purchasePrice', type: 'numeric' },
        { key: 'availableCash', type: 'numeric' },
        { key: 'businessCashFlow', type: 'numeric' },
        { key: 'industryExperience', type: 'string' },
        { key: 'buyerCreditScore', type: 'numeric' },
        { key: 'businessYearsRunning', type: 'numeric' }
      ];

      const buyerErrors: string[] = [];
      const buyerValues: Record<string, string | number> = {};

      for (const field of buyerFieldConfigs) {
        const rawValue = req.body[field.key];

        if (field.type === 'numeric') {
          const normalized = normalizeNumericInput(rawValue);

          if (!normalized.valid) {
            buyerErrors.push(`Field ${field.key} is required and must be a valid number for buyer applications`);
            continue;
          }

          if (field.key === 'businessYearsRunning') {
            buyerValues[field.key] = normalized.numberValue ?? Number(normalized.stringValue as string);
          } else {
            buyerValues[field.key] = normalized.stringValue as string;
          }

        } else {
          const normalized = normalizeNonEmptyString(rawValue);

          if (!normalized.valid) {
            buyerErrors.push(`Field ${field.key} is required for buyer applications`);
            continue;
          }

          buyerValues[field.key] = normalized.stringValue as string;
        }
      }

      if (buyerErrors.length > 0) {
        return res.status(400).json({
          success: false,
          error: buyerErrors.join('; ')
        });
      }

      applicationPayload.purchasePrice = buyerValues.purchasePrice as string;
      applicationPayload.availableCash = buyerValues.availableCash as string;
      applicationPayload.businessCashFlow = buyerValues.businessCashFlow as string;
      applicationPayload.industryExperience = buyerValues.industryExperience as string;
      applicationPayload.buyerCreditScore = buyerValues.buyerCreditScore as string;
      applicationPayload.businessYearsRunning = buyerValues.businessYearsRunning as number;
    }

    const result = await createApplication(applicationPayload);
    
    res.status(201).json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('Error creating application:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// POST /api/applications/name - Get application by business name in request body
router.post('/name', async (req, res) => {
  try {
    const toolCallArgs = extractToolCallArguments(req.body);
    const businessName = extractBusinessName(req.body, toolCallArgs);
    const businessPhone = extractBusinessPhone(req.body, toolCallArgs);

    if (!businessName && !businessPhone) {
      return res.status(400).json({
        success: false,
        error: 'Business name or phone number is required'
      });
    }

    let application = null;

    if (businessName) {
      application = await getApplicationByBusinessName(businessName);
    }

    if (!application && businessPhone) {
      application = await getApplicationByPhone(businessPhone);
    }

    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found'
      });
    }

    const serializedApplication =
      typeof (application as any)?.toObject === 'function'
        ? (application as any).toObject()
        : application;
    const applicationString = formatApplicationStatus(serializedApplication);

    // Extract toolCallId from request body
    const toolCallId = req.body?.message?.toolCallList?.[0]?.id || 'unknown';

    return res.status(200).json({
      results: [
        {
          toolCallId: toolCallId,
          result: applicationString
        }
      ]
    });

  } catch (error) {
    console.error('Error fetching application by name:', error);
    res.status(200).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// GET /api/applications/documents/sample-contract - Generate pre-signed URL for sample contract
router.get('/documents/sample-contract', async (req, res) => {
  try {
    const expiresIn = parseInt(req.query.expiresIn as string, 10) || 3600;

    if (!SAMPLE_CONTRACT_S3_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Sample contract S3 key not configured'
      });
    }

    if (isNaN(expiresIn) || expiresIn <= 0 || expiresIn > 86400) {
      return res.status(400).json({
        success: false,
        error: 'expiresIn must be a positive integer up to 86400 seconds'
      });
    }

    const presignedUrl = await generatePresignedUrl(SAMPLE_CONTRACT_S3_KEY, expiresIn);

    res.json({
      success: true,
      data: {
        fileName: SAMPLE_CONTRACT_FILE_NAME,
        url: presignedUrl,
        expiresIn
      }
    });
  } catch (error) {
    console.error('Error fetching sample contract from S3:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// GET /api/applications/:applicationId - Get specific application
router.get('/:applicationId', async (req, res) => {
  try {
    const { applicationId } = req.params;
    
    const application = await Application.findById(applicationId)
      .populate({
      path: 'banks.bank',
      model: 'Bank',
      })
      .populate({
      path: 'offers.bank',
      model: 'Bank',
      })
      .exec();

    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found'
      });
    }
    
    res.json({
      success: true,
      data: application
    });
    
  } catch (error) {
    console.error('Error fetching application:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// GET /api/applications - Get all applications with pagination and filtering
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as ApplicationStatus;
    
    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pagination parameters. Page must be >= 1, limit must be 1-100'
      });
    }
    
    // Validate status if provided
    if (status && !Object.values(ApplicationStatus).includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${Object.values(ApplicationStatus).join(', ')}`
      });
    }
    
    const result = await getApplications(page, limit, status);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// GET /api/applications/status/counts - Get application counts by status
router.get('/status/counts', async (req, res) => {
  try {
    const statusCounts: Record<string, number> = {};
    
    // Get counts for each status
    for (const status of Object.values(ApplicationStatus)) {
      const result = await getApplications(1, 1, status);
      statusCounts[status] = result.total;
    }
    
    res.json({
      success: true,
      data: statusCounts
    });
    
  } catch (error) {
    console.error('Error fetching status counts:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// GET /api/applications/:applicationId/documents/unsigned - Explicit unsigned documents endpoint
router.get('/:applicationId/documents/unsigned', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const expiresIn = parseInt(req.query.expiresIn as string) || 3600; // 1 hour default

    const application = await Application.findById(applicationId);

    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found'
      });
    }

    if (application.unsignedDocuments.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No documents generated yet',
        status: application.status
      });
    }

    const documentsWithUrls = await Promise.all(
      application.unsignedDocuments.map(async (doc) => {
        const presignedUrl = await generatePresignedUrl(doc.s3Key, expiresIn);
        return {
          fileName: doc.fileName,
          url: presignedUrl,
          uploadedAt: doc.uploadedAt,
          expiresIn
        };
      })
    );

    res.json({
      success: true,
      data: {
        applicationId,
        status: application.status,
        documents: documentsWithUrls
      }
    });
  } catch (error) {
    console.error('Error fetching unsigned documents:', error);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

router.get('/:applicationId/documents/user-provided', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const expiresIn = parseInt(req.query.expiresIn as string) || 3600;
    const fileType = req.query.fileType as UserProvidedDocumentType | undefined;

    if (fileType && !Object.values(UserProvidedDocumentType).includes(fileType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid fileType. Must be one of: ${Object.values(UserProvidedDocumentType).join(', ')}`
      });
    }

    const application = await Application.findById(applicationId);

    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found'
      });
    }

    const userProvidedDocs = fileType
      ? application.userProvidedDocuments.filter((doc) => doc.fileType === fileType)
      : application.userProvidedDocuments;

    if (userProvidedDocs.length === 0) {
      return res.status(404).json({
        success: false,
        error: fileType ? `No documents found for fileType ${fileType}` : 'No user provided documents found',
        status: application.status
      });
    }

    const documentsWithUrls = await Promise.all(
      userProvidedDocs.map(async (doc) => {
        const presignedUrl = await generatePresignedUrl(doc.s3Key, expiresIn);
        return {
          fileName: doc.fileName,
          fileType: doc.fileType,
          url: presignedUrl,
          uploadedAt: doc.uploadedAt,
          expiresIn
        };
      })
    );

    res.json({
      success: true,
      data: {
        applicationId,
        status: application.status,
        documents: documentsWithUrls
      }
    });

  } catch (error) {
    console.error('Error fetching user provided documents:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

router.post('/:applicationId/documents/user-provided', upload.array('documents', 10), async (req, res) => {
  try {
    const { applicationId } = req.params;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    const extractTypeValues = (value: unknown): string[] => {
      if (Array.isArray(value)) {
        return value.map((entry) => String(entry));
      }
      if (typeof value === 'string') {
        return [value];
      }
      if (value === undefined || value === null) {
        return [];
      }
      return [String(value)];
    };

    const rawTypeValues = extractTypeValues(req.body?.fileTypes ?? req.body?.fileType)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (rawTypeValues.length === 0) {
      return res.status(400).json({
        success: false,
        error: `fileType is required and must be one of: ${Object.values(UserProvidedDocumentType).join(', ')}`
      });
    }

    if (rawTypeValues.length !== 1 && rawTypeValues.length !== files.length) {
      return res.status(400).json({
        success: false,
        error: 'Provide either a single fileType for all documents or one per document'
      });
    }

    const normalizedTypes = rawTypeValues.length === 1
      ? Array(files.length).fill(rawTypeValues[0])
      : rawTypeValues;

    if (normalizedTypes.length !== files.length) {
      return res.status(400).json({
        success: false,
        error: 'Number of fileType values must match uploaded files'
      });
    }

    const validTypes = new Set(Object.values(UserProvidedDocumentType));
    const invalidTypes = normalizedTypes.filter((value) => !validTypes.has(value as UserProvidedDocumentType));

    if (invalidTypes.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid fileType values: ${invalidTypes.join(', ')}`
      });
    }

    const documents = files.map((file, index) => ({
      fileName: file.originalname,
      buffer: file.buffer,
      fileType: normalizedTypes[index] as UserProvidedDocumentType
    }));

    const { application, uploadedDocuments } = await addUserProvidedDocuments(applicationId, documents);
    const serializedApplication = application.toObject();

    res.json({
      success: true,
      data: {
        applicationId,
        status: serializedApplication.status,
        uploadedDocuments,
        userProvidedDocuments: serializedApplication.userProvidedDocuments
      }
    });
  } catch (error) {
    console.error('Error uploading user provided documents:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';
    const statusCode =
      message === 'Application not found'
        ? 404
        : message === 'No documents provided'
          ? 400
          : message.endsWith('file has already been uploaded')
            ? 409
            : 500;

    res.status(statusCode).json({
      success: false,
      error: message
    });
  }
});

// POST /api/applications/:applicationId/documents/unsigned/mark-signed - Move unsigned document to signed collection
router.post('/:applicationId/documents/unsigned/mark-signed', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const {
      fileName,
      s3Key,
      signedBy,
      signingProvider,
      signingRequestId,
      signedAt,
      signedS3Key,
      signedS3Url
    } = req.body ?? {};

    if (!fileName && !s3Key) {
      return res.status(400).json({
        success: false,
        error: 'fileName or s3Key is required to mark a document as signed'
      });
    }

    const application = await markUnsignedDocumentAsSigned(applicationId, {
      fileName,
      s3Key,
      signedBy,
      signingProvider,
      signingRequestId,
      signedAt,
      signedS3Key,
      signedS3Url
    });

    res.json({
      success: true,
      data: {
        applicationId,
        status: application.status,
        unsignedDocuments: application.unsignedDocuments,
        signedDocuments: application.signedDocuments
      }
    });

  } catch (error) {
    console.error('Error marking unsigned document as signed:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';
    const statusCode = message === 'Application not found' || message === 'Unsigned document not found'
      ? 404
      : message === 'Document identifier (fileName or s3Key) is required'
        ? 400
        : 500;

    res.status(statusCode).json({
      success: false,
      error: message
    });
  }
});

// POST /api/applications/:applicationId/documents/signed - Upload signed documents
router.post('/:applicationId/documents/signed', upload.array('documents', 10), async (req, res) => {
  try {
    const { applicationId } = req.params;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    // Optional signing metadata from request body
    const signingMetadata = {
      signedBy: req.body.signedBy,
      signingProvider: req.body.signingProvider,
      signingRequestId: req.body.signingRequestId
    };

    // Convert files to buffer format
    const signedDocumentBuffers = files.map(file => ({
      fileName: file.originalname,
      buffer: file.buffer
    }));

    const result = await handleSignedDocuments(
      applicationId,
      signedDocumentBuffers,
      signingMetadata
    );

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error uploading signed documents:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// DELETE /api/applications/:applicationId/documents/signed - Delete signed document from DB and S3
router.delete('/:applicationId/documents/signed', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const fileName = (req.body?.fileName || req.query.fileName) as string | undefined;
    const s3Key = (req.body?.s3Key || req.query.s3Key) as string | undefined;

    if (!fileName && !s3Key) {
      return res.status(400).json({
        success: false,
        error: 'fileName or s3Key is required to delete a signed document'
      });
    }

    const application = await deleteSignedDocument(applicationId, {
      fileName,
      s3Key
    });

    res.json({
      success: true,
      data: {
        applicationId,
        status: application.status,
        signedDocuments: application.signedDocuments
      }
    });

  } catch (error) {
    console.error('Error deleting signed document:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';
    const statusCode = message === 'Application not found' || message === 'Signed document not found'
      ? 404
      : message === 'Document identifier (fileName or s3Key) is required'
        ? 400
        : 500;

    res.status(statusCode).json({
      success: false,
      error: message
    });
  }
});

// GET /api/applications/:applicationId/documents/signed - Get signed document URLs
router.get('/:applicationId/documents/signed', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const expiresIn = parseInt(req.query.expiresIn as string) || 3600;

    const application = await Application.findById(applicationId);
    
    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found'
      });
    }

    if (application.signedDocuments.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No signed documents found',
        status: application.status
      });
    }

    const documentsWithUrls = await Promise.all(
      application.signedDocuments.map(async (doc) => {
        const presignedUrl = await generatePresignedUrl(doc.s3Key, expiresIn);
        return {
          fileName: doc.fileName,
          url: presignedUrl,
          uploadedAt: doc.uploadedAt,
          signedAt: doc.signedAt,
          expiresIn
        };
      })
    );

    res.json({
      success: true,
      data: {
        applicationId,
        status: application.status,
        signedBy: application.signedBy,
        signedDate: application.signedDate,
        documents: documentsWithUrls
      }
    });

  } catch (error) {
    console.error('Error fetching signed documents:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// POST /api/applications/:applicationId/submit-to-bank - Send signed docs to bank
router.post('/:applicationId/submit-to-bank', async (req, res) => {
  try {
    const { applicationId } = req.params;

    const result = await submitApplicationToBank(applicationId);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error submitting to bank:', error);
    res.status(500).json({
      success: false,
    error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// POST /api/applications/:applicationId/offers - Create new offer
router.post('/:applicationId/offers', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { bankId, offerDetails } = req.body;

    // Validate required fields
    if (!bankId || typeof bankId !== 'string' || bankId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'bankId is required and must be a non-empty string'
      });
    }

    if (!offerDetails || typeof offerDetails !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'offerDetails is required and must be an object'
      });
    }

    // Validate offerDetails fields
    const { repaymentTermMonths, annualInterestRate, monthlyPayment, downPaymentRequired } = offerDetails;

    if (typeof repaymentTermMonths !== 'number' || repaymentTermMonths <= 0) {
      return res.status(400).json({
        success: false,
        error: 'repaymentTermMonths must be a positive number'
      });
    }

    if (typeof annualInterestRate !== 'number' || annualInterestRate <= 0) {
      return res.status(400).json({
        success: false,
        error: 'annualInterestRate must be a positive number'
      });
    }

    if (typeof monthlyPayment !== 'number' || monthlyPayment <= 0) {
      return res.status(400).json({
        success: false,
        error: 'monthlyPayment must be a positive number'
      });
    }

    if (typeof downPaymentRequired !== 'number' || downPaymentRequired < 0) {
      return res.status(400).json({
        success: false,
        error: 'downPaymentRequired must be a non-negative number'
      });
    }

    // Create the offer
    const application = await createOffer(applicationId, bankId.trim(), {
      repaymentTermMonths,
      annualInterestRate,
      monthlyPayment,
      downPaymentRequired
    });

    // Get the newly created offer (last one in the array)
    const createdOffer = application.offers[application.offers.length - 1];

    res.status(201).json({
      success: true,
      data: {
        applicationId,
        offer: createdOffer
      }
    });

  } catch (error) {
    console.error('Error creating offer:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';
    const statusCode = message === 'Application not found' ? 404 : 500;

    res.status(statusCode).json({
      success: false,
      error: message
    });
  }
});

// PATCH /api/applications/:applicationId/offers/:offerId - Update offer status (accept/reject)
router.patch('/:applicationId/offers/:offerId', async (req, res) => {
  try {
    const { applicationId, offerId } = req.params;
    const { status } = req.body;

    // Validate status
    if (!status || !['accepted', 'declined'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status is required and must be either "accepted" or "declined"'
      });
    }

    // Update offer status
    const application = await updateOfferStatus(applicationId, offerId, status);

    // Find the updated offer
    const updatedOffer = application.offers.find(
      (o) => o._id && o._id.toString() === offerId
    );

    res.json({
      success: true,
      data: {
        applicationId,
        offerId,
        offer: updatedOffer,
        message: `Offer ${status} successfully`
      }
    });

  } catch (error) {
    console.error('Error updating offer status:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';
    const statusCode =
      message === 'Application not found' || message === 'Offer not found'
        ? 404
        : 500;

    res.status(statusCode).json({
      success: false,
      error: message
    });
  }
});

// Calculate SBA eligibility and approval chances
router.post('/calculate-chances', async (req, res) => {
  try {
    const data = req.body;
    const toolCallArgs = extractToolCallArguments(req.body);

    // Check if type field exists to determine buyer vs owner flow
    const applicationType = toolCallArgs.type as string || 'buyer';

    let chanceResult: LoanChanceResult;
    let chanceResultVapi: string;
    if (applicationType.toLowerCase() === 'buyer') {
      // Buyer flow - validate buyer fields
      if (!toolCallArgs.purchasePrice || !toolCallArgs.availableCash || !toolCallArgs.businessCashFlow) {
        return res.status(400).json({
          error: 'Missing required fields for buyer: purchasePrice, availableCash, businessCashFlow'
        });
      }

      chanceResult = calculateSBAEligibilityForBuyer(toolCallArgs as any);
      chanceResultVapi = calculateSBAEligibilityForBuyerVAPI(toolCallArgs as any);
    } else {
      // Owner flow - validate owner fields
      if (!toolCallArgs.monthlyRevenue || !toolCallArgs.monthlyExpenses || !toolCallArgs.requestedLoanAmount) {
        return res.status(400).json({
          error: 'Missing required fields for owner: monthlyRevenue, monthlyExpenses, requestedLoanAmount'
        });
      }

      chanceResult = calculateSBAEligibilityForOwner(toolCallArgs as any);
      chanceResultVapi = calculateSBAEligibilityForOwnerVAPI(toolCallArgs as any);
    }

    // Broadcast structured result via websocket
    websocketService.broadcast('calculate-chances', {
      timestamp: new Date().toISOString(),
      source: 'calculate-chances',
      result: chanceResult
    }, ["global"]);

    websocketService.broadcast('form-reveal', {
      timestamp: new Date().toISOString(),
      source: 'backend'
    }, ["global"]);

    const toolCallId = data.message?.toolCallList?.[0]?.id || 'unknown';

    res.status(200).json({
      results: [{
        toolCallId: toolCallId,
        result: chanceResultVapi
      }]
    });

  } catch (error) {
    console.error('Error checking SBA eligibility:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check SBA eligibility'
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'SBA Applications API is healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;