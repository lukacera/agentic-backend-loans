import * as path from 'path';
import * as fs from 'fs-extra';
import { Application } from '../models/Application.js';
import {
  SBAApplicationData,
  ApplicationStatus,
  ApplicationResponse,
  DocumentStorageInfo,
  SBAApplication,
  UserProvidedDocumentType,
  UserProvidedDocumentInfo,
  LoanChanceResult,
} from '../types/index.js';
import { sendEmail } from './emailSender.js';
import { composeEmail, createEmailAgent } from '../agents/EmailAgent.js';
import { createDocumentAgent } from '../agents/DocumentAgent.js';
import { fillPDFForm, mapDataWithAI, extractFormFields } from './pdfFormProcessor.js';
import {
  uploadDocumentWithRetry,
  downloadDocument,
  deleteDocument
} from './s3Service.js';
import { recommendBank } from './bankService.js';

// SBA Eligibility Calculator Interfaces
interface SBAEligibilityRequestBuyer {
  purchasePrice: string;
  availableCash: string;
  businessCashFlow: string;
  buyerCreditScore: string;
  isUSCitizen: boolean;
  businessYearsRunning: string | number;
  industryExperience?: string;
}

interface SBAEligibilityRequestOwner {
  monthlyRevenue: string;
  monthlyExpenses: string;
  existingDebtPayment: string;
  requestedLoanAmount: string;
  loanPurpose: string;
  ownerCreditScore: string;
  isUSCitizen: boolean;
  businessYearsRunning: string | number;
}

interface SBAEligibilityResponse {
  eligible: boolean;
  approvalChance: 'High' | 'Medium' | 'Low' | 'Very Low' | 'Ineligible';
  approvalPercentage: number;
  reasons: string[];
  recommendations: string[];
  eligibilityChecks: {
    citizenship: { passed: boolean; message: string };
    creditScore: { passed: boolean; message: string };
    businessAge: { passed: boolean; message: string };
    downPayment: { passed: boolean; message: string };
    cashFlow: { passed: boolean; message: string };
  };
}

const TEMPLATES_DIR = path.join(process.cwd(), 'templates');
const GENERATED_DIR = path.join(process.cwd(), 'generated');

// Credit score mapping removed - now using plain number strings

// Ensure directories exist
const initializeDirectories = async (): Promise<void> => {
  await fs.ensureDir(GENERATED_DIR);
};

