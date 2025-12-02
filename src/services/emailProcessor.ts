import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  EmailMessage,
  EmailThread,
  EmailDraft,
  EmailStatus,
  EmailPriority,
  ThreadStatus,
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