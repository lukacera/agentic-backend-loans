import { Document, ObjectId } from "mongoose";

export interface AgentConfig {
  name: string;
  enabled: boolean;
  maxConcurrentTasks: number;
  timeout: number;
}

export interface BaseAgentResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
  processingTime: number;
}

export interface AgentStatus {
  name: string;
  status: 'active' | 'inactive' | 'error';
  uptime: number;
  tasksProcessed: number;
  lastActivity: Date;
  currentLoad: number;
}

// ==============================
// DOCUMENT TYPES
// ==============================

export interface DocumentMetadata {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  processedAt?: Date;
  status: DocumentStatus;
  filePath: string;
}

export interface ProcessedDocument {
  id: string;
  content: string;
  summary?: string;
  metadata: DocumentMetadata;
  processingResult: ProcessingResult;
}

export interface ProcessingResult {
  success: boolean;
  extractedText: string;
  wordCount: number;
  pageCount?: number;
  language?: string;
  aiAnalysis?: AIAnalysis;
  error?: string;
  processingTime: number;
}

export interface AIAnalysis {
  summary: string;
  keyPoints: string[];
  category?: string;
  sentiment?: string;
  extractedEntities?: string[];
}

export interface DocumentUploadRequest {
  processImmediately?: boolean;
  analysisType?: AnalysisType;
  customPrompt?: string;
}

export interface DocumentProcessRequest {
  documentId: string;
  analysisType: AnalysisType;
  customPrompt?: string;
}

export enum DocumentStatus {
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed'
}

export enum AnalysisType {
  SUMMARY = 'summary',
  EXTRACTION = 'extraction',
  ANALYSIS = 'analysis',
  CUSTOM = 'custom'
}

export enum SupportedMimeTypes {
  PDF = 'application/pdf',
  DOC = 'application/msword',
  DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  TXT = 'text/plain',
  MD = 'text/markdown'
}

// ==============================
// EMAIL TYPES
// ==============================

export interface EmailMessage {
  id: string;
  subject: string;
  body: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  createdAt: Date;
  updatedAt: Date;
  threadId?: string;
  inReplyTo?: string;
  attachments?: EmailAttachment[];
  priority: EmailPriority;
  status: EmailStatus;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  data: Buffer | string;
}

export interface EmailThread {
  id: string;
  subject: string;
  participants: string[];
  messages: EmailMessage[];
  createdAt: Date;
  updatedAt: Date;
  status: ThreadStatus;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: TemplateVariable[];
  category: TemplateCategory;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  required: boolean;
  defaultValue?: any;
  description?: string;
}

export interface EmailDraft {
  id: string;
  subject: string;
  body: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  createdAt: Date;
  updatedAt: Date;
  templateId?: string;
  variables?: Record<string, any>;
}

export interface EmailReplyContext {
  originalMessage: EmailMessage;
  replyType: ReplyType;
  tone: EmailTone;
  includeOriginal: boolean;
  customInstructions?: string;
}

export interface EmailComposition {
  recipients: string[];
  subject: string;
  purpose: EmailPurpose;
  tone: EmailTone;
  keyPoints: string[];
  context?: string;
  templateId?: string;
  variables?: Record<string, any>;
}

export interface EmailAnalysisResult {
  sentiment: 'positive' | 'negative' | 'neutral';
  urgency: 'low' | 'medium' | 'high';
  intent: string;
  keyTopics: string[];
  suggestedActions: string[];
  requiresResponse: boolean;
  estimatedResponseTime: string;
}

export interface EmailGenerationResult {
  success: boolean;
  email?: EmailMessage | EmailDraft;
  suggestions?: string[];
  error?: string;
}

// Email Enums
export enum EmailPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum EmailStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  REPLIED = 'replied',
  FORWARDED = 'forwarded',
  FAILED = 'failed'
}

export enum ThreadStatus {
  OPEN = 'open',
  CLOSED = 'closed',
  ARCHIVED = 'archived'
}

export enum TemplateCategory {
  BUSINESS = 'business',
  PERSONAL = 'personal',
  MARKETING = 'marketing',
  SUPPORT = 'support',
  NOTIFICATION = 'notification',
  FOLLOW_UP = 'follow_up',
  INTRODUCTION = 'introduction',
  THANK_YOU = 'thank_you'
}

export enum ReplyType {
  REPLY = 'reply',
  REPLY_ALL = 'reply_all',
  FORWARD = 'forward'
}

export enum EmailTone {
  PROFESSIONAL = 'professional',
  FRIENDLY = 'friendly',
  FORMAL = 'formal',
  CASUAL = 'casual',
  URGENT = 'urgent',
  APOLOGETIC = 'apologetic',
  ENTHUSIASTIC = 'enthusiastic',
  NEUTRAL = 'neutral'
}