// Create new SBA application as draft
export const createDraft = async (
  applicantData: SBAApplicationData,
  loanChances?: { score: number; chance: 'low' | 'medium' | 'high'; reasons: string[] }
): Promise<SBAApplication> => {
  try {
    await initializeDirectories();
    console.log(loanChances);
    // Create application in MongoDB with DRAFT status
    const application = new Application({
      applicantData,
      status: ApplicationStatus.DRAFT,
      documentsGenerated: false,
      emailSent: false,
      generatedDocuments: [],
      ...(loanChances && {
        loanChances: {
          ...loanChances,
          calculatedAt: new Date()
        }
      })
    });

    await application.save();

    return application;

  } catch (error) {
    console.error('Error creating draft application:', error);
    throw new Error(`Failed to create draft application: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Convert draft application to normal application and start processing
export const convertDraftToApplication = async (
  applicationId: string,
  updatedData: Partial<SBAApplicationData>
): Promise<{ response: ApplicationResponse; userType: 'owner' | 'buyer' }> => {
  try {
    await initializeDirectories();

    // Find the draft application
    const application = await Application.findById(applicationId);

    if (!application) {
      throw new Error('Application not found');
    }

    if (application.status !== ApplicationStatus.DRAFT) {
      throw new Error(`Application is not in draft status. Current status: ${application.status}`);
    }

    // Preserve the original user type from the draft
    const originalUserType = application.applicantData.userType;

    // Merge updated data with existing applicant data, but preserve userType
    application.applicantData = {
      ...application.applicantData,
      ...updatedData,
      userType: originalUserType // Explicitly preserve the original userType
    };

    // Update status to submitted
    application.status = ApplicationStatus.SUBMITTED;
    await application.save();

    // Start async processing
    processApplicationAsync(application);

    return {
      response: {
        status: ApplicationStatus.SUBMITTED,
        message: 'Draft application converted and submitted successfully. Documents are being prepared and will be sent to the bank shortly.'
      },
      userType: originalUserType
    };

  } catch (error) {
    console.error('Error converting draft application:', error);
    throw new Error(`Failed to convert draft application: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Create new SBA application
export const createApplication = async (
  applicantData: SBAApplicationData
): Promise<ApplicationResponse> => {
  try {
    await initializeDirectories();

    // Create application in MongoDB
    const application = new Application({
      applicantData,
      status: ApplicationStatus.SUBMITTED,
      documentsGenerated: false,
      emailSent: false,
      generatedDocuments: []
    });

    await application.save();

    // Start async processing
    processApplicationAsync(application);

    return {
      status: ApplicationStatus.SUBMITTED,
      message: 'Application submitted successfully. Documents are being prepared and will be sent to the bank shortly.'
    };

  } catch (error) {
    console.error('Error creating application:', error);
    throw new Error(`Failed to create application: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Async processing of application (documents + S3 upload)
const processApplicationAsync = async (application: SBAApplication): Promise<void> => {
  try {
    // Update status to processing
    application.status = ApplicationStatus.PROCESSING;
    await application.save();

    // Generate documents using DocumentAgent and form processor
    const generatedDocuments = await generateSBADocuments(
      application.applicantData,
      application._id?.toString() || ''
    );

    // Upload documents to S3
    const uploadedDocs = await uploadDocumentsToS3(
      application._id?.toString() || '',
      generatedDocuments,
      'unsigned'
    );

    // Update application with S3 information
    application.unsignedDocuments = uploadedDocs;
    application.documentsUploadedToS3 = true;
    application.s3UploadedAt = new Date();
    application.status = ApplicationStatus.AWAITING_SIGNATURE;

    // Keep legacy fields for backwards compatibility
    application.documentsGenerated = true;
    application.generatedDocuments = generatedDocuments;

    await application.save();

    // Clean up local files after successful upload
    await cleanupLocalFiles(generatedDocuments);

    // Email will be sent after documents are signed via submitApplicationToBank()
  } catch (error) {
    console.error('Error processing application:', error);

    // Update application status to failed
    try {
      application.status = ApplicationStatus.CANCELLED;
      await application.save();
    } catch (saveError) {
      console.error('Failed to update application status:', saveError);
    }
  }
};

// Generate draft PDFs with captured data for preview
export const generateDraftPDFs = async (
  applicantData: Partial<SBAApplicationData>,
  draftApplicationId: string
): Promise<Array<{ fileName: string; s3Key: string; s3Url: string; generatedAt: Date }>> => {
  const generatedDraftPDFs: Array<{ fileName: string; s3Key: string; s3Url: string; generatedAt: Date }> = [];

  try {
    await initializeDirectories();
    const sbaForms = ['SBAForm1919.pdf', 'SBAForm413.pdf'];
    
    for (const formName of sbaForms) {
      const templatePath = path.join(TEMPLATES_DIR, formName);
      const outputFileName = `draft_${draftApplicationId}_${formName}`;
      
      if (!await fs.pathExists(templatePath)) {
        console.warn(`Template not found: ${templatePath}`);
        continue;
      }
      
      try {
        const formAnalysis = await extractFormFields(templatePath);
        const documentAgent = createDocumentAgent();
        
        const formData = await mapDataWithAI(
          formAnalysis.fields,
          applicantData,
          documentAgent,
          [
            `This is a DRAFT SBA loan application form (${formName}).`,
            `Fill only the fields that have data available.`,
            `Leave fields blank if data is missing.`,
            `Rules for mapping fields:`,
            `- If applicantData.userType is "buyer", set Purpose of the loan to "Business Acquisition".`,
            `- If applicantData.userType is "owner", set Purpose of the loan to the value in applicantData.loanPurpose; if you cannot find the checkbox in the form with it, check "Other" and write it in the provided field.`,
            `- For SBAForm413.pdf, set the checkbox for "7(a) loan / 504 loan / Surety Bonds" to checked.`,
            `- For SBAForm1919.pdf, only 1 purpose of loan field can be checked`,
            `- For all forms, set Business/Entity Type to "LLC".`,
            `- For all forms, leave TIN/EIN and Primary Industry blank.`,
            `- For all Owner Legal Name fields, use applicantData.name. THIS DOES NOT APPLY to lists/tables containing multiple owners - you are supposed to fill just the first row there.`,
            `- For all Owner position fields, use "Owner".`,
            `- For Veteran Status, use non veteran`,
            `- For Race, use "white"`,
            `- For ethnicity, use "not hispanic or latino"`,
            `- For Sex, if you can figure it out from the name, set it accordingly; otherwise, set to "Male".`,
            `- For all ownership percentage fields, set to "100%".`,
            `- For all fields which ask for date informations is current of, or today's date, set to today's date.`,
            `- Map the business application data to the appropriate form fields.`,
          ].join('\n')
        );
        
        const fillResult = await fillPDFForm(
          templatePath,
          formData,
          outputFileName
        );
        
        if (fillResult.success && fillResult.outputPath) {
          const fileBuffer = await fs.readFile(fillResult.outputPath);
          const s3Key = `drafts/${draftApplicationId}/${formName}`;
          
          const s3Result = await uploadDocumentWithRetry(
            draftApplicationId,
            formName,
            fileBuffer,
            s3Key
          );
          console.log("s3 resukt:")
          console.log(s3Result);
          generatedDraftPDFs.push({
            fileName: formName,
            s3Key: s3Result.key,
            s3Url: s3Result.url,
            generatedAt: new Date()
          });
          
          await fs.remove(fillResult.outputPath);
        } else {
          console.error(`Failed to generate draft ${formName}:`, fillResult.error);
        }
      } catch (formError) {
        console.error(`Failed to process draft ${formName}:`, formError);
      }
    }
    
    return generatedDraftPDFs;
  } catch (error) {
    console.error('Error generating draft PDFs:', error);
    throw error;
  }
};

// Generate SBA documents using DocumentAgent and form processor
const generateSBADocuments = async (
  applicantData: SBAApplicationData,
  applicationId: string
): Promise<string[]> => {
  const generatedFiles: string[] = [];
  
  try {
    const sbaForms = ['SBAForm1919.pdf', 'SBAForm413.pdf'];
    
    for (const formName of sbaForms) {
      const templatePath = path.join(TEMPLATES_DIR, formName);
      const outputFileName = `${applicantData.businessName}_${formName}`;
      
      // Check if template exists
      if (!await fs.pathExists(templatePath)) {
        console.warn(`Template not found: ${templatePath}`);
        continue;
      }
      
      try {
        // Extract form fields from the PDF template
        const formAnalysis = await extractFormFields(templatePath);

        // Create document agent for AI processing
        const documentAgent = createDocumentAgent();
        
        // Map applicant data to form fields using AI
        // If applicantData.type is "buyer", set loanPurpose to "Business Acquisition"
        const formData = await mapDataWithAI(
          formAnalysis.fields,
          applicantData,
          documentAgent,
          [
            `This is an SBA loan application form (${formName}).`,
            `Rules for mapping fields:`,
            `- If applicantData.userType is "buyer", set Purpose of the loan to "Business Acquisition".`,
            `- If applicantData.userType is "owner", set Purpose of the loan to the value in applicantData.loanPurpose; if you cannot find the checkbox in the form with it, check "Other" and write it in the provided field.`,
            `- For SBAForm413.pdf, set the checkbox for "7(a) loan / 504 loan / Surety Bonds" to checked.`,
            `- For SBAForm1919.pdf, only 1 purpose of loan field can be checked`,
            `- For all forms, set Business/Entity Type to "LLC".`,
            `- For all forms, leave TIN/EIN and Primary Industry blank.`,
            `- For all Owner Legal Name fields, use applicantData.name. THIS DOES NOT APPLY to lists/tables containing multiple owners - you are supposed to fill just the first row there.`,
            `- For all Owner position fields, use "Owner".`,
            `- For Veteran Status, use non veteran`,
            `- For Race, use "white"`,
            `- For ethnicity, use "not hispanic or latino"`,
            `- For Sex, if you can figure it out from the name, set it accordingly; otherwise, set to "Male".`,
            `- For all ownership percentage fields, set to "100%".`,
            `- For all fields which ask for date informations is current of, or today's date, set to today's date.`,
            `- Map the business application data to the appropriate form fields.`,
          ].join('\n')
        );
        // Fill the PDF form
        const fillResult = await fillPDFForm(
          templatePath,
          formData,
          outputFileName
        );
        
        if (fillResult.success && fillResult.outputPath) {
          generatedFiles.push(fillResult.outputPath);
          
          // Verify file exists and check size
          if (await fs.pathExists(fillResult.outputPath)) {
            const stats = await fs.stat(fillResult.outputPath);
          } else {
            console.error(`Generated document file not found at path: ${fillResult.outputPath}`);
          }
        } else {
          console.error(`Failed to generate ${formName}:`, fillResult.error);
        }
        
      } catch (formError) {
        console.error(`Failed to process ${formName}:`, formError);
        // Continue to next form instead of breaking the entire process
      }
    }
    
    return generatedFiles;
    
  } catch (error) {
    console.error('Error generating SBA documents:', error);
    throw error;
  }
};

// Upload multiple documents to S3
const uploadDocumentsToS3 = async (
  applicationId: string,
  localFilePaths: string[],
  docType: 'unsigned' | 'signed'
): Promise<DocumentStorageInfo[]> => {
  const uploadedDocs: DocumentStorageInfo[] = [];

  for (const filePath of localFilePaths) {
    try {
      const fileName = path.basename(filePath);
      const fileBuffer = await fs.readFile(filePath);


      const s3Result = await uploadDocumentWithRetry(
        applicationId,
        fileName,
        fileBuffer
      );

      uploadedDocs.push({
        fileName,
        s3Key: s3Result.key,
        s3Url: s3Result.url,
        uploadedAt: new Date()
      });

    } catch (error) {
      console.error(`Failed to upload ${filePath} to S3:`, error);
      throw error;
    }
  }

  return uploadedDocs;
};

// Clean up local files after successful S3 upload
const cleanupLocalFiles = async (filePaths: string[]): Promise<void> => {
  for (const filePath of filePaths) {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
      }
    } catch (error) {
      console.error(`Failed to clean up file ${filePath}:`, error);
      // Don't throw - cleanup failures shouldn't break the flow
    }
  }
};

// Handle signed documents upload
export const handleSignedDocuments = async (
  applicationId: string,
  signedDocumentBuffers: Array<{ fileName: string; buffer: Buffer }>,
  signingMetadata?: {
    signedBy?: string;
    signingProvider?: string;
    signingRequestId?: string;
  }
): Promise<ApplicationResponse> => {
  try {
    const application = await Application.findById(applicationId);

    if (!application) {
      throw new Error('Application not found');
    }

    // if (application.status !== ApplicationStatus.AWAITING_SIGNATURE) {
    //   throw new Error(`Cannot process signed documents. Current status: ${application.status}`);
    // }

    // Upload signed documents to S3
    const uploadedSignedDocs: DocumentStorageInfo[] = [];

    for (const doc of signedDocumentBuffers) {

      const s3Result = await uploadDocumentWithRetry(
        applicationId,
        doc.fileName,
        doc.buffer
      );

      uploadedSignedDocs.push({
        fileName: doc.fileName,
        s3Key: s3Result.key,
        s3Url: s3Result.url,
        uploadedAt: new Date(),
        signedAt: new Date()
      });
    }

    // Push signed documents to array instead of replacing
    application.signedDocuments.push(...uploadedSignedDocs);
    application.status = ApplicationStatus.SIGNED;
    application.signingStatus = 'completed';
    application.signedDate = new Date();
    application.markModified('signedDocuments');

    if (signingMetadata) {
      application.signedBy = signingMetadata.signedBy;
      application.signingProvider = signingMetadata.signingProvider as any;
      application.signingRequestId = signingMetadata.signingRequestId;
    }

    await application.save();


    return {
      status: ApplicationStatus.SIGNED,
      message: 'Signed documents uploaded successfully',
      documentsGenerated: uploadedSignedDocs.map(d => d.s3Key)
    };

  } catch (error) {
    console.error('Error handling signed documents:', error);
    throw error;
  }
};

export const addUserProvidedDocuments = async (
  applicationId: string,
  documents: Array<{ fileName: string; buffer: Buffer; fileType: UserProvidedDocumentType }>
): Promise<{ application: SBAApplication; uploadedDocuments: UserProvidedDocumentInfo[] }> => {
  try {
    const application = await Application.findById(applicationId);

    if (!application) {
      throw new Error('Application not found');
    }

    if (documents.length === 0) {
      throw new Error('No documents provided');
    }

    // Prevent duplicate uploads for the same document type
    const seenTypes = new Set<UserProvidedDocumentType>();

    for (const doc of documents) {
      if (seenTypes.has(doc.fileType)) {
        throw new Error(`${doc.fileType} file has already been uploaded`);
      }
      seenTypes.add(doc.fileType);
    }

    const existingTypes = new Set(
      application.userProvidedDocuments.map((doc) => doc.fileType)
    );

    for (const doc of documents) {
      if (existingTypes.has(doc.fileType)) {
        throw new Error(`${doc.fileType} file has already been uploaded`);
      }
    }

    const uploadedDocuments: UserProvidedDocumentInfo[] = [];

    for (const doc of documents) {
      const s3Result = await uploadDocumentWithRetry(
        applicationId,
        doc.fileName,
        doc.buffer
      );

      uploadedDocuments.push({
        fileType: doc.fileType,
        fileName: doc.fileName,
        s3Key: s3Result.key,
        s3Url: s3Result.url,
        uploadedAt: new Date()
      });
    }

    application.userProvidedDocuments.push(...uploadedDocuments);
    application.markModified('userProvidedDocuments');

    await application.save();

    return {
      application,
      uploadedDocuments
    };

  } catch (error) {
    console.error('Error uploading user provided documents:', error);
    throw error;
  }
};

// Download signed documents from S3
const downloadDocumentsFromS3 = async (
  documents: DocumentStorageInfo[]
): Promise<Array<{ fileName: string; buffer: Buffer }>> => {
  const documentBuffers: Array<{ fileName: string; buffer: Buffer }> = [];

  for (const doc of documents) {
    try {
      const buffer = await downloadDocument(doc.s3Key);
      documentBuffers.push({
        fileName: doc.fileName,
        buffer
      });
    } catch (error) {
      console.error(`Failed to download ${doc.fileName} from S3:`, error);
      throw new Error(`Failed to download document: ${doc.fileName}`);
    }
  }

  return documentBuffers;
};

export const markUnsignedDocumentAsSigned = async (
  applicationId: string,
  options: {
    fileName?: string;
    s3Key?: string;
    signedBy?: string;
    signingProvider?: string;
    signingRequestId?: string;
    signedAt?: string | Date;
    signedS3Key?: string;
    signedS3Url?: string;
  }
): Promise<SBAApplication> => {
  const {
    fileName,
    s3Key,
    signedBy,
    signingProvider,
    signingRequestId,
    signedAt,
    signedS3Key,
    signedS3Url
  } = options;

  if (!fileName && !s3Key) {
    throw new Error('Document identifier (fileName or s3Key) is required');
  }

  const application = await Application.findById(applicationId);

  if (!application) {
    throw new Error('Application not found');
  }

  const unsignedIndex = application.unsignedDocuments.findIndex((doc) => {
    if (s3Key && doc.s3Key === s3Key) {
      return true;
    }

    if (fileName && doc.fileName === fileName) {
      return true;
    }

    return false;
  });

  if (unsignedIndex === -1) {
    throw new Error('Unsigned document not found');
  }

  const unsignedDoc = application.unsignedDocuments.splice(unsignedIndex, 1)[0];
  const signedAtValue = signedAt ? new Date(signedAt) : new Date();

  const signedDoc: DocumentStorageInfo = {
    fileName: unsignedDoc.fileName,
    s3Key: signedS3Key ?? unsignedDoc.s3Key,
    s3Url: signedS3Url ?? unsignedDoc.s3Url,
    uploadedAt: unsignedDoc.uploadedAt,
    signedAt: signedAtValue
  };

  application.signedDocuments.push(signedDoc);
  application.markModified('unsignedDocuments');
  application.markModified('signedDocuments');

  if (signedBy) {
    application.signedBy = signedBy;
  }

  if (signingProvider) {
    application.signingProvider = signingProvider as any;
  }

  if (signingRequestId) {
    application.signingRequestId = signingRequestId;
  }

  if (application.unsignedDocuments.length === 0) {
    application.status = ApplicationStatus.SIGNED;
    application.signingStatus = 'completed';
    application.signedDate = signedAtValue;
  } else {
    application.status = ApplicationStatus.AWAITING_SIGNATURE;
    application.signingStatus = 'pending';
  }

  await application.save();

  return application;
};

export const deleteSignedDocument = async (
  applicationId: string,
  options: {
    fileName?: string;
    s3Key?: string;
  }
): Promise<SBAApplication> => {
  const { fileName, s3Key } = options;

  if (!fileName && !s3Key) {
    throw new Error('Document identifier (fileName or s3Key) is required');
  }

  const application = await Application.findById(applicationId);

  if (!application) {
    throw new Error('Application not found');
  }

  const signedIndex = application.signedDocuments.findIndex((doc) => {
    if (s3Key && doc.s3Key === s3Key) {
      return true;
    }

    if (fileName && doc.fileName === fileName) {
      return true;
    }

    return false;
  });

  if (signedIndex === -1) {
    throw new Error('Signed document not found');
  }

  const [signedDoc] = application.signedDocuments.splice(signedIndex, 1);

  try {
    await deleteDocument(signedDoc.s3Key);
  } catch (error) {
    // Reinsert document to maintain consistency if delete fails
    application.signedDocuments.splice(signedIndex, 0, signedDoc);
    throw error;
  }

  application.markModified('signedDocuments');

  if (application.signedDocuments.length === 0) {
    application.status = ApplicationStatus.AWAITING_SIGNATURE;
    application.signingStatus = 'pending';
    application.signedDate = undefined;
    application.signedBy = undefined;
  }

  await application.save();

  return application;
};

// Send email with S3 documents
const sendApplicationEmailWithS3Docs = async (
  application: SBAApplication,
  documentBuffers: Array<{ fileName: string; buffer: Buffer }>,
  bankEmail?: string,
  bankName?: string
): Promise<void> => {
  try {
    // Use provided bank email or fall back to application's bankEmail
    const recipientEmail = bankEmail;
    const recipient = bankName || 'Bank';

    // Prepare email attachments from buffers
    const attachments = documentBuffers.map(doc => ({
      filename: doc.fileName,
      content: doc.buffer,
      contentType: 'application/pdf'
    }));

    // Generate professional email content using EmailAgent
    const emailAgent = createEmailAgent();

    const emailComposition = {
      recipients: [recipientEmail ?? ""],
      subject: `SBA Loan Application Submission - ${application.applicantData.businessName}`,
      purpose: 'NEW LOAN APPLICATION' as any,
      tone: 'PROFESSIONAL' as any,
      keyPoints: [
        `New SBA loan application from ${application.applicantData.businessName}`,
        `Annual revenue: $${application.applicantData.annualRevenue?.toLocaleString()}`,
        `Credit score: ${application.applicantData.creditScore}`,
        'All required SBA forms completed, signed, and attached',
        'Supporting applicant-provided documents attached',
        'Ready for review and processing'
      ],
      context: `Signed loan application documents and supporting materials for ${application.applicantData.businessName}. All documents have been electronically signed and include applicant-provided attachments for ${recipient} review.`
    };

    const emailResult = await composeEmail(emailAgent, emailComposition);

    if (emailResult.success && emailResult.data) {
      await sendEmail({
        to: [recipientEmail ?? ""],
        subject: emailResult.data.subject,
        html: emailResult.data.body,
        text: emailResult.data.body.replace(/<[^>]*>/g, ''),
        attachments
      });
    } else {
      throw new Error(`Failed to compose email: ${emailResult.error}`);
    }

  } catch (error) {
    console.error('Error sending application email with S3 docs:', error);
    throw error;
  }
};

// Submit application to bank
export const submitApplicationToBank = async (
  applicationId: string
): Promise<ApplicationResponse> => {
  try {
    const application = await Application.findById(applicationId);

    if (!application) {
      throw new Error('Application not found');
    }

    if (application.signedDocuments.length === 0) {
      throw new Error('No signed documents found');
    }

    // Get recommended banks based on applicant's credit score and years in business
    const currentYear = new Date().getFullYear();
    const yearsInBusiness = currentYear - application.applicantData.yearFounded;

    const recommendations = await recommendBank({
      creditScore: application.applicantData.creditScore,
      yearsInBusiness
    });

    if (recommendations.matchingBanks.length === 0) {
      throw new Error('No banks match the applicant requirements');
    }

    // Download documents from S3 (signed + supporting)
    const signedDocumentBuffers = await downloadDocumentsFromS3(
      application.signedDocuments
    );

    const userProvidedDocumentBuffers = application.userProvidedDocuments.length > 0
      ? await downloadDocumentsFromS3(application.userProvidedDocuments)
      : [];

    const documentBuffers = [
      ...signedDocumentBuffers,
      ...userProvidedDocumentBuffers
    ];

    // Send emails to all recommended banks
    const bankSubmissions = [];
    for (const bank of recommendations.matchingBanks) {
      try {
        // Send email to this bank
        await sendApplicationEmailWithS3Docs(
          application,
          documentBuffers,
          bank.contacts.email,
          bank.name
        );

        // Track successful submission
        bankSubmissions.push({
          bank: bank._id.toString(),
          status: 'submitted' as any,
          submittedAt: new Date()
        });

      } catch (emailError) {
        console.error(`Failed to submit to ${bank.name}:`, emailError);
        // Continue with other banks even if one fails
      }
    }

    if (bankSubmissions.length === 0) {
      throw new Error('Failed to submit application to any bank');
    }

    // Update application with bank submissions
    application.banks = bankSubmissions;
    application.status = ApplicationStatus.SENT_TO_BANK;
    application.emailSent = true;
    application.emailSentAt = new Date();
    await application.save();

    return {
      status: ApplicationStatus.SENT_TO_BANK,
      message: `Application submitted to ${bankSubmissions.length} bank(s) successfully`
    };

  } catch (error) {
    console.error('Error submitting application to bank:', error);
    throw error;
  }
};

// Get application by ID
export const getApplication = async (applicationId: string): Promise<SBAApplication | null> => {
  try {
    return await Application.findById(applicationId).exec();
  } catch (error) {
    console.error('Error fetching application:', error);
    throw error;
  }
};

// Get a single application by applicant name (case-insensitive match)
export const getApplicationByBusinessName = async (name: string): Promise<SBAApplication | null> => {
  try {
    const sanitizedName = name.trim();
    if (!sanitizedName) {
      return null;
    }

    return await Application.findOne({
      'applicantData.businessName': { $regex: `^${sanitizedName}$`, $options: 'i' }
    })
    .populate({
      path: 'banks.bank', // populate the bankId field inside banks array
      model: 'Bank',        // make sure this matches the Bank model
      select: 'name' // specify the fields to select from the Bank model
    })
    .exec(); 
  } catch (error) {
    console.error('Error fetching application by name:', error);
    throw error;
  }
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Get a single application by business phone number (supports common formatting variations)
export const getApplicationByPhone = async (phone: string): Promise<SBAApplication | null> => {
  try {
    const sanitizedPhone = phone.trim();

    if (!sanitizedPhone) {
      return null;
    }

    const digitsOnly = sanitizedPhone.replace(/\D+/g, '');

    const orConditions: Record<string, unknown>[] = [];
    orConditions.push({
      'applicantData.businessPhoneNumber': {
        $regex: `^${escapeRegex(sanitizedPhone)}$`,
        $options: 'i'
      }
    });

    if (digitsOnly.length > 3) {
      const loosePattern = `^\\D*${digitsOnly.split('').map((digit) => escapeRegex(digit)).join('\\D*')}\\D*$`;
      orConditions.push({
        'applicantData.businessPhoneNumber': {
          $regex: loosePattern,
          $options: 'i'
        }
      });
    }

    return await Application.findOne({ $or: orConditions })
    .populate({
      path: 'banks.bank', // populate the bankId field inside banks array
      model: 'Bank',        // make sure this matches the Bank model
      select: 'name' // specify the fields to select from the Bank model
    })
    .exec();  
  } catch (error) {
    console.error('Error fetching application by phone number:', error);
    throw error;
  }
};

// Get all applications with pagination
export const getApplications = async (
  page: number = 1,
  limit: number = 10,
  status?: ApplicationStatus
): Promise<{ applications: SBAApplication[], total: number, page: number, pages: number }> => {
  try {
    const query = status ? { status } : {};
    const skip = (page - 1) * limit;

    const [applications, total] = await Promise.all([
      Application.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      Application.countDocuments(query).exec()
    ]);

    return {
      applications,
      total,
      page,
      pages: Math.ceil(total / limit)
    };
  } catch (error) {
    console.error('Error fetching applications:', error);
    throw error;
  }
};

// Create a new offer for an application
export const createOffer = async (
  applicationId: string,
  bankId: string,
  offerDetails: {
    repaymentTermMonths: number;
    annualInterestRate: number;
    monthlyPayment: number;
    downPaymentRequired: number;
  }
): Promise<SBAApplication> => {
  try {
    const application = await Application.findById(applicationId);

    if (!application) {
      throw new Error('Application not found');
    }

    // Create new offer object
    const newOffer = {
      bank: bankId,
      offerDetails: {
        repaymentTermMonths: offerDetails.repaymentTermMonths,
        annualInterestRate: offerDetails.annualInterestRate,
        monthlyPayment: offerDetails.monthlyPayment,
        downPaymentRequired: offerDetails.downPaymentRequired
      },
      status: 'pending' as const
    };

    // Push offer to application.offers array
    application.offers.push(newOffer);
    application.markModified('offers');

    await application.save();


    return application;
  } catch (error) {
    console.error('Error creating offer:', error);
    throw error;
  }
};

// Update offer status (accept/decline)
export const updateOfferStatus = async (
  applicationId: string,
  offerId: string,
  status: 'accepted' | 'declined'
): Promise<SBAApplication> => {
  try {
    const application = await Application.findById(applicationId);

    if (!application) {
      throw new Error('Application not found');
    }

    // Find the offer by its _id
    const offer = application.offers.find(
      (o) => o._id && o._id.toString() === offerId
    );

    if (!offer) {
      throw new Error('Offer not found');
    }

    // Update the offer status
    offer.status = status;
    application.markModified('offers');

    await application.save();
    return application;
  } catch (error) {
    console.error('Error updating offer status:', error);
    throw error;
  }
};

// Helper function to calculate DSCR (Debt Service Coverage Ratio)
function calculateDSCR(loanAmount: number, rate: number, years: number, sde: number): number {
  if (sde <= 0) return 0;

  const numPayments = years * 12;
  const monthlyRate = rate / 12;
  const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
                        (Math.pow(1 + monthlyRate, numPayments) - 1);
  const annualDebtService = monthlyPayment * 12;

  return Number((sde / annualDebtService).toFixed(2));
}

// Calculate SBA eligibility and approval chances for BUYERS - VAPI version (returns single-line string)
export function calculateSBAEligibilityForBuyerVAPI(data: SBAEligibilityRequestBuyer): string {
  const purchasePrice = parseInt(data.purchasePrice);
  const availableCash = parseInt(data.availableCash);
  const businessCashFlow = parseInt(data.businessCashFlow || '0');
  const businessYearsRunning = typeof data.businessYearsRunning === 'number'
    ? data.businessYearsRunning
    : parseInt(data.businessYearsRunning as any) || 0;

  // Parse credit score as a plain number string
  const creditScoreValue = parseInt(data.buyerCreditScore || '0');
  console.log(data)
  const isCitizen = data.isUSCitizen;

  const downPaymentPercent = (availableCash / purchasePrice) * 100;

  // Calculate DSCR for a typical 90% SBA loan
  const typicalLoanAmount = purchasePrice * 0.9;
  const dscr = calculateDSCR(typicalLoanAmount, 0.095, 10, businessCashFlow);

  const reasons: string[] = [];
  const recommendations: string[] = [];
  let score = 100; // Start at 100, deduct points for issues

  // 1. Citizenship Check (HARD STOP)
  const citizenshipCheck = {
    passed: isCitizen,
    message: isCitizen
      ? 'US Citizen or Lawful Permanent Resident ✓'
      : 'Must be US Citizen or Lawful Permanent Resident'
  };

  if (!isCitizen) {
    return 'Ineligible for SBA loan, Non-US citizens are ineligible for SBA loans, Recommendation: Consider seller financing or alternative lending options';
  }

  if (Number.isNaN(creditScoreValue) || creditScoreValue < 650) {
    return 'Ineligible for SBA loan, Credit score below 650 minimum requirement, Recommendation: Improve personal credit profile before reapplying';
  }

  if (businessYearsRunning < 2) {
    return 'Ineligible for SBA loan, Business must operate for at least 2 years under current ownership, Recommendation: Reapply once the business reaches 24 months of operating history';
  }

  if (!Number.isFinite(businessCashFlow) || businessCashFlow <= 0) {
    return 'Ineligible for SBA loan, Business must demonstrate positive cash flow, Recommendation: Provide updated financials showing profitable operations';
  }

  // 2. Credit Score Check
  let creditScoreCheck = { passed: true, message: 'Credit score not provided' };

  if (creditScoreValue > 0) {
    if (creditScoreValue >= 720) {
      creditScoreCheck = { passed: true, message: 'Excellent credit score (720+) ✓' };
      reasons.push('Strong credit profile');
    } else if (creditScoreValue >= 680) {
      creditScoreCheck = { passed: true, message: 'Good credit score (680-719) ✓' };
      score -= 5;
    } else if (creditScoreValue >= 650) {
      creditScoreCheck = { passed: true, message: 'Fair credit score (650-679)' };
      score -= 15;
      reasons.push('Credit score is on the lower end for SBA approval');
      recommendations.push('Consider improving credit score before applying');
    } else {
      creditScoreCheck = { passed: false, message: 'Credit score below 650 - High risk' };
      score -= 30;
      reasons.push('Credit score below SBA typical minimum (650)');
      recommendations.push('Work on improving credit score to 680+ for better approval odds');
    }
  }

  // 3. Business Age Check
  let businessAgeCheck = { passed: true, message: 'Business age not provided' };

  if (businessYearsRunning !== null && businessYearsRunning !== undefined) {
    if (businessYearsRunning >= 5) {
      businessAgeCheck = { passed: true, message: `Established business (${businessYearsRunning} years) ✓` };
      reasons.push('Well-established business history');
    } else if (businessYearsRunning >= 2) {
      businessAgeCheck = { passed: true, message: `Business meets minimum (${businessYearsRunning} years) ✓` };
      score -= 5;
    } else {
      businessAgeCheck = { passed: false, message: `Business too young (${businessYearsRunning} years < 2 years required)` };
      score -= 40;
      reasons.push('Business must operate for minimum 2 years for SBA eligibility');
      recommendations.push('Wait until business reaches 2-year operating history');
    }
  }

  // Immediate rejection if buyer equity below 10%
  if (!Number.isFinite(downPaymentPercent) || downPaymentPercent < 10) {
    return 'Ineligible for SBA loan, Buyer equity below required 10% down payment, Recommendation: Increase cash reserves or secure seller financing to reach 10% equity';
  }

  // 4. Down Payment Check
  let downPaymentCheck = { passed: true, message: '' };

  if (downPaymentPercent >= 20) {
    downPaymentCheck = { passed: true, message: `Strong down payment (${downPaymentPercent.toFixed(1)}%) ✓` };
    reasons.push('Substantial equity investment');
  } else {
    downPaymentCheck = { passed: true, message: `Adequate down payment (${downPaymentPercent.toFixed(1)}%) ✓` };
    score -= 10;
  }

  // 5. Cash Flow / DSCR Check
  let cashFlowCheck = { passed: true, message: '' };

  if (businessCashFlow <= 0) {
    cashFlowCheck = { passed: false, message: 'Business cash flow not provided' };
    score -= 20;
    reasons.push('Cash flow information required for approval');
    recommendations.push('Obtain detailed financial statements showing business cash flow');
  } else if (dscr >= 1.35) {
    cashFlowCheck = { passed: true, message: `Excellent cash flow coverage (DSCR: ${dscr.toFixed(2)}) ✓` };
    reasons.push('Strong debt service coverage ratio');
  } else if (dscr >= 1.25) {
    cashFlowCheck = { passed: true, message: `Good cash flow coverage (DSCR: ${dscr.toFixed(2)}) ✓` };
    score -= 5;
  } else if (dscr >= 1.15) {
    cashFlowCheck = { passed: true, message: `Adequate cash flow coverage (DSCR: ${dscr.toFixed(2)})` };
    score -= 15;
    reasons.push('Cash flow is at minimum threshold for SBA approval');
    recommendations.push('Consider increasing down payment to reduce loan amount and improve DSCR');
  } else {
    cashFlowCheck = { passed: false, message: `Insufficient cash flow (DSCR: ${dscr.toFixed(2)} < 1.15 required)` };
    score -= 40;
    reasons.push('Business cash flow cannot support SBA loan payments');
    recommendations.push('Increase down payment significantly to reduce monthly debt service');
    recommendations.push('Negotiate seller financing to reduce SBA loan amount');
  }

  // 6. Industry Experience (bonus factor)
  if (data.industryExperience) {
    const experience = data.industryExperience.toLowerCase();
    if (experience.includes('owner') || experience.includes('manager') ||
        experience.includes('director') || experience.match(/\d+\s*years?/)) {
      reasons.push('Relevant industry experience strengthens application');
      score += 5; // Bonus points
    } else if (experience.includes('no') || experience.includes('none') ||
               experience.includes('limited')) {
      score -= 10;
      recommendations.push('Develop detailed business plan to offset limited industry experience');
    }
  }

  // Calculate final approval chance
  score = Math.max(0, Math.min(100, score)); // Clamp between 0-100

  let approvalChance: 'High' | 'Medium' | 'Low' | 'Very Low' | 'Ineligible';
  let eligible = true;

  if (score >= 80) {
    approvalChance = 'High';
  } else if (score >= 60) {
    approvalChance = 'Medium';
  } else if (score >= 40) {
    approvalChance = 'Low';
  } else if (score >= 20) {
    approvalChance = 'Very Low';
  } else {
    approvalChance = 'Ineligible';
    eligible = false;
  }

  // Add general recommendations if not already high approval
  if (score < 80) {
    if (!recommendations.length) {
      recommendations.push('Prepare comprehensive business plan with 3-year projections');
      recommendations.push('Gather all required SBA documentation in advance');
      recommendations.push('Consider working with an SBA-experienced business broker or consultant');
    }
  }

  // Build single-line string response
  const parts: string[] = [];

  // Add approval chance and percentage
  parts.push(`Approval Chance: ${approvalChance}`);
  parts.push(`Score: ${score} out of 100`);

  // Add eligibility status
  parts.push(eligible ? 'Eligible for SBA loan' : 'Not eligible for SBA loan');

  // Add citizenship check
  parts.push(citizenshipCheck.message);

  // Add credit score check
  parts.push(creditScoreCheck.message);

  // Add business age check
  parts.push(businessAgeCheck.message);

  // Add down payment check
  if (downPaymentCheck.message) {
    parts.push(downPaymentCheck.message);
  }

  // Add cash flow check
  if (cashFlowCheck.message) {
    parts.push(cashFlowCheck.message);
  }

  // Add reasons
  if (reasons.length > 0) {
    parts.push(`Reasons: ${reasons.join(', ')}`);
  }

  // Add recommendations
  if (recommendations.length > 0) {
    parts.push(`Recommendations: ${recommendations.join(', ')}`);
  }

  // Join all parts with commas
  return parts.join(', ');
}

// Calculate SBA eligibility and approval chances for BUYERS (returns structured data)
export function calculateSBAEligibilityForBuyer(data: SBAEligibilityRequestBuyer): LoanChanceResult {
  const purchasePrice = parseInt(data.purchasePrice);
  const availableCash = parseInt(data.availableCash);
  const businessCashFlow = parseInt(data.businessCashFlow || '0');
  const businessYearsRunning = typeof data.businessYearsRunning === 'number'
    ? data.businessYearsRunning
    : parseInt(data.businessYearsRunning as any) || 0;

  const creditScoreValue = parseInt(data.buyerCreditScore || '0');
  const isCitizen = data.isUSCitizen;

  const downPaymentPercent = (availableCash / purchasePrice) * 100;
  const typicalLoanAmount = purchasePrice * 0.9;
  const dscr = calculateDSCR(typicalLoanAmount, 0.095, 10, businessCashFlow);

  const reasons: string[] = [];
  let score = 100;

  // Citizenship Check (HARD STOP)
  if (!isCitizen) {
    return {
      score: 0,
      chance: 'low',
      reasons: ['Non-US citizens are ineligible for SBA loans', 'Consider seller financing or alternative lending options']
    };
  }

  // Down payment minimum check (HARD STOP)
  if (!Number.isFinite(downPaymentPercent) || downPaymentPercent < 10) {
    return {
      score: 0,
      chance: 'low',
      reasons: [
        'Buyer equity below required 10% down payment for SBA financing',
        'Increase cash reserves or secure seller financing to reach 10% equity'
      ]
    };
  }

  // Credit score minimum check (HARD STOP)
  if (Number.isNaN(creditScoreValue) || creditScoreValue < 650) {
    return {
      score: 0,
      chance: 'low',
      reasons: [
        'Credit score below 650 minimum requirement for SBA financing',
        'Improve personal credit profile before reapplying'
      ]
    };
  }

  // Operating history minimum check (HARD STOP)
  if (businessYearsRunning < 2) {
    return {
      score: 0,
      chance: 'low',
      reasons: [
        'Business has operated for less than 2 years',
        'Reapply once the business reaches 24 months of operating history'
      ]
    };
  }

  // Positive cash flow check (HARD STOP)
  if (!Number.isFinite(businessCashFlow) || businessCashFlow <= 0) {
    return {
      score: 0,
      chance: 'low',
      reasons: [
        'Business must demonstrate positive cash flow',
        'Provide updated financial statements showing profitable operations'
      ]
    };
  }

  // Credit Score Check
  if (creditScoreValue > 0) {
    if (creditScoreValue >= 720) {
      reasons.push('Strong credit profile');
    } else if (creditScoreValue >= 680) {
      score -= 5;
    } else if (creditScoreValue >= 650) {
      score -= 15;
      reasons.push('Credit score is on the lower end for SBA approval');
    } else {
      score -= 30;
      reasons.push('Credit score below SBA typical minimum (650)');
    }
  }

  // Business Age Check
  if (businessYearsRunning >= 5) {
    reasons.push('Well-established business history');
  } else if (businessYearsRunning >= 2) {
    score -= 5;
  } else {
    score -= 40;
    reasons.push('Business must operate for minimum 2 years for SBA eligibility');
  }

  // Down Payment Check (only runs for 10%+ equity)
  if (downPaymentPercent >= 20) {
    reasons.push('Substantial equity investment');
  } else {
    score -= 10;
    reasons.push('Down payment meets minimum 10% equity requirement');
  }

  // Cash Flow / DSCR Check
  if (businessCashFlow <= 0) {
    score -= 20;
    reasons.push('Cash flow information required for approval');
  } else if (dscr >= 1.35) {
    reasons.push('Strong debt service coverage ratio');
  } else if (dscr >= 1.25) {
    score -= 5;
  } else if (dscr >= 1.15) {
    score -= 15;
    reasons.push('Cash flow is at minimum threshold for SBA approval');
  } else {
    score -= 40;
    reasons.push('Business cash flow cannot support SBA loan payments');
  }

  // Industry Experience
  if (data.industryExperience) {
    const experience = data.industryExperience.toLowerCase();
    if (experience.includes('owner') || experience.includes('manager') ||
        experience.includes('director') || experience.match(/\d+\s*years?/)) {
      reasons.push('Relevant industry experience strengthens application');
      score += 5;
    } else if (experience.includes('no') || experience.includes('none') ||
               experience.includes('limited')) {
      score -= 10;
    }
  }

  score = Math.max(0, Math.min(100, score));

  let chance: 'low' | 'medium' | 'high';
  if (score >= 80) {
    chance = 'high';
  } else if (score >= 60) {
    chance = 'medium';
  } else {
    chance = 'low';
  }

  return { score, chance, reasons };
}

// Calculate SBA eligibility and approval chances for OWNERS (returns structured data)
export function calculateSBAEligibilityForOwner(data: SBAEligibilityRequestOwner): LoanChanceResult {
  const monthlyRevenue = parseInt(data.monthlyRevenue || '0');
  const monthlyExpenses = parseInt(data.monthlyExpenses || '0');
  const existingDebtPayment = parseInt(data.existingDebtPayment || '0');
  const requestedLoanAmount = parseInt(data.requestedLoanAmount || '0');
  const loanPurpose = data.loanPurpose?.toLowerCase() || '';
  const businessYearsRunning = typeof data.businessYearsRunning === 'number'
    ? data.businessYearsRunning
    : parseInt(data.businessYearsRunning as any) || 0;

  const creditScoreValue = parseInt(data.ownerCreditScore || '0');
  const isCitizen = data.isUSCitizen;

  const monthlyNetIncome = monthlyRevenue - monthlyExpenses;
  const annualNetIncome = monthlyNetIncome * 12;

  const dscr = calculateDSCRForOwner(
    annualNetIncome,
    existingDebtPayment,
    requestedLoanAmount,
    0.095,
    10
  );

  const reasons: string[] = [];
  let score = 100;

  // Citizenship Check (HARD STOP)
  if (!isCitizen) {
    return {
      score: 0,
      chance: 'low',
      reasons: ['Non-US citizens are ineligible for SBA loans', 'Consider alternative lending options']
    };
  }

  // Credit Score Check
  if (creditScoreValue > 0) {
    if (creditScoreValue >= 720) {
      reasons.push('Strong credit profile');
    } else if (creditScoreValue >= 680) {
      score -= 5;
    } else if (creditScoreValue >= 650) {
      score -= 15;
      reasons.push('Credit score is on the lower end for SBA approval');
    } else {
      score -= 30;
      reasons.push('Credit score below SBA typical minimum (650)');
    }
  }

  // Business Age Check
  if (businessYearsRunning >= 5) {
    reasons.push('Well-established business history');
  } else if (businessYearsRunning >= 2) {
    score -= 5;
  } else {
    score -= 40;
    reasons.push('Business must operate for minimum 2 years for SBA eligibility');
  }

  // Cash Flow / DSCR Check
  if (monthlyRevenue <= 0 || monthlyExpenses < 0) {
    score -= 30;
    reasons.push('Financial information required for approval');
  } else if (monthlyNetIncome <= 0) {
    score -= 50;
    reasons.push('Business must show positive net income to qualify');
  } else if (dscr >= 1.35) {
    reasons.push('Strong debt service coverage ratio including existing debt');
  } else if (dscr >= 1.25) {
    score -= 5;
  } else if (dscr >= 1.15) {
    score -= 15;
    reasons.push('Cash flow is at minimum threshold for SBA approval');
  } else {
    score -= 40;
    reasons.push('Business cash flow cannot support additional SBA loan payments with existing debt');
  }

  // Existing Debt Consideration
  if (existingDebtPayment > 0) {
    const debtToIncomeRatio = (existingDebtPayment * 12) / annualNetIncome;
    if (debtToIncomeRatio > 0.5) {
      score -= 10;
      reasons.push('High existing debt burden relative to income');
    }
  }

  // Loan Amount Validation
  if (requestedLoanAmount > annualNetIncome * 3) {
    score -= 15;
    reasons.push('Requested loan amount is high relative to annual income');
  }

  score = Math.max(0, Math.min(100, score));

  let chance: 'low' | 'medium' | 'high';
  if (score >= 80) {
    chance = 'high';
  } else if (score >= 60) {
    chance = 'medium';
  } else {
    chance = 'low';
  }

  return { score, chance, reasons };
}

// Helper function to calculate DSCR for owners (includes existing debt)
function calculateDSCRForOwner(
  netIncome: number,
  existingDebtPayment: number,
  newLoanAmount: number,
  rate: number,
  years: number
): number {
  if (netIncome <= 0) return 0;

  const numPayments = years * 12;
  const monthlyRate = rate / 12;
  const newMonthlyPayment = newLoanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
                           (Math.pow(1 + monthlyRate, numPayments) - 1);

  const totalMonthlyDebt = existingDebtPayment + newMonthlyPayment;
  const annualDebtService = totalMonthlyDebt * 12;

  return Number((netIncome / annualDebtService).toFixed(2));
}

// Calculate SBA eligibility and approval chances for OWNERS - VAPI version (returns single-line string)
export function calculateSBAEligibilityForOwnerVAPI(data: SBAEligibilityRequestOwner): string {
  const monthlyRevenue = parseInt(data.monthlyRevenue || '0');
  const monthlyExpenses = parseInt(data.monthlyExpenses || '0');
  const existingDebtPayment = parseInt(data.existingDebtPayment || '0');
  const requestedLoanAmount = parseInt(data.requestedLoanAmount || '0');
  const loanPurpose = data.loanPurpose?.toLowerCase() || '';
  const businessYearsRunning = typeof data.businessYearsRunning === 'number'
    ? data.businessYearsRunning
    : parseInt(data.businessYearsRunning as any) || 0;

  // Parse credit score as a plain number string
  const creditScoreValue = parseInt(data.ownerCreditScore || '0');
  const isCitizen = data.isUSCitizen;

  // Calculate net income (monthly revenue - monthly expenses)
  const monthlyNetIncome = monthlyRevenue - monthlyExpenses;
  const annualNetIncome = monthlyNetIncome * 12;

  // Determine down payment percentage based on loan purpose
  let requiredDownPayment = 0;
  let downPaymentPercent = 0;

  if (loanPurpose.includes('working capital')) {
    requiredDownPayment = 0;
    downPaymentPercent = 0;
  } else if (loanPurpose.includes('real estate') || loanPurpose.includes('property')) {
    requiredDownPayment = requestedLoanAmount * 0.10; // 10-15%, using 10% for calculation
    downPaymentPercent = 10;
  } else {
    // General purpose, assume 5-10% range
    requiredDownPayment = requestedLoanAmount * 0.05;
    downPaymentPercent = 5;
  }

  // Calculate DSCR including existing debt
  const dscr = calculateDSCRForOwner(
    annualNetIncome,
    existingDebtPayment,
    requestedLoanAmount,
    0.095,
    10
  );

  const reasons: string[] = [];
  const recommendations: string[] = [];
  let score = 100; // Start at 100, deduct points for issues

  // 1. Citizenship Check (HARD STOP)
  const citizenshipCheck = {
    passed: isCitizen,
    message: isCitizen
      ? 'US Citizen or Lawful Permanent Resident ✓'
      : 'Must be US Citizen or Lawful Permanent Resident'
  };

  if (!isCitizen) {
    return 'Ineligible for SBA loan, Non-US citizens are ineligible for SBA loans, Recommendation: Consider alternative lending options';
  }

  // 2. Credit Score Check
  let creditScoreCheck = { passed: true, message: 'Credit score not provided' };

  if (creditScoreValue > 0) {
    if (creditScoreValue >= 720) {
      creditScoreCheck = { passed: true, message: 'Excellent credit score (720+) ✓' };
      reasons.push('Strong credit profile');
    } else if (creditScoreValue >= 680) {
      creditScoreCheck = { passed: true, message: 'Good credit score (680-719) ✓' };
      score -= 5;
    } else if (creditScoreValue >= 650) {
      creditScoreCheck = { passed: true, message: 'Fair credit score (650-679)' };
      score -= 15;
      reasons.push('Credit score is on the lower end for SBA approval');
      recommendations.push('Consider improving credit score before applying');
    } else {
      creditScoreCheck = { passed: false, message: 'Credit score below 650 - High risk' };
      score -= 30;
      reasons.push('Credit score below SBA typical minimum (650)');
      recommendations.push('Work on improving credit score to 680+ for better approval odds');
    }
  }

  // 3. Business Age Check (Owner's existing business)
  let businessAgeCheck = { passed: true, message: 'Business age not provided' };

  if (businessYearsRunning !== null && businessYearsRunning !== undefined) {
    if (businessYearsRunning >= 5) {
      businessAgeCheck = { passed: true, message: `Established business (${businessYearsRunning} years) ✓` };
      reasons.push('Well-established business history');
    } else if (businessYearsRunning >= 2) {
      businessAgeCheck = { passed: true, message: `Business meets minimum (${businessYearsRunning} years) ✓` };
      score -= 5;
    } else {
      businessAgeCheck = { passed: false, message: `Business too young (${businessYearsRunning} years < 2 years required)` };
      score -= 40;
      reasons.push('Business must operate for minimum 2 years for SBA eligibility');
      recommendations.push('Wait until business reaches 2-year operating history');
    }
  }

  // 4. Down Payment Check (based on loan purpose)
  let downPaymentCheck = { passed: true, message: '' };

  if (loanPurpose.includes('working capital')) {
    downPaymentCheck = { passed: true, message: 'Working capital loan - No down payment required ✓' };
  } else if (loanPurpose.includes('real estate') || loanPurpose.includes('property')) {
    downPaymentCheck = { passed: true, message: `Real estate loan - 10-15% down payment required (${downPaymentPercent}%)` };
    recommendations.push('Prepare 10-15% down payment for real estate purchase');
  } else {
    downPaymentCheck = { passed: true, message: `General purpose loan - ${downPaymentPercent}% down payment may be required` };
  }

  // 5. Cash Flow / DSCR Check (includes existing debt)
  let cashFlowCheck = { passed: true, message: '' };

  if (monthlyRevenue <= 0 || monthlyExpenses < 0) {
    cashFlowCheck = { passed: false, message: 'Business revenue and expense data required' };
    score -= 30;
    reasons.push('Financial information required for approval');
    recommendations.push('Provide detailed financial statements showing monthly revenue and expenses');
  } else if (monthlyNetIncome <= 0) {
    cashFlowCheck = { passed: false, message: 'Business is not profitable - cannot support additional debt' };
    score -= 50;
    reasons.push('Business must show positive net income to qualify');
    recommendations.push('Improve business profitability before seeking additional financing');
  } else if (dscr >= 1.35) {
    cashFlowCheck = { passed: true, message: `Excellent cash flow coverage (DSCR: ${dscr.toFixed(2)}) ✓` };
    reasons.push('Strong debt service coverage ratio including existing debt');
  } else if (dscr >= 1.25) {
    cashFlowCheck = { passed: true, message: `Good cash flow coverage (DSCR: ${dscr.toFixed(2)}) ✓` };
    score -= 5;
  } else if (dscr >= 1.15) {
    cashFlowCheck = { passed: true, message: `Adequate cash flow coverage (DSCR: ${dscr.toFixed(2)})` };
    score -= 15;
    reasons.push('Cash flow is at minimum threshold for SBA approval');
    recommendations.push('Consider reducing loan amount to improve debt service coverage');
  } else {
    cashFlowCheck = { passed: false, message: `Insufficient cash flow (DSCR: ${dscr.toFixed(2)} < 1.15 required)` };
    score -= 40;
    reasons.push('Business cash flow cannot support additional SBA loan payments with existing debt');
    recommendations.push('Reduce requested loan amount or pay down existing debt first');
    recommendations.push('Increase business profitability to improve cash flow');
  }

  // 6. Existing Debt Consideration
  if (existingDebtPayment > 0) {
    const debtToIncomeRatio = (existingDebtPayment * 12) / annualNetIncome;
    if (debtToIncomeRatio > 0.5) {
      score -= 10;
      reasons.push('High existing debt burden relative to income');
      recommendations.push('Consider paying down existing debt before taking on additional financing');
    }
  }

  // 7. Loan Amount Validation
  if (requestedLoanAmount > annualNetIncome * 3) {
    score -= 15;
    reasons.push('Requested loan amount is high relative to annual income');
    recommendations.push('Consider reducing loan request to align with cash flow capacity');
  }

  // Calculate final approval chance
  score = Math.max(0, Math.min(100, score)); // Clamp between 0-100

  let approvalChance: 'High' | 'Medium' | 'Low' | 'Very Low' | 'Ineligible';
  let eligible = true;

  if (score >= 80) {
    approvalChance = 'High';
  } else if (score >= 60) {
    approvalChance = 'Medium';
  } else if (score >= 40) {
    approvalChance = 'Low';
  } else if (score >= 20) {
    approvalChance = 'Very Low';
  } else {
    approvalChance = 'Ineligible';
    eligible = false;
  }

  // Add general recommendations if not already high approval
  if (score < 80) {
    if (!recommendations.length) {
      recommendations.push('Prepare comprehensive business plan with 3-year projections');
      recommendations.push('Gather all required SBA documentation in advance');
      recommendations.push('Consider working with an SBA-experienced business consultant');
    }
  }

  // Build single-line string response
  const parts: string[] = [];

  // Add approval chance and percentage
  parts.push(`Approval Chance: ${approvalChance}`);
  parts.push(`Score: ${score} out of 100`);

  // Add eligibility status
  parts.push(eligible ? 'Eligible for SBA loan' : 'Not eligible for SBA loan');

  // Add citizenship check
  parts.push(citizenshipCheck.message);

  // Add credit score check
  parts.push(creditScoreCheck.message);

  // Add business age check
  parts.push(businessAgeCheck.message);

  // Add down payment check
  if (downPaymentCheck.message) {
    parts.push(downPaymentCheck.message);
  }

  // Add cash flow check
  if (cashFlowCheck.message) {
    parts.push(cashFlowCheck.message);
  }

  // Add reasons
  if (reasons.length > 0) {
    parts.push(`Reasons: ${reasons.join(', ')}`);
  }

  // Add recommendations
  if (recommendations.length > 0) {
    parts.push(`Recommendations: ${recommendations.join(', ')}`);
  }

  // Join all parts with commas
  return parts.join(', ');
}