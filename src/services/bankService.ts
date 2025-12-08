import { Bank } from '../models/Bank.js';
import { CreateBankRequest, UpdateBankRequest, BankListResponse } from '../types/index.js';

// CREATE
export const createBank = async (bankData: CreateBankRequest) => {
  try {
    const bank = new Bank(bankData);
    await bank.save();
    return bank;
  } catch (error: any) {
    if (error.code === 11000) {
      throw new Error('A bank with this name already exists');
    }
    if (error.name === 'ValidationError') {
      throw new Error(`Validation failed: ${error.message}`);
    }
    throw error;
  }
};

// READ - Single by ID
export const getBank = async (bankId: string) => {
  try {
    return await Bank.findById(bankId).exec();
  } catch (error) {
    console.error('Error fetching bank:', error);
    throw error;
  }
};

// READ - List with pagination and optional filters
export const getBanks = async (
  page: number = 1,
  limit: number = 10,
  filters?: {
    maxCreditScore?: number;
    minYearsInBusiness?: number;
  }
): Promise<BankListResponse> => {
  try {
    const query: any = {};

    if (filters?.maxCreditScore) {
      query['requirements.minimumCreditScore'] = { $lte: filters.maxCreditScore };
    }
    if (filters?.minYearsInBusiness !== undefined) {
      query['requirements.minimumYearsInBusiness'] = { $lte: filters.minYearsInBusiness };
    }

    const skip = (page - 1) * limit;

    const [banks, total] = await Promise.all([
      Bank.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Bank.countDocuments(query).exec()
    ]);

    return {
      banks,
      total,
      page,
      pages: Math.ceil(total / limit)
    };
  } catch (error) {
    console.error('Error fetching banks:', error);
    throw error;
  }
};

// UPDATE
export const updateBank = async (bankId: string, updateData: UpdateBankRequest) => {
  try {
    const bank = await Bank.findByIdAndUpdate(
      bankId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).exec();
    return bank;
  } catch (error: any) {
    if (error.code === 11000) {
      throw new Error('A bank with this name already exists');
    }
    if (error.name === 'ValidationError') {
      throw new Error(`Validation failed: ${error.message}`);
    }
    throw error;
  }
};

// DELETE
export const deleteBank = async (bankId: string) => {
  try {
    const bank = await Bank.findByIdAndDelete(bankId).exec();
    return bank;
  } catch (error) {
    console.error('Error deleting bank:', error);
    throw error;
  }
};

// HELPER - Search by name (case-insensitive)
export const getBankByName = async (name: string) => {
  try {
    return await Bank.findOne({
      name: { $regex: `^${name}$`, $options: 'i' }
    }).exec();
  } catch (error) {
    console.error('Error fetching bank by name:', error);
    throw error;
  }
};
