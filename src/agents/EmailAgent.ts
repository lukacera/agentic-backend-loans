import { AgentState, createAgent, createResponse, processWithLLM } from './BaseAgent.js';
import { 
  initializeEmailStorage,
  createEmailMetadata,
  saveEmailMessage,
  loadEmailMessage,
  saveEmailDraft,
  loadEmailDraft,
  listEmailDrafts,
  deleteEmailDraft,
  saveEmailTemplate,
  loadEmailTemplate,
  listEmailTemplates,
  applyTemplateVariables,
  validateTemplateVariables,
  createEmailThread,
  saveEmailThread,
  loadEmailThread
} from '../services/emailProcessor.js';
import {
  EmailMessage,
  EmailDraft,
  EmailTemplate,
  EmailThread,
  EmailComposition,
  EmailReplyContext,
  EmailAnalysisResult,
  EmailGenerationResult,
  EmailStatus,
  EmailPriority,
  EmailTone,
  EmailPurpose,
  BaseAgentResponse,
  ReplyType,
  TemplateCategory
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
    - Keep it concise and professional
    - Include proper greeting and closing
    - Structure the email logically
    - DO NOT use em dashes and DO NOT start with I hope this email finds you well.
    - Be authentic
    - Do not use cliches
    - Use short phrases
    - Do not make the email unnecessarily long
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
    - Be concise and professional
    - Address all points raised in the original email
    - Structure the email logically
    - DO NOT use em dashes and DO NOT start with I hope this email finds you well.
    - Be authentic
    - Do not use cliches
    - Do not use the word "insights"
    - Use short phrases
    - Do not make the email unnecessarily long
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

// Get all email drafts
export const getAllDrafts = async (): Promise<BaseAgentResponse<EmailDraft[]>> => {
  try {
    const drafts = await listEmailDrafts();
    return createResponse(true, drafts);
    
  } catch (error) {
    console.error('Error listing drafts:', error);
    return createResponse<EmailDraft[]>(
      false,
      undefined,
      error instanceof Error ? error.message : 'Failed to list drafts'
    );
  }
};

// Delete email draft
export const removeDraft = async (
  draftId: string
): Promise<BaseAgentResponse<boolean>> => {
  try {
    const success = await deleteEmailDraft(draftId);
    
    if (!success) {
      return createResponse(
        false,
        false,
        'Failed to delete draft'
      );
    }

    return createResponse(true, true);
    
  } catch (error) {
    console.error('Error deleting draft:', error);
    return createResponse(
      false,
      false,
      error instanceof Error ? error.message : 'Failed to delete draft'
    );
  }
};

// Create email from template
export const createEmailFromTemplate = async (
  agent: AgentState,
  templateId: string,
  variables: Record<string, any>,
  recipients: string[]
): Promise<BaseAgentResponse<EmailDraft>> => {
  const startTime = Date.now();

  try {
    // Load template
    const template = await loadEmailTemplate(templateId);
    
    if (!template) {
      return createResponse<EmailDraft>(
        false,
        undefined,
        'Template not found',
        Date.now() - startTime
      );
    }

    // Validate required variables
    const validation = validateTemplateVariables(template, variables);
    if (!validation.valid) {
      return createResponse<EmailDraft>(
        false,
        undefined,
        `Missing required variables: ${validation.missingRequired.join(', ')}`,
        Date.now() - startTime
      );
    }

    // Apply template variables
    const subject = applyTemplateVariables(template.subject, variables);
    const body = applyTemplateVariables(template.body, variables);

    // Create draft
    const draft: EmailDraft = {
      id: uuidv4(),
      subject,
      body,
      to: recipients,
      createdAt: new Date(),
      updatedAt: new Date(),
      templateId,
      variables
    };

    await saveEmailDraft(draft);

    return createResponse(
      true,
      draft,
      undefined,
      Date.now() - startTime
    );

  } catch (error) {
    console.error('Template email creation error:', error);
    return createResponse<EmailDraft>(
      false,
      undefined,
      error instanceof Error ? error.message : 'Failed to create email from template',
      Date.now() - startTime
    );
  }
};

// Get all email templates
export const getAllTemplates = async (): Promise<BaseAgentResponse<EmailTemplate[]>> => {
  try {
    const templates = await listEmailTemplates();
    return createResponse(true, templates);
    
  } catch (error) {
    console.error('Error listing templates:', error);
    return createResponse<EmailTemplate[]>(
      false,
      undefined,
      error instanceof Error ? error.message : 'Failed to list templates'
    );
  }
};

// Get email draft by ID
export const getDraft = async (
  draftId: string
): Promise<BaseAgentResponse<EmailDraft>> => {
  try {
    const draft = await loadEmailDraft(draftId);
    
    if (!draft) {
      return createResponse<EmailDraft>(
        false,
        undefined,
        'Draft not found'
      );
    }

    return createResponse(true, draft);
    
  } catch (error) {
    console.error('Error retrieving draft:', error);
    return createResponse<EmailDraft>(
      false,
      undefined,
      error instanceof Error ? error.message : 'Failed to retrieve draft'
    );
  }
};

// Update email draft
export const updateDraft = async (
  draftId: string,
  updates: Partial<EmailDraft>
): Promise<BaseAgentResponse<EmailDraft>> => {
  try {
    const existingDraft = await loadEmailDraft(draftId);
    
    if (!existingDraft) {
      return createResponse<EmailDraft>(
        false,
        undefined,
        'Draft not found'
      );
    }

    // Apply updates
    const updatedDraft: EmailDraft = {
      ...existingDraft,
      ...updates,
      id: existingDraft.id, // Ensure ID doesn't change
      createdAt: existingDraft.createdAt, // Preserve creation date
      updatedAt: new Date()
    };

    await saveEmailDraft(updatedDraft);

    return createResponse(true, updatedDraft);
    
  } catch (error) {
    console.error('Error updating draft:', error);
    return createResponse<EmailDraft>(
      false,
      undefined,
      error instanceof Error ? error.message : 'Failed to update draft'
    );
  }
};

// Improve email with AI suggestions
export const improveEmail = async (
  agent: AgentState,
  draftId: string,
  improvementType: 'tone' | 'clarity' | 'length' | 'professionalism' | 'engagement' = 'clarity'
): Promise<BaseAgentResponse<EmailDraft>> => {
  const startTime = Date.now();

  try {
    const draft = await loadEmailDraft(draftId);
    
    if (!draft) {
      return createResponse<EmailDraft>(
        false,
        undefined,
        'Draft not found',
        Date.now() - startTime
      );
    }

    const systemPrompt = `You are an expert email editor. Improve the given email based on the specified criteria.
    
    Improvement focus: ${improvementType}
    
    Guidelines:
    - Maintain the original intent and key information
    - Make the email more ${improvementType === 'tone' ? 'appropriate in tone' : 
                            improvementType === 'clarity' ? 'clear and understandable' :
                            improvementType === 'length' ? 'concise' :
                            improvementType === 'professionalism' ? 'professional' :
                            'engaging'}
    - Preserve the recipient and subject appropriateness
    - Keep the same general structure`;

    const userPrompt = `Improve this email for better ${improvementType}:
    
    Subject: ${draft.subject}
    Body: ${draft.body}
    
    Return only the improved email body. Do not change the subject or add explanations.`;

    const improvedBody = await processWithLLM(agent, systemPrompt, userPrompt);

    // Create updated draft
    const updatedDraft: EmailDraft = {
      ...draft,
      body: improvedBody,
      updatedAt: new Date()
    };

    await saveEmailDraft(updatedDraft);

    return createResponse(
      true,
      updatedDraft,
      undefined,
      Date.now() - startTime
    );

  } catch (error) {
    console.error('Email improvement error:', error);
    return createResponse<EmailDraft>(
      false,
      undefined,
      error instanceof Error ? error.message : 'Failed to improve email',
      Date.now() - startTime
    );
  }
};

// Generate email subject suggestions
export const generateSubjectSuggestions = async (
  agent: AgentState,
  emailBody: string,
  context?: string
): Promise<BaseAgentResponse<string[]>> => {
  try {
    const systemPrompt = `You are an expert at writing compelling email subject lines. Generate multiple subject line options based on the email content.
    
    Guidelines:
    - Make subjects clear and specific
    - Keep them under 60 characters when possible
    - Make them engaging and relevant
    - Avoid spam-trigger words
    - Match the tone of the email content`;

    const userPrompt = `Generate 5 different subject line options for this email:
    
    Email Body: ${emailBody}
    ${context ? `Context: ${context}` : ''}
    
    Return only the subject lines, one per line, without numbers or bullets.`;

    const suggestionsText = await processWithLLM(agent, systemPrompt, userPrompt);
    const suggestions = suggestionsText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .slice(0, 5); // Ensure max 5 suggestions

    return createResponse(true, suggestions);

  } catch (error) {
    console.error('Subject generation error:', error);
    return createResponse<string[]>(
      false,
      undefined,
      error instanceof Error ? error.message : 'Failed to generate subject suggestions'
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