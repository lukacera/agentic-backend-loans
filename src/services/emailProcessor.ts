import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  EmailMessage,
  EmailThread,
  EmailTemplate,
  EmailDraft,
  EmailComposition,
  EmailReplyContext,
  EmailAnalysisResult,
  EmailGenerationResult,
  EmailStatus,
  EmailPriority,
  ThreadStatus,
  TemplateCategory,
  EmailTone,
  EmailPurpose,
  ReplyType
} from '../types';

// Storage paths
const EMAILS_DIR = path.join(process.cwd(), 'processed', 'emails');
const THREADS_DIR = path.join(EMAILS_DIR, 'threads');
const TEMPLATES_DIR = path.join(EMAILS_DIR, 'templates');
const DRAFTS_DIR = path.join(EMAILS_DIR, 'drafts');

// Initialize email storage
export const initializeEmailStorage = async (): Promise<void> => {
  await fs.ensureDir(EMAILS_DIR);
  await fs.ensureDir(THREADS_DIR);
  await fs.ensureDir(TEMPLATES_DIR);
  await fs.ensureDir(DRAFTS_DIR);
  
  // Create default templates if they don't exist
  await createDefaultTemplates();
  
  console.log('Email storage initialized successfully');
};

// Create default email templates
const createDefaultTemplates = async (): Promise<void> => {
  const defaultTemplates: Partial<EmailTemplate>[] = [
    {
      name: 'Business Introduction',
      subject: 'Introduction: {{senderName}} from {{companyName}}',
      body: `Dear {{recipientName}},

I hope this email finds you well. My name is {{senderName}} and I am {{position}} at {{companyName}}.

{{introduction}}

{{callToAction}}

Best regards,
{{senderName}}
{{companyName}}`,
      category: TemplateCategory.BUSINESS,
      variables: [
        { name: 'recipientName', type: 'string', required: true },
        { name: 'senderName', type: 'string', required: true },
        { name: 'companyName', type: 'string', required: true },
        { name: 'position', type: 'string', required: true },
        { name: 'introduction', type: 'string', required: true },
        { name: 'callToAction', type: 'string', required: true }
      ]
    },
    {
      name: 'Follow Up',
      subject: 'Following up on {{subject}}',
      body: `Hi {{recipientName}},

I wanted to follow up on {{previousContext}}.

{{followUpContent}}

Please let me know if you have any questions or need additional information.

Best regards,
{{senderName}}`,
      category: TemplateCategory.FOLLOW_UP,
      variables: [
        { name: 'recipientName', type: 'string', required: true },
        { name: 'senderName', type: 'string', required: true },
        { name: 'subject', type: 'string', required: true },
        { name: 'previousContext', type: 'string', required: true },
        { name: 'followUpContent', type: 'string', required: true }
      ]
    },
    {
      name: 'Thank You',
      subject: 'Thank you for {{reason}}',
      body: `Dear {{recipientName}},

Thank you for {{reason}}. {{gratitudeMessage}}

{{nextSteps}}

I look forward to {{futureInteraction}}.

Warm regards,
{{senderName}}`,
      category: TemplateCategory.THANK_YOU,
      variables: [
        { name: 'recipientName', type: 'string', required: true },
        { name: 'senderName', type: 'string', required: true },
        { name: 'reason', type: 'string', required: true },
        { name: 'gratitudeMessage', type: 'string', required: true },
        { name: 'nextSteps', type: 'string', required: false },
        { name: 'futureInteraction', type: 'string', required: true }
      ]
    }
  ];

  for (const template of defaultTemplates) {
    const templateId = uuidv4();
    const fullTemplate: EmailTemplate = {
      id: templateId,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...template as EmailTemplate
    };
    
    const templatePath = path.join(TEMPLATES_DIR, `${templateId}.json`);
    if (!(await fs.pathExists(templatePath))) {
      await fs.writeJson(templatePath, fullTemplate, { spaces: 2 });
    }
  }
};

// Create email metadata
export const createEmailMetadata = (
  subject: string,
  from: string,
  to: string[],
  body: string,
  threadId?: string
): EmailMessage => {
  return {
    id: uuidv4(),
    subject,
    body,
    from,
    to,
    createdAt: new Date(),
    updatedAt: new Date(),
    threadId,
    priority: EmailPriority.NORMAL,
    status: EmailStatus.DRAFT
  };
};

