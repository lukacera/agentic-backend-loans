import { Schema, model } from 'mongoose';
import { Bank as BankType } from '../types';

const bankSchema = new Schema<BankType>({
  name: {
    type: String,
    required: [true, 'Bank name is required'],
    trim: true,
    unique: true,  // Prevent duplicate bank names
    minlength: [2, 'Bank name must be at least 2 characters'],
    maxlength: [100, 'Bank name cannot exceed 100 characters']
  },
  logo: {
    type: String,
    required: false,
    trim: true,
    match: [/^https?:\/\/.+/, 'Logo must be a valid URL']
  },
  contacts: {
    name: {
      type: String,
      required: [true, 'Contact name is required'],
      trim: true,
      minlength: [2, 'Contact name must be at least 2 characters']
    },
    email: {
      type: String,
      required: [true, 'Contact email is required'],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
    },
    position: {
      type: String,
      required: [true, 'Contact position is required'],
      trim: true
    }
  },
  requirements: {
    minimumCreditScore: {
      type: Number,
      required: [true, 'Minimum credit score is required'],
      min: [300, 'Credit score must be at least 300'],
      max: [850, 'Credit score cannot exceed 850']
    },
    minimumYearsInBusiness: {
      type: Number,
      required: [true, 'Minimum years in business is required'],
      min: [0, 'Years in business cannot be negative']
    },
    documentsRequired: {
      taxReturn: {
        type: Boolean,
        required: true,
        default: false
      },
      pAndL: {
        type: Boolean,
        required: true,
        default: false
      }
    }
  }
}, {
  timestamps: true
});

// Indexes for performance
bankSchema.index({ name: 1 });
bankSchema.index({ 'requirements.minimumCreditScore': 1 });
bankSchema.index({ createdAt: -1 });

export const Bank = model<BankType>('Bank', bankSchema);
