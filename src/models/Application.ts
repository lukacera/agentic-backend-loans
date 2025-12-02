import { Schema, model, Document } from 'mongoose';
import { SBAApplication, ApplicationStatus } from '../types/index.js';

const sbaApplicationSchema = new Schema({
  applicationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  applicantData: {
    creditScore: {
      type: Number,
      required: true,
      min: 300,
      max: 850
    },
    annualRevenue: {
      type: Number,
      required: true,
      min: 0
    },
    yearsInBusiness: {
      type: Number,
      required: true,
      min: 0
    }
  },
  status: {
    type: String,
    enum: Object.values(ApplicationStatus),
    default: ApplicationStatus.SUBMITTED,
    required: true
  },
  documentsGenerated: {
    type: Boolean,
    default: false
  },
  emailSent: {
    type: Boolean,
    default: false
  },
  generatedDocuments: [{
    type: String
  }],
  bankEmail: {
    type: String,
    required: true,
    default: 'lukaceranic38@gmail.com'
  }
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt
});

// Add indexes for common queries
sbaApplicationSchema.index({ status: 1, createdAt: -1 });
sbaApplicationSchema.index({ 'applicantData.creditScore': 1 });

export const Application = model('Application', sbaApplicationSchema);