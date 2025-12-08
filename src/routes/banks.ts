import express from 'express';
import {
  createBank,
  getBank,
  getBanks,
  updateBank,
  deleteBank,
  getBankByName
} from '../services/bankService.js';
import { CreateBankRequest, UpdateBankRequest } from '../types/index.js';

const router = express.Router();

// CREATE - POST /api/banks
router.post('/', async (req, res) => {
  try {
    const bankData: CreateBankRequest = req.body;

    // Validate required top-level fields
    if (!bankData.name || !bankData.contacts || !bankData.requirements) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, contacts, and requirements are required'
      });
    }

    // Validate contacts nested fields
    if (!bankData.contacts.name || !bankData.contacts.email || !bankData.contacts.position) {
      return res.status(400).json({
        success: false,
        error: 'Missing required contact fields: name, email, and position are required'
      });
    }

    // Validate requirements nested fields
    if (
      bankData.requirements.minimumCreditScore === undefined ||
      bankData.requirements.minimumYearsInBusiness === undefined ||
      !bankData.requirements.documentsRequired
    ) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields in requirements'
      });
    }

    const bank = await createBank(bankData);

    res.status(201).json({
      success: true,
      data: bank
    });
  } catch (error: any) {
    console.error('Error creating bank:', error);
    const statusCode = error.message.includes('already exists') ? 409 : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// READ (Single) - GET /api/banks/:bankId
router.get('/:bankId', async (req, res) => {
  try {
    const { bankId } = req.params;
    const bank = await getBank(bankId);

    if (!bank) {
      return res.status(404).json({
        success: false,
        error: 'Bank not found'
      });
    }

    res.json({
      success: true,
      data: bank
    });
  } catch (error) {
    console.error('Error fetching bank:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// READ (List) - GET /api/banks?page=1&limit=10&maxCreditScore=700
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const maxCreditScore = req.query.maxCreditScore
      ? parseInt(req.query.maxCreditScore as string)
      : undefined;
    const minYearsInBusiness = req.query.minYearsInBusiness
      ? parseInt(req.query.minYearsInBusiness as string)
      : undefined;

    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pagination parameters. Page must be >= 1, limit must be 1-100'
      });
    }

    const result = await getBanks(page, limit, {
      maxCreditScore,
      minYearsInBusiness
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching banks:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// UPDATE - PATCH /api/banks/:bankId
router.patch('/:bankId', async (req, res) => {
  try {
    const { bankId } = req.params;
    const updateData: UpdateBankRequest = req.body;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No update fields provided'
      });
    }

    const bank = await updateBank(bankId, updateData);

    if (!bank) {
      return res.status(404).json({
        success: false,
        error: 'Bank not found'
      });
    }

    res.json({
      success: true,
      data: bank
    });
  } catch (error: any) {
    console.error('Error updating bank:', error);
    const statusCode = error.message.includes('already exists') ? 409 : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// DELETE - DELETE /api/banks/:bankId
router.delete('/:bankId', async (req, res) => {
  try {
    const { bankId } = req.params;
    const bank = await deleteBank(bankId);

    if (!bank) {
      return res.status(404).json({
        success: false,
        error: 'Bank not found'
      });
    }

    res.json({
      success: true,
      message: 'Bank deleted successfully',
      data: bank
    });
  } catch (error) {
    console.error('Error deleting bank:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// SEARCH - GET /api/banks/search/:name
router.get('/search/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const bank = await getBankByName(name);

    if (!bank) {
      return res.status(404).json({
        success: false,
        error: 'Bank not found'
      });
    }

    res.json({
      success: true,
      data: bank
    });
  } catch (error) {
    console.error('Error searching bank:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router;