export enum EmailPurpose {
  INQUIRY = 'inquiry',
  RESPONSE = 'response',
  FOLLOW_UP = 'follow_up',
  INTRODUCTION = 'introduction',
  THANK_YOU = 'thank_you',
  REMINDER = 'reminder',
  NOTIFICATION = 'notification',
  INVITATION = 'invitation',
  PROPOSAL = 'proposal',
  COMPLAINT = 'complaint',
  APOLOGY = 'apology'
}

export interface SBAApplicationData {
  name: string;
  businessName: string;
  businessPhoneNumber: string;
  isUSCitizen: boolean;
  creditScore: number;
  yearFounded: number;
  userType: "owner" | "buyer";
  annualRevenue?: number;
  monthlyRevenue?: string;
  monthlyExpenses?: string;
  existingDebtPayment?: string;
  requestedLoanAmount?: string;
  loanPurpose?: string;
  ownerCreditScore?: string;
  purchasePrice?: string;
  availableCash?: string;
  businessCashFlow?: string;
  buyerCreditScore?: string;
  industryExperience?: string;
  businessYearsRunning?: string | number;
}

export enum UserProvidedDocumentType {
  TAX_RETURN = 'taxReturn',
  L_AND_P = 'L&P'
}

export enum DefaultDocumentType {
  SBA_1919 = 'SBA_1919',
  SBA_413 = 'SBA_413'
}

export interface DocumentStorageInfo {
  fileName: string;
  s3Key: string;
  s3Url?: string;
  uploadedAt: Date;
  signedAt?: Date;
  fileType: UserProvidedDocumentType | DefaultDocumentType;
  signed?: boolean;
  generatedAt?: Date;
}

export enum BankSubmissionStatus {
  SUBMITTED = 'submitted',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected'
}

export interface BankSubmission {
  bank: string;
  status: BankSubmissionStatus;
  submittedAt: Date;
}

export interface SBAApplication extends Document {
  applicantData: SBAApplicationData;
  status: ApplicationStatus;
  documentsGenerated: boolean;
  generatedDocuments: string[];

  // Loan Chances
  loanChances?: StoredLoanChances;

  // Bank Submissions
  banks: BankSubmission[];
  offers: [{
    bank: string; // Bank _id
    offerDetails: {
      repaymentTermMonths: number;
      annualInterestRate: number;
      monthlyPayment: number;
      downPaymentRequired: number;
    },
    status: 'pending' | 'accepted' | 'declined';
    _id?: string
  }]

  // S3 Document Storage
  userProvidedDocuments: DocumentStorageInfo[];
  draftDocuments?: DocumentStorageInfo[]; // Draft PDFs for preview during call
  documentsUploadedToS3: boolean;
  s3UploadedAt?: Date;

  // Signing Metadata
  signingProvider?: 'docusign' | 'hellosign' | 'adobe_sign' | 'manual' | null;
  signingRequestId?: string;
  signingStatus: 'not_started' | 'pending' | 'completed' | 'declined' | 'expired';
  signedBy?: string;
  signedDate?: Date;

  // Email Tracking
  emailSentAt?: Date;

  // Legacy fields (keep for backwards compatibility)
  emailSent: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export enum ApplicationStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  PROCESSING = 'processing',
  DOCUMENTS_GENERATED = 'documents_generated',
  AWAITING_SIGNATURE = 'awaiting_signature',
  SIGNED = 'signed',
  SENT_TO_BANK = 'sent_to_bank',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled'
}

export interface ApplicationSubmissionRequest {
  name: string;
  businessName: string;
  businessPhone: string;
  creditScore: number;
  yearFounded: number;
  annualRevenue?: number;
  userType?: 'owner' | 'buyer';
  isUSCitizen?: boolean;
  monthlyRevenue?: string;
  monthlyExpenses?: string;
  existingDebtPayment?: string;
  requestedLoanAmount?: string;
  loanPurpose?: string;
  ownerCreditScore?: string;
  purchasePrice?: string;
  availableCash?: string;
  businessCashFlow?: string;
  buyerCreditScore?: string;
  industryExperience?: string;
  businessYearsRunning?: string | number;
}

export interface DraftApplicationRequest {
  name: string;
  businessName: string;
  businessPhone?: string;
  creditScore?: number;
  yearFounded?: number;
  annualRevenue?: number;
  userType?: 'owner' | 'buyer';
  isUSCitizen?: boolean;
  monthlyRevenue?: string;
  monthlyExpenses?: string;
  existingDebtPayment?: string;
  requestedLoanAmount?: string;
  loanPurpose?: string;
  ownerCreditScore?: string;
  purchasePrice?: string;
  availableCash?: string;
  businessCashFlow?: string;
  buyerCreditScore?: string;
  industryExperience?: string;
  businessYearsRunning?: string | number;
  loanChances?: {
    score: number;
    chance: 'low' | 'medium' | 'high';
    reasons: string[];
  };
}