// Save email message
export const saveEmailMessage = async (email: EmailMessage): Promise<void> => {
  const emailPath = path.join(EMAILS_DIR, `${email.id}.json`);
  await fs.writeJson(emailPath, email, { spaces: 2 });
};
const convertDraftToEmailMessage = (draft: EmailDraft): EmailMessage => {
  return {
    id: draft.id,
    subject: draft.subject,
    body: draft.body,
    from: 'team@salestorvely.com', // You'd need to set this appropriately
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    priority: EmailPriority.NORMAL,
    status: EmailStatus.DRAFT
  };
};
// Load email message
export const loadEmailMessage = async (emailId: string): Promise<EmailMessage | null> => {
  try {
    // First, try the main emails directory
    const emailPath = path.join(EMAILS_DIR, `${emailId}.json`);
    if (await fs.pathExists(emailPath)) {
      return await fs.readJson(emailPath);
    }
    
    // If not found, try the drafts folder
    const draftPath = path.join(DRAFTS_DIR, `${emailId}.json`);
    if (await fs.pathExists(draftPath)) {
      const draft = await fs.readJson(draftPath);
      // Convert draft to EmailMessage format if needed
      return convertDraftToEmailMessage(draft);
    }
    
    return null;
  } catch (error) {
    console.error('Error loading email:', error);
    return null;
  }
};

// Save email draft
export const saveEmailDraft = async (draft: EmailDraft): Promise<void> => {
  const draftPath = path.join(DRAFTS_DIR, `${draft.id}.json`);
  await fs.writeJson(draftPath, draft, { spaces: 2 });
};

// Load email draft
export const loadEmailDraft = async (draftId: string): Promise<EmailDraft | null> => {
  try {
    const draftPath = path.join(DRAFTS_DIR, `${draftId}.json`);
    if (await fs.pathExists(draftPath)) {
      return await fs.readJson(draftPath);
    }
    return null;
  } catch (error) {
    console.error('Error loading draft:', error);
    return null;
  }
};

// List all email drafts
export const listEmailDrafts = async (): Promise<EmailDraft[]> => {
  try {
    const files = await fs.readdir(DRAFTS_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    const drafts: EmailDraft[] = [];
    for (const file of jsonFiles) {
      try {
        const draft = await fs.readJson(path.join(DRAFTS_DIR, file));
        drafts.push(draft);
      } catch (error) {
        console.error(`Error reading draft file ${file}:`, error);
      }
    }
    
    return drafts.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch (error) {
    console.error('Error listing drafts:', error);
    return [];
  }
};

// Delete email draft
export const deleteEmailDraft = async (draftId: string): Promise<boolean> => {
  try {
    const draftPath = path.join(DRAFTS_DIR, `${draftId}.json`);
    if (await fs.pathExists(draftPath)) {
      await fs.remove(draftPath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting draft:', error);
    return false;
  }
};

// Save email template
export const saveEmailTemplate = async (template: EmailTemplate): Promise<void> => {
  const templatePath = path.join(TEMPLATES_DIR, `${template.id}.json`);
  await fs.writeJson(templatePath, template, { spaces: 2 });
};

// Load email template
export const loadEmailTemplate = async (templateId: string): Promise<EmailTemplate | null> => {
  try {
    const templatePath = path.join(TEMPLATES_DIR, `${templateId}.json`);
    if (await fs.pathExists(templatePath)) {
      return await fs.readJson(templatePath);
    }
    return null;
  } catch (error) {
    console.error('Error loading template:', error);
    return null;
  }
};

// List all email templates
export const listEmailTemplates = async (): Promise<EmailTemplate[]> => {
  try {
    const files = await fs.readdir(TEMPLATES_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    const templates: EmailTemplate[] = [];
    for (const file of jsonFiles) {
      try {
        const template = await fs.readJson(path.join(TEMPLATES_DIR, file));
        templates.push(template);
      } catch (error) {
        console.error(`Error reading template file ${file}:`, error);
      }
    }
    
    return templates.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error listing templates:', error);
    return [];
  }
};

// Apply template variables
export const applyTemplateVariables = (
  template: string,
  variables: Record<string, any>
): string => {
  let result = template;
  
  // Replace {{variableName}} with actual values
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, String(value || ''));
  });
  
  return result;
};

// Validate template variables
export const validateTemplateVariables = (
  template: EmailTemplate,
  variables: Record<string, any>
): { valid: boolean; missingRequired: string[] } => {
  const requiredVars = template.variables.filter(v => v.required);
  const missingRequired = requiredVars
    .filter(v => !variables[v.name] || variables[v.name] === '')
    .map(v => v.name);
  
  return {
    valid: missingRequired.length === 0,
    missingRequired
  };
};

// Create email thread
export const createEmailThread = (subject: string, participants: string[]): EmailThread => {
  return {
    id: uuidv4(),
    subject,
    participants,
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    status: ThreadStatus.OPEN
  };
};

// Save email thread
export const saveEmailThread = async (thread: EmailThread): Promise<void> => {
  const threadPath = path.join(THREADS_DIR, `${thread.id}.json`);
  await fs.writeJson(threadPath, thread, { spaces: 2 });
};

// Load email thread
export const loadEmailThread = async (threadId: string): Promise<EmailThread | null> => {
  try {
    const threadPath = path.join(THREADS_DIR, `${threadId}.json`);
    if (await fs.pathExists(threadPath)) {
      return await fs.readJson(threadPath);
    }
    return null;
  } catch (error) {
    console.error('Error loading thread:', error);
    return null;
  }
};