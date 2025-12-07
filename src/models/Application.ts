import { Schema, model, Document } from 'mongoose';
import { SBAApplication, ApplicationStatus } from '../types/index.js';

// Extend the SBAApplication interface to include Mongoose Document methods
export interface ApplicationDocument extends Omit<SBAApplication, '_id'>, Document {
  applicationId: string;
}

const sbaApplicationSchema = new Schema<ApplicationDocument>({
  applicationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
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
    yearFounded: {
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

export const Application = model<ApplicationDocument>('Application', sbaApplicationSchema);