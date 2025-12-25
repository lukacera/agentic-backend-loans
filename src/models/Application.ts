import { Schema, model, Document } from 'mongoose';
import { SBAApplication, ApplicationStatus, UserProvidedDocumentType, BankSubmissionStatus, DefaultDocumentType } from '../types/index.js';

// Sub-schemas for SBA form fields (must match formFields.ts definitions)
const Sba1919FieldsSchema = new Schema(
  {
    // Basic Business Information (Required)
    applicantname: { type: String, default: '' },
    operatingnbusname: { type: String, default: '' },
    busTIN: { type: String, default: '' },
    busphone: { type: String, default: '' },
    busAddr: { type: String, default: '' },

    // Basic Business Information (Optional)
    yearbeginoperations: { type: String, default: '' },
    OC: { type: String, default: '' },
    EPC: { type: String, default: '' },
    dba: { type: String, default: '' },
    PrimarIndustry: { type: String, default: '' },
    UniqueEntityID: { type: String, default: '' },
    projAddr: { type: String, default: '' },
    pocName: { type: String, default: '' },
    pocEmail: { type: String, default: '' },

    // Entity Type Checkboxes
    soleprop: { type: Boolean, default: false },
    partnership: { type: Boolean, default: false },
    ccorp: { type: Boolean, default: false },
    scorp: { type: Boolean, default: false },
    llc: { type: Boolean, default: false },
    etother: { type: Boolean, default: false },
    entityother: { type: String, default: '' },

    // Special Ownership Type Checkboxes
    ownESOP: { type: Boolean, default: false },
    own401k: { type: Boolean, default: false },
    ownCooperative: { type: Boolean, default: false },
    ownNATribe: { type: Boolean, default: false },
    ownOther: { type: Boolean, default: false },
    specOwnTypeOther: { type: String, default: '' },

    // Employment & Financial Info
    existEmp: { type: String, default: '' },
    fteJobs: { type: String, default: '' },
    debtAmt: { type: String, default: '' },
    purchConstr: { type: String, default: '' },
    purchAmt: { type: String, default: '' },

    // Owner 1
    ownName1: { type: String, default: '' },
    ownTitle1: { type: String, default: '' },
    ownPerc1: { type: String, default: '' },
    ownTin1: { type: String, default: '' },
    ownHome1: { type: String, default: '' },

    // Owner 2
    ownName2: { type: String, default: '' },
    ownTitle2: { type: String, default: '' },
    ownPerc2: { type: String, default: '' },
    ownTin2: { type: String, default: '' },
    ownHome2: { type: String, default: '' },

    // Owner 3
    ownName3: { type: String, default: '' },
    ownTitle3: { type: String, default: '' },
    ownPerc3: { type: String, default: '' },
    ownTin3: { type: String, default: '' },
    ownHome3: { type: String, default: '' },

    // Owner 4
    ownName4: { type: String, default: '' },
    ownTitle4: { type: String, default: '' },
    ownPerc4: { type: String, default: '' },
    ownTin4: { type: String, default: '' },
    ownHome4: { type: String, default: '' },

    // Owner 5
    ownName5: { type: String, default: '' },
    ownTitle5: { type: String, default: '' },
    ownPerc5: { type: String, default: '' },
    ownTin5: { type: String, default: '' },
    ownHome5: { type: String, default: '' },
    ownPos: { type: String, default: '' },

    // Veteran Status Checkboxes
    statNonVet: { type: Boolean, default: false },
    statVet: { type: Boolean, default: false },
    statVetD: { type: Boolean, default: false },
    statVetSp: { type: Boolean, default: false },
    statND: { type: Boolean, default: false },

    // Gender Checkboxes
    male: { type: Boolean, default: false },
    female: { type: Boolean, default: false },

    // Race Checkboxes
    raceAIAN: { type: Boolean, default: false },
    raceAsian: { type: Boolean, default: false },
    raceBAA: { type: Boolean, default: false },
    raceNHPI: { type: Boolean, default: false },
    raceWhite: { type: Boolean, default: false },
    raceND: { type: Boolean, default: false },

    // Ethnicity Checkboxes
    ethHisp: { type: Boolean, default: false },
    ethNot: { type: Boolean, default: false },
    ethND: { type: Boolean, default: false },

    // Questions (Yes/No Checkboxes)
    q1Yes: { type: Boolean, default: false },
    q1No: { type: Boolean, default: false },
    q2Yes: { type: Boolean, default: false },
    q2No: { type: Boolean, default: false },
    q3Yes: { type: Boolean, default: false },
    q3No: { type: Boolean, default: false },
    q4Yes: { type: Boolean, default: false },
    q4No: { type: Boolean, default: false },
    q5Yes: { type: Boolean, default: false },
    q5No: { type: Boolean, default: false },
    q6Yes: { type: Boolean, default: false },
    q6No: { type: Boolean, default: false },
    q7Yes: { type: Boolean, default: false },
    q7No: { type: Boolean, default: false },
    q8Yes: { type: Boolean, default: false },
    q8No: { type: Boolean, default: false },
    q9Yes: { type: Boolean, default: false },
    q9No: { type: Boolean, default: false },
    q10Yes: { type: Boolean, default: false },
    q10No: { type: Boolean, default: false },

    // Purpose/Use of Proceeds
    EquipAmt: { type: String, default: '' },
    purpEquip: { type: String, default: '' },
    workCap: { type: String, default: '' },
    busAcq: { type: String, default: '' },
    purpOther1: { type: String, default: '' },
    purpOther2: { type: String, default: '' },
    purpInv: { type: String, default: '' },
    debtRef: { type: String, default: '' }
  },
  { _id: false }
);

const Sba413FieldsSchema = new Schema(
  {
    applicantName: { type: String, default: '' },
    businessName: { type: String, default: '' }
  },
  { _id: false }
);

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
      trim: true,
      default: "9999"
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
    businessCashFlow: {
      type: String
    },
    industryExperience: {
      type: String
    },
    // Additional form fields collected during guided VAPI form completion
    additionalFormData: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  // SBA Form field storage for server-side state management
  sba1919Fields: {
    type: Sba1919FieldsSchema,
    default: () => ({})
  },
  sba413Fields: {
    type: Sba413FieldsSchema,
    default: () => ({})
  },
  status: {
    type: String,
    enum: Object.values(ApplicationStatus),
    default: ApplicationStatus.SUBMITTED,
    required: true
  },

  // Loan Chances
  loanChances: {
    score: {
      type: Number
    },
    chance: {
      type: String,
      enum: ['low', 'medium', 'high']
    },
    reasons: [{
      type: String
    }],
    calculatedAt: {
      type: Date,
      default: Date.now
    }
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
  draftDocuments: [{
    fileType: {
      type: String,
      required: true,
      enum: Object.values(DefaultDocumentType)
    },
    fileName: { type: String, required: true },
    s3Key: { type: String, required: true },
    s3Url: { type: String },
    generatedAt: { type: Date, default: Date.now },
    signed: { type: Boolean, default: false }
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
  }
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt
});

// Add indexes for common queries
sbaApplicationSchema.index({ status: 1, createdAt: -1 });
sbaApplicationSchema.index({ 'applicantData.creditScore': 1 });
sbaApplicationSchema.index({ 'banks.bank': 1 });
sbaApplicationSchema.index({ 'banks.status': 1 });

export const Application = model<SBAApplication>('Application', sbaApplicationSchema);