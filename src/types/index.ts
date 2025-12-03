// ==============================
// COMMON TYPES
// ==============================

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
  creditScore: number;
  annualRevenue: number;
  yearFounded: number;
}

export interface SBAApplication {
  _id?: string;
  applicationId: string;
  applicantData: SBAApplicationData;
  status: ApplicationStatus;
  documentsGenerated: boolean;
  emailSent: boolean;
  generatedDocuments: string[];
  createdAt: Date;
  updatedAt: Date;
  bankEmail: string;
}

export enum ApplicationStatus {
  SUBMITTED = 'submitted',
  PROCESSING = 'processing',
  DOCUMENTS_GENERATED = 'documents_generated',
  SENT_TO_BANK = 'sent_to_bank',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled'
}

export interface ApplicationSubmissionRequest {
  name: string;
  businessName: string;
  businessPhoneNumber: string;
  creditScore: number;
  annualRevenue: number;
  yearFounded: number;
}

export interface ApplicationResponse {
  applicationId: string;
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