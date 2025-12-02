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