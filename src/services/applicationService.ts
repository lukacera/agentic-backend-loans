import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs-extra';
import { Application } from '../models/Application.js';
import {
  SBAApplicationData,
  ApplicationStatus,
  ApplicationResponse,
  DocumentStorageInfo,
  SBAApplication,
} from '../types/index.js';
import { sendEmail } from './emailSender.js';
import { composeEmail, createEmailAgent } from '../agents/EmailAgent.js';
import { createDocumentAgent } from '../agents/DocumentAgent.js';
import { fillPDFForm, mapDataWithAI, extractFormFields } from './pdfFormProcessor.js';
import {
  uploadDocumentWithRetry,
  downloadDocument,
  generatePresignedUrl,
  deleteDocument
} from './s3Service.js';

const TEMPLATES_DIR = path.join(process.cwd(), 'templates');
const GENERATED_DIR = path.join(process.cwd(), 'generated');

// Ensure directories exist
const initializeDirectories = async (): Promise<void> => {
  await fs.ensureDir(GENERATED_DIR);
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
      generatedDocuments: [],
      bankEmail: process.env.BANK_EMAIL || 'lukaceranic38@gmail.com'
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

    console.log(`Application ${application._id} ready for signature`);

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
        const formData = await mapDataWithAI(
          formAnalysis.fields,
          {...applicantData, 
            "7(a) loan/04 loan/Surety Bonds1`": "7(a) loan", 
            businessType: "LLC",
            infoCurrentDate: new Date().toLocaleDateString()
          },
          documentAgent,
          `This is an SBA loan application form (${formName}). Map the business application data to the appropriate form fields.`
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

      console.log(`Uploading ${fileName} to S3...`);

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

      console.log(`Successfully uploaded ${fileName} to S3`);
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
        console.log(`Cleaned up local file: ${filePath}`);
      }
    } catch (error) {
      console.error(`Failed to clean up file ${filePath}:`, error);
      // Don't throw - cleanup failures shouldn't break the flow
    }
  }
};

// Send application email with documents
const sendApplicationEmail = async (
  application: SBAApplication,
  documentPaths: string[]
): Promise<void> => {
  try {
    
    // Prepare email attachments
    const attachments = [];
    
    for (const docPath of documentPaths) {
      if (await fs.pathExists(docPath)) {
        const fileName = path.basename(docPath);
        
        // Use file path directly - more efficient than base64 encoding
        attachments.push({
          filename: fileName,
          path: docPath,
          contentType: 'application/pdf'
        });
        
      } else {
        console.warn(`Document file not found: ${docPath}`);
      }
    }
    
    // Generate professional email content using EmailAgent
    const emailAgent = createEmailAgent();
    
    const emailComposition = {
      recipients: [application.bankEmail],
      subject: `SBA Loan Application Submission - Application ID: ${application._id}`,
      purpose: 'NEW LOAN APPLICATION' as any,
      tone: 'PROFESSIONAL' as any,
      keyPoints: [
        `New SBA loan application`,
        `Annual revenue: $${application.applicantData.annualRevenue.toLocaleString()}`,
        `Credit score: ${application.applicantData.creditScore}`,
        'All required SBA forms completed and attached',
        'Ready for review and processing'
      ],
      context: 'We are a tool which helps businesses apply for SBA loans by generating necessary documents and composing emails to banks. All needed info is there, if they need anything else, ask them. Be concise and professional.' 
    };
    
    const emailResult = await composeEmail(emailAgent, emailComposition);
    
    if (emailResult.success && emailResult.data) {
      // Send the email with attachments
      
      const emailInfo = await sendEmail({
        to: [application.bankEmail],
        subject: emailResult.data.subject,
        html: emailResult.data.body,
        text: emailResult.data.body.replace(/<[^>]*>/g, ''), // Strip HTML for text version
        attachments
      });
      
    } else {
      throw new Error(`Failed to compose email: ${emailResult.error}`);
    }
    
  } catch (error) {
    console.error('Error sending application email:', error);
    throw error;
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
      console.log(`Uploading signed document: ${doc.fileName}`);

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

    console.log(`Signed documents processed for application ${applicationId}`);

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

// Download signed documents from S3
const downloadSignedDocumentsFromS3 = async (
  signedDocuments: DocumentStorageInfo[]
): Promise<Array<{ fileName: string; buffer: Buffer }>> => {
  const documentBuffers = [];

  for (const doc of signedDocuments) {
    try {
      console.log(`Downloading signed document from S3: ${doc.fileName}`);
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
  documentBuffers: Array<{ fileName: string; buffer: Buffer }>
): Promise<void> => {
  try {
    // Prepare email attachments from buffers
    const attachments = documentBuffers.map(doc => ({
      filename: doc.fileName,
      content: doc.buffer,
      contentType: 'application/pdf'
    }));

    // Generate professional email content using EmailAgent
    const emailAgent = createEmailAgent();

    const emailComposition = {
      recipients: [application.bankEmail],
      subject: `SBA Loan Application Submission - ${application.applicantData.businessName}`,
      purpose: 'NEW LOAN APPLICATION' as any,
      tone: 'PROFESSIONAL' as any,
      keyPoints: [
        `New SBA loan application from ${application.applicantData.businessName}`,
        `Annual revenue: $${application.applicantData.annualRevenue.toLocaleString()}`,
        `Credit score: ${application.applicantData.creditScore}`,
        'All required SBA forms completed, signed, and attached',
        'Ready for review and processing'
      ],
      context: `Signed loan application documents for ${application.applicantData.businessName}. All documents have been electronically signed and are ready for bank review.`
    };

    const emailResult = await composeEmail(emailAgent, emailComposition);

    if (emailResult.success && emailResult.data) {
      await sendEmail({
        to: [application.bankEmail],
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

    if (application.status !== ApplicationStatus.SIGNED) {
      throw new Error(`Cannot submit to bank. Documents must be signed first. Current status: ${application.status}`);
    }

    if (application.signedDocuments.length === 0) {
      throw new Error('No signed documents found');
    }

    // Download signed documents from S3
    const documentBuffers = await downloadSignedDocumentsFromS3(
      application.signedDocuments
    );

    // Send email with signed documents
    await sendApplicationEmailWithS3Docs(application, documentBuffers);

    // Update application
    application.status = ApplicationStatus.SENT_TO_BANK;
    application.emailSent = true;
    application.emailSentAt = new Date();
    await application.save();

    console.log(`Application ${applicationId} submitted to bank`);

    return {
      status: ApplicationStatus.SENT_TO_BANK,
      message: 'Application submitted to bank successfully'
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
    }).exec();
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
    console.log('Searching for phone number with sanitized input:', sanitizedPhone, 'and digits only:', digitsOnly);
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

    return await Application.findOne({ $or: orConditions }).exec();
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