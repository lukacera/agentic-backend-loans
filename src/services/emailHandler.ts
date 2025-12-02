import { 
  createEmailAgent,
  generateEmailReply 
} from '../agents/EmailAgent.js';
import { 
  EmailReplyContext,
  EmailTone,
  ReplyType,
  EmailMessage,
  EmailStatus,
  EmailPriority 
} from '../types/index.js';
import { FetchedEmail } from './emailFetcher.js';

export interface EmailHandlerResult {
  reply: string;
  flagForReview: boolean;
}

// Create email agent for reply generation
const emailAgent = createEmailAgent();

// Convert FetchedEmail to EmailMessage format for the agent
function convertToEmailMessage(fetchedEmail: FetchedEmail): EmailMessage {
  return {
    id: fetchedEmail.messageId.replace(/[<>]/g, ''),
    subject: fetchedEmail.subject,
    body: fetchedEmail.body,
    from: fetchedEmail.from,
    to: ['agent@yourdomain.com'], // Placeholder for your agent email
    createdAt: fetchedEmail.date,
    updatedAt: new Date(),
    inReplyTo: fetchedEmail.inReplyTo,
    priority: EmailPriority.NORMAL,
    status: EmailStatus.DELIVERED,
  };
}

// Check if email should be flagged for human review
function shouldFlagForReview(email: FetchedEmail): boolean {
  const body = email.body.toLowerCase();
  const wordCount = email.body.split(/\s+/).length;
  
  // Flag very long emails (over 200 words)
  if (wordCount > 200) {
    return true;
  }
  
  // Flag emails with complex/sensitive keywords
  const sensitiveKeywords = [
    'complaint', 'refund', 'cancel', 'legal', 'lawsuit', 'angry', 'furious',
    'terrible', 'worst', 'horrible', 'disgusted', 'unacceptable', 'urgent',
    'emergency', 'asap', 'immediately', 'contract', 'billing issue', 'payment problem'
  ];
  
  const hasSensitiveContent = sensitiveKeywords.some(keyword => 
    body.includes(keyword)
  );
  
  if (hasSensitiveContent) {
    return true;
  }
  
  // Flag emails with multiple questions (complex inquiries)
  const questionMarks = (email.body.match(/\?/g) || []).length;
  if (questionMarks > 2) {
    return true;
  }
  
  // Flag emails that seem like they need human attention
  const needsHumanKeywords = [
    'speak to manager', 'human representative', 'real person', 'not automated',
    'escalate', 'supervisor', 'manager', 'director'
  ];
  
  const needsHuman = needsHumanKeywords.some(keyword => 
    body.includes(keyword)
  );
  
  return needsHuman;
}

// Generate AI reply using existing email agent
async function generateAIReply(email: FetchedEmail): Promise<string> {
  try {
    // Convert to EmailMessage format
    const emailMessage = convertToEmailMessage(email);
    
    // Create reply context
    const replyContext: EmailReplyContext = {
      originalMessage: emailMessage,
      replyType: ReplyType.REPLY,
      tone: EmailTone.PROFESSIONAL,
      includeOriginal: false,
      customInstructions: 'Keep the response helpful, professional, and concise. If you cannot fully address their request, suggest they contact support for further assistance.'
    };
    
    // Generate reply using existing agent
    const result = await generateEmailReply(emailAgent, replyContext);
    
    if (result.success && result.data) {
      return result.data.body;
    } else {
      throw new Error(result.error || 'Failed to generate reply');
    }
    
  } catch (error) {
    console.error('Error generating AI reply:', error);
    throw error;
  }
}

// Main handler function
export async function handleEmail(email: FetchedEmail): Promise<EmailHandlerResult> {
  try {
    console.log(`Analyzing email from ${email.from}: "${email.subject}"`);
    
    // Check if email should be flagged for human review
    if (shouldFlagForReview(email)) {
      console.log('Email flagged for human review due to complexity or sensitive content');
      return {
        reply: '',
        flagForReview: true
      };
    }
    
    // Generate AI reply for simple emails
    console.log('Generating AI reply for email...');
    const reply = await generateAIReply(email);
    
    return {
      reply,
      flagForReview: false
    };
    
  } catch (error) {
    console.error('Error handling email:', error);
    
    // On error, flag for human review as fallback
    return {
      reply: '',
      flagForReview: true
    };
  }
}