import { Schema, model, Document } from 'mongoose';
import { SBAApplication, ApplicationStatus, UserProvidedDocumentType, BankSubmissionStatus } from '../types/index.js';

const sbaApplicationSchema = new Schema<SBAApplication>({
  applicantData: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    businessName: {
      type: String,
      required: true,
      trim: true
    },
    businessPhoneNumber: {
      type: String,
      required: true,
      trim: true
    },
    yearFounded: {
      type: Schema.Types.Mixed,
      required: true
    },
    isUSCitizen: {
      type: Boolean,
      required: true
    },
    creditScore: {
      type: Number,
      required: true,
      min: 300,
      max: 850
    },
    userType: {
      type: String,
      required: true,
      enum: ['owner', 'buyer']
    },
    annualRevenue: {
      type: Number,
    },
    monthlyRevenue: {
      type: String
    },
    monthlyExpenses: {
      type: String
    },
    existingDebtPayment: {
      type: String
    },
    requestedLoanAmount: {
      type: String
    },
    loanPurpose: {
      type: String
    },
    ownerCreditScore: {
      type: String
    },
    purchasePrice: {
      type: String
    },
    availableCash: {
      type: String
    },
    businessSDE: {
      type: String
    },
    buyerCreditScore: {
      type: String
    },
    industryExperience: {
      type: String
    },
    businessYearsRunning: {
      type: Schema.Types.Mixed
    }
  },
  status: {
    type: String,
    enum: Object.values(ApplicationStatus),
    default: ApplicationStatus.SUBMITTED,
    required: true
  },

  // Bank Submissions
  banks: [{
    bank: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: Object.values(BankSubmissionStatus),
      default: BankSubmissionStatus.SUBMITTED,
      required: true
    },
    submittedAt: {
      type: Date,
      default: Date.now,
      required: true
    }
  }],

  // Offers from banks
  offers: [{
    bank: {
      type: String,
      required: true
    },
    offerDetails: {
      repaymentTermMonths: {
        type: Number,
        required: true
      },
      annualInterestRate: {
        type: Number,
        required: true
      },
      monthlyPayment: {
        type: Number,
        required: true
      },
      downPaymentRequired: {
        type: Number,
        required: true
      }
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending',
      required: true
    }
  }],

  // S3 Document Storage
  unsignedDocuments: [{
    fileName: { type: String, required: true },
    s3Key: { type: String, required: true },
    s3Url: { type: String },
    uploadedAt: { type: Date, default: Date.now }
  }],
  signedDocuments: [{
    fileName: { type: String, required: true },
    s3Key: { type: String, required: true },
    s3Url: { type: String },
    uploadedAt: { type: Date, default: Date.now },
    signedAt: { type: Date }
  }],
  userProvidedDocuments: [{
    fileType: {
      type: String,
      required: true,
      enum: Object.values(UserProvidedDocumentType)
    },
    fileName: { type: String, required: true },
    s3Key: { type: String, required: true },
    s3Url: { type: String },
    uploadedAt: { type: Date, default: Date.now }
  }],
  documentsUploadedToS3: {
    type: Boolean,
    default: false
  },
  s3UploadedAt: {
    type: Date
  },

  // Signing Metadata
  signingProvider: {
    type: String,
    enum: ['docusign', 'hellosign', 'adobe_sign', 'manual', null],
    default: null
  },
  signingRequestId: {
    type: String
  },
  signingStatus: {
    type: String,
    enum: ['not_started', 'pending', 'completed', 'declined', 'expired'],
    default: 'not_started'
  },
  signedBy: {
    type: String
  },
  signedDate: {
    type: Date
  },

  // Email Tracking
  emailSentAt: {
    type: Date
  },

  // Legacy fields (keep for backwards compatibility)
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
  }]
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt
});

// Add indexes for common queries
sbaApplicationSchema.index({ status: 1, createdAt: -1 });
sbaApplicationSchema.index({ 'applicantData.creditScore': 1 });
sbaApplicationSchema.index({ 'banks.bank': 1 });
sbaApplicationSchema.index({ 'banks.status': 1 });

export const Application = model<SBAApplication>('Application', sbaApplicationSchema);