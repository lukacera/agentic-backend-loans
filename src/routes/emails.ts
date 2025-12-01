import express from 'express';
import { 
  createEmailAgent,
  initializeEmailAgent,
  composeEmail,
  generateEmailReply,
  analyzeEmail,
  createEmailFromTemplate,
  getAllTemplates,
  getAllDrafts,
  getDraft,
  updateDraft,
  removeDraft,
  improveEmail,
  generateSubjectSuggestions,
  getEmailAgentCapabilities
} from '../agents/EmailAgent.js';
import { getAgentStatus } from '../agents/BaseAgent.js';
import { 
  EmailComposition,
  EmailReplyContext,
  EmailTone,
  EmailPurpose,
  ReplyType,
} from '../types';
import { saveEmailMessage, loadEmailMessage, createEmailMetadata } from '../services/emailProcessor.js';
import { sendEmailDraft, testEmailConnection } from '../services/emailSender.js';

const router = express.Router();

// Initialize email agent
const emailAgent = createEmailAgent();

// Initialize storage on startup
initializeEmailAgent().catch(console.error);

// Email composition endpoint
router.post('/compose', async (req, res) => {
  try {
    const composition: EmailComposition = req.body;
    
    // Validate required fields
    if (!composition.recipients || composition.recipients.length === 0) {
      return res.status(400).json({ error: 'Recipients are required' });
    }
    
    if (!composition.subject) {
      return res.status(400).json({ error: 'Subject is required' });
    }
    
    if (!composition.keyPoints || composition.keyPoints.length === 0) {
      return res.status(400).json({ error: 'Key points are required' });
    }

    // Set defaults if not provided
    composition.tone = composition.tone || EmailTone.PROFESSIONAL;
    composition.purpose = composition.purpose || EmailPurpose.INQUIRY;

    const result = await composeEmail(emailAgent, composition);
    
    if (result.success && result.data) {
      // Send the composed email to lukaceranic38@gmail.com
      const emailSendResult = await sendEmailDraft(result.data, 'lukaceranic38@gmail.com');
      
      if (emailSendResult.success) {
        res.json({
          ...result,
          emailSent: true,
          messageId: emailSendResult.messageId,
          sentTo: 'lukaceranic38@gmail.com'
        });
      } else {
        // Still return the composed email even if sending failed
        res.json({
          ...result,
          emailSent: false,
          sendError: emailSendResult.error,
          message: 'Email composed successfully but failed to send'
        });
      }
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Email composition error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate email reply
router.post('/reply', async (req, res) => {
  try {
    const { originalMessageId, replyType, tone, includeOriginal, customInstructions } = req.body;
    
    if (!originalMessageId) {
      return res.status(400).json({ error: 'Original message ID is required' });
    }

    // Load the original message
    const originalMessage = await loadEmailMessage(originalMessageId);
    if (!originalMessage) {
      return res.status(404).json({ error: 'Original message not found' });
    }

    const replyContext: EmailReplyContext = {
      originalMessage,
      replyType: replyType || ReplyType.REPLY,
      tone: tone || EmailTone.PROFESSIONAL,
      includeOriginal: includeOriginal !== false, // Default true
      customInstructions
    };

    const result = await generateEmailReply(emailAgent, replyContext);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Email reply generation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Analyze email content
router.post('/analyze', async (req, res) => {
  try {
    const { emailId } = req.body;
    
    if (!emailId) {
      return res.status(400).json({ error: 'Email ID is required' });
    }

    const email = await loadEmailMessage(emailId);
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const result = await analyzeEmail(emailAgent, email);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Email analysis error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create email from template
router.post('/templates/:templateId/create', async (req, res) => {
  try {
    const { templateId } = req.params;
    const { variables, recipients } = req.body;
    
    if (!recipients || recipients.length === 0) {
      return res.status(400).json({ error: 'Recipients are required' });
    }

    if (!variables || typeof variables !== 'object') {
      return res.status(400).json({ error: 'Variables object is required' });
    }

    const result = await createEmailFromTemplate(emailAgent, templateId, variables, recipients);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Template email creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all templates
router.get('/templates', async (req, res) => {
  try {
    const result = await getAllTemplates();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Templates listing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all drafts
router.get('/drafts', async (req, res) => {
  try {
    const result = await getAllDrafts();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Drafts listing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific draft
router.get('/drafts/:draftId', async (req, res) => {
  try {
    const { draftId } = req.params;
    
    const result = await getDraft(draftId);
    
    if (result.success) {
      res.json(result);
    } else if (result.error === 'Draft not found') {
      res.status(404).json({ error: result.error });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Draft retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update draft
router.put('/drafts/:draftId', async (req, res) => {
  try {
    const { draftId } = req.params;
    const updates = req.body;
    
    const result = await updateDraft(draftId, updates);
    
    if (result.success) {
      res.json(result);
    } else if (result.error === 'Draft not found') {
      res.status(404).json({ error: result.error });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Draft update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete draft
router.delete('/drafts/:draftId', async (req, res) => {
  try {
    const { draftId } = req.params;
    
    const result = await removeDraft(draftId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Draft deletion error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Improve email draft
router.post('/drafts/:draftId/improve', async (req, res) => {
  try {
    const { draftId } = req.params;
    const { improvementType = 'clarity' } = req.body;
    
    const validImprovementTypes = ['tone', 'clarity', 'length', 'professionalism', 'engagement'];
    if (!validImprovementTypes.includes(improvementType)) {
      return res.status(400).json({ 
        error: `Invalid improvement type. Must be one of: ${validImprovementTypes.join(', ')}` 
      });
    }

    const result = await improveEmail(emailAgent, draftId, improvementType);
    
    if (result.success) {
      res.json(result);
    } else if (result.error === 'Draft not found') {
      res.status(404).json({ error: result.error });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Email improvement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate subject suggestions
router.post('/subject-suggestions', async (req, res) => {
  try {
    const { emailBody, context } = req.body;
    
    if (!emailBody) {
      return res.status(400).json({ error: 'Email body is required' });
    }

    const result = await generateSubjectSuggestions(emailAgent, emailBody, context);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Subject suggestions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create and save email message (for testing/demo purposes)
router.post('/messages', async (req, res) => {
  try {
    const { subject, from, to, body } = req.body;
    
    if (!subject || !from || !to || !body) {
      return res.status(400).json({ error: 'Subject, from, to, and body are required' });
    }

    const recipients = Array.isArray(to) ? to : [to];
    const email = createEmailMetadata(subject, from, recipients, body);
    
    await saveEmailMessage(email);
    
    res.json({ success: true, data: email });
  } catch (error) {
    console.error('Message creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get agent status
router.get('/agent/status', async (req, res) => {
  try {
    const status = getAgentStatus(emailAgent);
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Agent status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get agent capabilities
router.get('/agent/capabilities', (req, res) => {
  try {
    const capabilities = getEmailAgentCapabilities();
    res.json({ success: true, data: capabilities });
  } catch (error) {
    console.error('Agent capabilities error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test email connection
router.get('/test-connection', async (req, res) => {
  try {
    const testResult = await testEmailConnection();
    
    if (testResult.success) {
      res.json({ 
        success: true, 
        message: 'Email service is properly configured and working',
        data: { connectionStatus: 'verified' }
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Email connection test failed',
        details: testResult.error
      });
    }
  } catch (error) {
    console.error('Email connection test error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;