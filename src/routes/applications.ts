import express from 'express';
import { 
  createApplication, 
  getApplication, 
  getApplicationByBusinessName,
  getApplicationByPhone,
  getApplications 
} from '../services/applicationService.js';
import { 
  ApplicationSubmissionRequest, 
  ApplicationStatus 
} from '../types/index.js';

const router = express.Router();

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

// POST /api/applications - Submit new SBA loan application
router.post('/', async (req, res) => {
  try {
    const { name, businessName, businessPhone, creditScore, annualRevenue, yearFounded }: ApplicationSubmissionRequest = req.body;
    
    // Validate required fields
    if (!name || !businessName || !businessPhone || !creditScore || !annualRevenue || !yearFounded) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, businessName, businessPhone, creditScore, annualRevenue, and yearFounded are required'
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
    
    // Validate field ranges
    if (creditScore < 300 || creditScore > 850) {
      return res.status(400).json({
        success: false,
        error: 'Credit score must be between 300 and 850'
      });
    }
    
    if (annualRevenue < 0) {
      return res.status(400).json({
        success: false,
        error: 'Annual revenue must be a positive number'
      });
    }
    
    if (yearFounded < 0) {
      return res.status(400).json({
        success: false,
        error: 'Years in business must be a positive number'
      });
    }
    
    // Create application
    const result = await createApplication({
      name: name.trim(),
      businessName: businessName.trim(),
      businessPhoneNumber: businessPhone.trim(),
      creditScore,
      annualRevenue,
      yearFounded
    });
    
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

    console.log('Request body:', req.body);
    console.log('Extracted tool call arguments:', toolCallArgs);
    console.log('Extracted businessName:', businessName);
    console.log('Extracted businessPhone:', businessPhone);
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
      console.log('Searching application by phone number:', businessPhone);
      application = await getApplicationByPhone(businessPhone);
    }

    if (!application) {
      console.log('No application found for businessName or businessPhone');
      return res.status(404).json({
        success: false,
        error: 'Application not found'
      });
    }

    console.log('Found application:', application);
    res.json({
      success: true,
      data: application
    });

  } catch (error) {
    console.error('Error fetching application by name:', error);
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
    
    const application = await getApplication(applicationId);
    
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

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'SBA Applications API is healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;