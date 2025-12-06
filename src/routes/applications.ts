import express from 'express';
import { 
  createApplication, 
  getApplication, 
  getApplicationByBusinessName,
  getApplications 
} from '../services/applicationService.js';
import { 
  ApplicationSubmissionRequest, 
  ApplicationStatus 
} from '../types/index.js';

const router = express.Router();

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

// GET /api/applications/name/:businessName - Get application by applicant name
router.get('/name/:businessName', async (req, res) => {
  try {
    const { businessName } = req.params;

    if (!businessName || businessName.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Applicant name is required'
      });
    }

    const application = await getApplicationByBusinessName(businessName);

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