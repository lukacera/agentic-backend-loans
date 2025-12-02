import { AgentState, createAgent, createResponse, processWithLLM } from './BaseAgent.js';
import { 
  initializeEmailStorage,
  saveEmailDraft,
} from '../services/emailProcessor.js';
import {
  EmailMessage,
  EmailDraft,
  EmailComposition,
  EmailReplyContext,
  EmailAnalysisResult,
  BaseAgentResponse,
  ReplyType,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

// Create email agent
export const createEmailAgent = (): AgentState => {
  return createAgent('EmailAgent', {
    maxConcurrentTasks: 5,
    timeout: 90000 // 90 seconds for email generation
  });
};

// Initialize email agent
export const initializeEmailAgent = async (): Promise<void> => {
  await initializeEmailStorage();
  console.log('Email agent initialized successfully');
};

// Compose new email with AI assistance
export const composeEmail = async (
  agent: AgentState,
  composition: EmailComposition
): Promise<BaseAgentResponse<EmailDraft>> => {
  const startTime = Date.now();

  try {
    // Generate email content with AI
    const systemPrompt = `You are an expert email writer. Generate professional emails based on the given requirements.
    
    Guidelines:
    - Use appropriate tone: ${composition.tone}
    - Purpose: ${composition.purpose}
    - Maximum 3-4 sentences for simple replies
    - One sentence per paragraph when possible
    - Skip formalities unless the sender used them first

    // Greeting rules:
    - If they used my first name: use theirs (no "Hi" needed)
    - If formal: match their formality level
    - If continuing a thread: skip greeting entirely, jump straight to content

    // Closing rules:
    - Simple replies: no closing needed
    - Requests/asks: "Thanks"
    - First contact: "Best"
    - Never use: "Best regards," "Sincerely," "Kind regards"
    
    - Structure the email logically
    - DO NOT use em dashes and DO NOT start with I hope this email finds you well.
    - Use short phrases
    - Do not make the email unnecessarily long
    - I have a different writing style than most people, so be sure to adapt to that:
    * Use short sentences, instead of: "Thank you for your email! Here is the info you wanted..." use "Here's the info you wanted."
    * What you should know about the recepients:
    * 1) They are busy professionals who appreciate brevity and clarity.
    * 2) They value directness and actionable information.
    * 3) Their communication style is short and to the point, without unnecessary words.
    * $) Avoid overly formal language; keep it professional yet approachable.
    ${composition.context ? `- Context: ${composition.context}` : ''}`;
  
    const userPrompt = `Write an email with the following requirements:
    - Recipients: ${composition.recipients.join(', ')}
    - Subject: ${composition.subject}
    - Key points to cover: ${composition.keyPoints.join(', ')}
    - Tone: ${composition.tone}
    - Purpose: ${composition.purpose}
    
    Generate only the email body content. Do not include subject line or recipient information in the body.`;

    const emailBody = await processWithLLM(agent, systemPrompt, userPrompt);

    // Create email draft
    const draft: EmailDraft = {
      id: uuidv4(),
      subject: composition.subject,
      body: emailBody,
      to: composition.recipients,
      createdAt: new Date(),
      updatedAt: new Date(),
      templateId: composition.templateId,
      variables: composition.variables
    };

    // Save draft
    await saveEmailDraft(draft);

    return createResponse(
      true,
      draft,
      undefined,
      Date.now() - startTime
    );

  } catch (error) {
    console.error('Email composition error:', error);
    return createResponse<EmailDraft>(
      false,
      undefined,
      error instanceof Error ? error.message : 'Failed to compose email',
      Date.now() - startTime
    );
  }
};

// Generate email reply with AI assistance
export const generateEmailReply = async (
  agent: AgentState,
  replyContext: EmailReplyContext
): Promise<BaseAgentResponse<EmailDraft>> => {
  const startTime = Date.now();

  try {
    const originalEmail = replyContext.originalMessage;
    
    const systemPrompt = `You are an expert at writing email replies. Generate appropriate responses based on the original email and context.
    
    Guidelines:
    - Tone: ${replyContext.tone}
    - Reply type: ${replyContext.replyType}
    - ${replyContext.includeOriginal ? 'Include reference to original message' : 'Do not quote original message'}
    - Maximum 3-4 sentences for simple replies
    - One sentence per paragraph when possible
    - Skip formalities unless the sender used them first
    
    // Greeting rules:
    - If they used my first name: use theirs (no "Hi" needed)
    - If formal: match their formality level
    - If continuing a thread: skip greeting entirely, jump straight to content

    // Closing rules:
    - Simple replies: no closing needed
    - Requests/asks: "Thanks"
    - First contact: "Best"
    - Never use: "Best regards," "Sincerely," "Kind regards"

    - Structure the email logically
    - DO NOT use em dashes and DO NOT start with I hope this email finds you well.
    - Use short phrases
    - Do not make the email unnecessarily long
    - I have a different writing style than most people, so be sure to adapt to that:
    * Use short sentences, instead of: "Thank you for your email! Here is the info you wanted..." use "Here's the info you wanted."
    * What you should know about the recepients:
    * 1) They are busy professionals who appreciate brevity and clarity.
    * 2) They value directness and actionable information.
    * 3) Their communication style is short and to the point, without unnecessary words.
    * $) Avoid overly formal language; keep it professional yet approachable.

    ${replyContext.customInstructions ? `- Additional instructions: ${replyContext.customInstructions}` : ''}`;

    const userPrompt = `Generate a reply to this email:
    
    Original Email:
    Subject: ${originalEmail.subject}
    From: ${originalEmail.from}
    Body: ${originalEmail.body}
    
    Generate only the reply body content. Do not include subject line or recipient information.`;

    const replyBody = await processWithLLM(agent, systemPrompt, userPrompt);

    // Generate reply subject
    let replySubject = originalEmail.subject;
    if (replyContext.replyType === ReplyType.REPLY || replyContext.replyType === ReplyType.REPLY_ALL) {
      if (!replySubject.toLowerCase().startsWith('re:')) {
        replySubject = `Re: ${replySubject}`;
      }
    } else if (replyContext.replyType === ReplyType.FORWARD) {
      if (!replySubject.toLowerCase().startsWith('fwd:')) {
        replySubject = `Fwd: ${replySubject}`;
      }
    }

    // Determine recipients based on reply type
    let recipients: string[] = [];
    if (replyContext.replyType === ReplyType.REPLY) {
      recipients = [originalEmail.from];
    } else if (replyContext.replyType === ReplyType.REPLY_ALL) {
      recipients = [originalEmail.from, ...originalEmail.to.filter(email => email !== originalEmail.from)];
      if (originalEmail.cc) {
        recipients = [...recipients, ...originalEmail.cc];
      }
    }

    const draft: EmailDraft = {
      id: uuidv4(),
      subject: replySubject,
      body: replyBody,
      to: recipients,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await saveEmailDraft(draft);

    return createResponse(
      true,
      draft,
      undefined,
      Date.now() - startTime
    );

  } catch (error) {
    console.error('Email reply generation error:', error);
    return createResponse<EmailDraft>(
      false,
      undefined,
      error instanceof Error ? error.message : 'Failed to generate reply',
      Date.now() - startTime
    );
  }
};

// Analyze email content with AI
export const analyzeEmail = async (
  agent: AgentState,
  email: EmailMessage
): Promise<BaseAgentResponse<EmailAnalysisResult>> => {
  const startTime = Date.now();

  try {
    const systemPrompt = `You are an expert email analyzer. Analyze the given email and provide structured insights.
    
    Analyze for:
    - Sentiment (positive, negative, neutral)
    - Urgency level (low, medium, high)
    - Intent and purpose
    - Key topics mentioned
    - Whether it requires a response
    - Suggested actions
    - Estimated response time needed
    
    Provide analysis in a structured format.`;

    const userPrompt = `Analyze this email:
    
    Subject: ${email.subject}
    From: ${email.from}
    To: ${email.to.join(', ')}
    Body: ${email.body}
    
    Provide the analysis as JSON with keys: sentiment, urgency, intent, keyTopics, suggestedActions, requiresResponse, estimatedResponseTime`;

    const analysisText = await processWithLLM(agent, systemPrompt, userPrompt);
    
    // Parse AI response (simplified - in production, you'd want better error handling)
    let analysis: EmailAnalysisResult;
    try {
      const parsed = JSON.parse(analysisText);
      analysis = {
        sentiment: parsed.sentiment || 'neutral',
        urgency: parsed.urgency || 'medium',
        intent: parsed.intent || 'General communication',
        keyTopics: parsed.keyTopics || [],
        suggestedActions: parsed.suggestedActions || [],
        requiresResponse: parsed.requiresResponse || false,
        estimatedResponseTime: parsed.estimatedResponseTime || '24 hours'
      };
    } catch {
      // Fallback if JSON parsing fails
      analysis = {
        sentiment: 'neutral',
        urgency: 'medium',
        intent: 'General communication',
        keyTopics: [],
        suggestedActions: ['Review email content'],
        requiresResponse: true,
        estimatedResponseTime: '24 hours'
      };
    }

    return createResponse(
      true,
      analysis,
      undefined,
      Date.now() - startTime
    );

  } catch (error) {
    console.error('Email analysis error:', error);
    return createResponse<EmailAnalysisResult>(
      false,
      undefined,
      error instanceof Error ? error.message : 'Failed to analyze email',
      Date.now() - startTime
    );
  }
};

// Get agent capabilities
export const getEmailAgentCapabilities = (): string[] => [
  'AI-powered email composition',
  'Intelligent email replies (reply, reply-all, forward)',
  'Email content analysis and insights',
  'Email template management and application',
  'Draft creation and management',
  'Email tone and style improvement',
  'Subject line generation',
  'Multi-language support',
  'Context-aware responses',
  'Professional formatting',
  'Sentiment analysis',
  'Urgency detection',
  'Custom email templates',
  'Variable substitution in templates'
];