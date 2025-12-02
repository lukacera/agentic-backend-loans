import express from 'express';
import { 
  createEmailAgent,
  initializeEmailAgent,
  composeEmail,
  generateEmailReply,
  analyzeEmail,
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
import { sendEmail } from '../services/emailSender.js';

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
      try {
        // Send the composed email using the available sendEmail function
        await sendEmail({
          to: Array.isArray(result.data.to) ? result.data.to : [result.data.to],
          subject: result.data.subject,
          text: result.data.body,
          html: `${result.data.body}`
        });
        
        res.json({
          ...result,
          emailSent: true,
          sentTo: result.data.to
        });
      } catch (sendError) {
        // Still return the composed email even if sending failed
        res.json({
          ...result,
          emailSent: false,
          sendError: sendError instanceof Error ? sendError.message : 'Unknown send error',
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
    const { 
      originalMessageId, 
      replyType, 
      tone, 
      includeOriginal, 
      customInstructions 
    } = req.body;
    
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
    // Simple test by checking if SendGrid API key is configured
    const isConfigured = !!process.env.SENDGRID_API_KEY;
    
    if (isConfigured) {
      res.json({ 
        success: true, 
        message: 'Email service is properly configured',
        data: { connectionStatus: 'configured' }
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'SendGrid API key not configured'
      });
    }
  } catch (error) {
    console.error('Email connection test error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;