export interface ApplicationResponse {
  status: ApplicationStatus;
  message: string;
  documentsGenerated?: string[];
}

// ==============================
// PDF FORM TYPES
// ==============================

export interface PDFFormField {
  name: string;
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'signature' | 'unknown';
  value?: string | boolean;
  options?: string[]; // For dropdowns and radio buttons
  required?: boolean;
  maxLength?: number;
  description?: string;
}

export interface PDFFormData {
  [fieldName: string]: string | boolean | number;
}

export interface FormFillingRequest {
  templatePath: string;
  data: PDFFormData;
  outputFileName?: string;
  aiAssist?: boolean; // Whether to use AI to map data to fields
  customInstructions?: string;
}

export interface FormFillingResponse {
  success: boolean;
  outputPath?: string;
  fieldsProcessed: number;
  unmappedFields?: string[];
  aiMappings?: { [originalField: string]: string };
  error?: string;
  processingTime: number;
}

export interface FormAnalysisResult {
  totalFields: number;
  fields: PDFFormField[];
  formTitle?: string;
  formDescription?: string;
  estimatedCompletionTime: number;
}

// ==============================
// VAPI WEBHOOK TYPES
// ==============================

export interface VapiToolCall {
  id: string;
  name: string;
  parameters: any;
}

export interface VapiMessage {
  type: string;
  call?: any;
  toolCallList?: VapiToolCall[];
  toolWithToolCallList?: any[];
  messages?: any[];
  status?: string;
  endedReason?: string;
  artifact?: any;
  transcript?: string;
  transcriptType?: string;
  role?: string;
   speaker?: string;
   words?: any[];
  output?: any;
  request?: string;
  destination?: any;
  input?: string;
  text?: string;
  sampleRate?: number;
  language?: string;
  turn?: number;
  chat?: any;
  session?: any;
}

export interface VapiWebhookPayload {
  message: VapiMessage;
}

// ==============================
// WEBSOCKET TYPES
// ==============================

export interface WebSocketEventPayload {
  event: string;
  type: string;
  timestamp: string;
  data: VapiMessage;
  metadata: {
    callId?: string;
    phoneNumber?: string;
  };
}

// ==============================
// BANK TYPES
// ==============================

export interface BankContact {
  name: string;
  email: string;
  position: string;
}

export interface BankDocumentRequirements {
  taxReturn: boolean;
  pAndL: boolean; // Using pAndL instead of p&l for valid JS property name
}

export interface BankRequirements {
  minimumCreditScore: number;
  minimumYearsInBusiness: number;
  documentsRequired: BankDocumentRequirements;
}

export interface Bank extends Document {
  name: string;
  logo?: string;
  contacts: BankContact;
  requirements: BankRequirements;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBankRequest {
  name: string;
  logo?: string;
  contacts: BankContact;
  requirements: BankRequirements;
}

export interface UpdateBankRequest {
  name?: string;
  logo?: string;
  contacts?: Partial<BankContact>;
  requirements?: Partial<BankRequirements>;
}

export interface BankListResponse {
  banks: Bank[];
  total: number;
  page: number;
  pages: number;
}

export interface LoanChanceResult {
  score: number;
  chance: 'low' | 'medium' | 'high';
  reasons: string[];
}

export interface StoredLoanChances {
  score: number;
  chance: 'low' | 'medium' | 'high';
  reasons: string[];
  calculatedAt?: Date;
}

// ==============================
// DRAFT PDF TYPES
// ==============================

export interface DraftPDFInfo {
  fileName: string;
  s3Key: string;
  s3Url: string;
  generatedAt: Date;
}

export interface FormRevealPayload {
  draftApplicationId: string;
  pdfUrls: DraftPDFInfo[];
  callId?: string;
  timestamp: string;
  source: string;
}

// ==============================
// CHATBOX AGENT TYPES
// ==============================

export interface ChatToolCall {
  name: string;
  arguments: Record<string, any>;
  result?: any;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ChatToolCall[];
  timestamp: Date;
}

export interface IChatSession {
  sessionId: string;
  messages: ChatMessage[];
  userData: Record<string, any>;
  applicationId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatResponse {
  message: string;
  toolResults?: {
    name: string;
    success: boolean;
    message: string;
    data?: any;
  }[];
  userData?: Record<string, any>;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

// ==============================
// CONVERSATION FLOW TYPES
// ==============================

export type ConversationFlow = 'continue_application' | 'new_application' | 'check_status' | null;