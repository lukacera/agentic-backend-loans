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
import { sendEmail } from './emailSender.js';
import { composeEmail, createEmailAgent } from '../agents/EmailAgent.js';
import { createDocumentAgent } from '../agents/DocumentAgent.js';
import { fillPDFForm, mapDataWithAI, extractFormFields } from './pdfFormProcessor.js';

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
    const generatedDocuments = await generateSBADocuments(
      application.applicantData, 
      application.applicationId
    );
    
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
            loanType: "7(a) loan", 
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
          console.log(`Generated document: ${outputFileName} at path: ${fillResult.outputPath}`);
          
          // Verify file exists and check size
          if (await fs.pathExists(fillResult.outputPath)) {
            const stats = await fs.stat(fillResult.outputPath);
            console.log(`Document file verified: ${stats.size} bytes`);
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
    
    console.log(`Document generation completed. Generated ${generatedFiles.length} files:`, generatedFiles);
    return generatedFiles;
    
  } catch (error) {
    console.error('Error generating SBA documents:', error);
    throw error;
  }
};

// Send application email with documents
const sendApplicationEmail = async (
  application: ApplicationDocument,
  documentPaths: string[]
): Promise<void> => {
  try {
    console.log(`Starting email sending process for application ${application.applicationId}`);
    console.log(`Document paths received:`, documentPaths);
    
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
        
        console.log(`Added attachment: ${fileName} from path: ${docPath}`);
      } else {
        console.warn(`Document file not found: ${docPath}`);
      }
    }
    
    // Generate professional email content using EmailAgent
    const emailAgent = createEmailAgent();
    
    const emailComposition = {
      recipients: [application.bankEmail],
      subject: `SBA Loan Application Submission - Application ID: ${application.applicationId}`,
      purpose: 'NEW LOAN APPLICATION' as any,
      tone: 'PROFESSIONAL' as any,
      keyPoints: [
        `New SBA loan application for business with ${application.applicantData.yearsInBusiness} years of operation`,
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
      console.log(`Sending email to ${application.bankEmail} with ${attachments.length} attachments`);
      
      const emailInfo = await sendEmail({
        to: [application.bankEmail],
        subject: emailResult.data.subject,
        html: emailResult.data.body,
        text: emailResult.data.body.replace(/<[^>]*>/g, ''), // Strip HTML for text version
        attachments
      });
      
      console.log(`Application email sent successfully for ${application.applicationId}`);
      console.log(`Email message ID: ${emailInfo.messageId}`);
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