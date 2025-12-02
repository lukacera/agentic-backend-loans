import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs-extra';
import { Application, ApplicationDocument } from '../models/Application.js';
import { 
  SBAApplicationData, 
  ApplicationStatus, 
  ApplicationResponse,
  PDFFormData 
} from '../types/index.js';

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
    
    const applicationId = uuidv4();
    
    // Create application in MongoDB
    const application = new Application({
      applicationId,
      applicantData,
      status: ApplicationStatus.SUBMITTED,
      documentsGenerated: false,
      emailSent: false,
      generatedDocuments: [],
      bankEmail: 'lukaceranic38@gmail.com'
    });
    
    await application.save();
    
    // Start async processing
    processApplicationAsync(application);
    
    return {
      applicationId,
      status: ApplicationStatus.SUBMITTED,
      message: 'Application submitted successfully. Documents are being prepared and will be sent to the bank shortly.'
    };
    
  } catch (error) {
    console.error('Error creating application:', error);
    throw new Error(`Failed to create application: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Async processing of application (documents + email)
const processApplicationAsync = async (application: ApplicationDocument): Promise<void> => {
  try {
    // Update status to processing
    application.status = ApplicationStatus.PROCESSING;
    await application.save();
    
    // Generate documents using DocumentAgent and form processor
    const generatedDocuments = await generateSBADocuments(application.applicantData, application.applicationId);
    
    // Update application with generated documents
    application.generatedDocuments = generatedDocuments;
    application.documentsGenerated = true;
    application.status = ApplicationStatus.DOCUMENTS_GENERATED;
    await application.save();
    
    // Send email with documents
    await sendApplicationEmail(application, generatedDocuments);
    
    // Update final status
    application.emailSent = true;
    application.status = ApplicationStatus.SENT_TO_BANK;
    await application.save();
    
    console.log(`Application ${application.applicationId} processed successfully`);
    
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
    const { createDocumentAgent } = await import('../agents/DocumentAgent.js');
    const { extractFormFields, fillPDFForm } = await import('./pdfFormProcessor.js');
    
    const sbaForms = ['SBAForm1919.pdf', 'SBAForm413.pdf'];
    
    for (const formName of sbaForms) {
      const templatePath = path.join(TEMPLATES_DIR, formName);
      const outputFileName = `${applicationId}_${formName}`;
      const outputPath = path.join(GENERATED_DIR, outputFileName);
      
      // Check if template exists
      if (!await fs.pathExists(templatePath)) {
        console.warn(`Template not found: ${templatePath}`);
        continue;
      }
      
      // Map applicant data to form fields
      const formData = mapDataToSBAForm(applicantData, formName);
      
      // Fill the PDF form
      const fillResult = await fillPDFForm({
        templatePath,
        data: formData,
        outputFileName,
        aiAssist: true, // Use AI to help map fields intelligently
        customInstructions: `This is an SBA loan application for a business with ${applicantData.yearsInBusiness} years in operation, ${applicantData.annualRevenue} annual revenue, and ${applicantData.creditScore} credit score. Fill all relevant fields appropriately.`
      });
      
      if (fillResult.success && fillResult.outputPath) {
        generatedFiles.push(fillResult.outputPath);
        console.log(`Generated document: ${outputFileName}`);
      } else {
        console.error(`Failed to generate ${formName}:`, fillResult.error);
      }
    }
    
    return generatedFiles;
    
  } catch (error) {
    console.error('Error generating SBA documents:', error);
    throw error;
  }
};

// Map application data to SBA form fields
const mapDataToSBAForm = (applicantData: SBAApplicationData, formName: string): PDFFormData => {
  const baseData: PDFFormData = {
    // Common fields that might appear in SBA forms
    creditScore: applicantData.creditScore,
    annualRevenue: applicantData.annualRevenue,
    yearsInBusiness: applicantData.yearsInBusiness,
    
    // Derived fields
    monthlyRevenue: Math.round(applicantData.annualRevenue / 12),
    businessEstablished: new Date().getFullYear() - applicantData.yearsInBusiness,
    
    // Standard application info
    applicationDate: new Date().toLocaleDateString(),
    submissionDate: new Date().toISOString().split('T')[0]
  };
  
  // Form-specific field mapping
  if (formName.includes('1919')) {
    return {
      ...baseData,
      // Form 1919 specific fields
      loanAmount: Math.min(applicantData.annualRevenue * 0.25, 500000), // Estimate loan amount
      businessType: 'Corporation', // Default for now
      naicsCode: '000000' // Default placeholder
    };
  }
  
  if (formName.includes('413')) {
    return {
      ...baseData,
      // Form 413 specific fields  
      personalGuarantee: true,
      collateralOffered: applicantData.annualRevenue > 100000
    };
  }
  
  return baseData;
};

// Send application email with documents
const sendApplicationEmail = async (
  application: ApplicationDocument,
  documentPaths: string[]
): Promise<void> => {
  try {
    const { createEmailAgent, composeEmail } = await import('../agents/EmailAgent.js');
    const { sendEmail } = await import('./emailSender.js');
    
    // Prepare email attachments
    const attachments = [];
    
    for (const docPath of documentPaths) {
      if (await fs.pathExists(docPath)) {
        const fileContent = await fs.readFile(docPath);
        const fileName = path.basename(docPath);
        
        attachments.push({
          content: fileContent.toString('base64'),
          filename: fileName,
          type: 'application/pdf',
          disposition: 'attachment'
        });
      }
    }
    
    // Generate professional email content using EmailAgent
    const emailAgent = createEmailAgent();
    
    const emailComposition = {
      recipients: [application.bankEmail],
      subject: `SBA Loan Application Submission - Application ID: ${application.applicationId}`,
      purpose: 'PROPOSAL' as any,
      tone: 'PROFESSIONAL' as any,
      keyPoints: [
        `New SBA loan application for business with ${application.applicantData.yearsInBusiness} years of operation`,
        `Annual revenue: $${application.applicantData.annualRevenue.toLocaleString()}`,
        `Credit score: ${application.applicantData.creditScore}`,
        'All required SBA forms completed and attached',
        'Ready for review and processing'
      ],
      context: 'SBA loan application submission with completed forms'
    };
    
    const emailResult = await composeEmail(emailAgent, emailComposition);
    
    if (emailResult.success && emailResult.data) {
      // Send the email with attachments
      await sendEmail({
        to: [application.bankEmail],
        subject: emailResult.data.subject,
        html: emailResult.data.body,
        text: emailResult.data.body.replace(/<[^>]*>/g, ''), // Strip HTML for text version
        attachments
      });
      
      console.log(`Application email sent successfully for ${application.applicationId}`);
    } else {
      throw new Error(`Failed to compose email: ${emailResult.error}`);
    }
    
  } catch (error) {
    console.error('Error sending application email:', error);
    throw error;
  }
};

// Get application by ID
export const getApplication = async (applicationId: string): Promise<ApplicationDocument | null> => {
  try {
    return await Application.findOne({ applicationId }).exec();
  } catch (error) {
    console.error('Error fetching application:', error);
    throw error;
  }
};

// Get all applications with pagination
export const getApplications = async (
  page: number = 1,
  limit: number = 10,
  status?: ApplicationStatus
): Promise<{ applications: ApplicationDocument[], total: number, page: number, pages: number }> => {
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