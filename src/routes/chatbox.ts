import express from 'express';
import {
  createChatboxAgent,
  initializeChatboxAgent,
  processChat
} from '../agents/ChatboxAgent.js';
import {
  createSession,
  getSession,
  addMessage,
  deleteSession,
  executeToolCall
} from '../services/chatboxService.js';
import { ChatMessage, ConversationFlow } from '../types/index.js';

const router = express.Router();

// Initialize the chatbox agent
const chatboxAgent = createChatboxAgent();
initializeChatboxAgent().catch(console.error);

/**
 * Generate fallback response if LLM fails to produce text after max iterations
 */

/**
 * POST /api/chat/sessions - Create a new chat session
 */
router.post('/sessions', async (req, res) => {
  try {
    const session = await createSession();

    res.status(201).json({
      success: true,
      data: {
        sessionId: session.sessionId,
        createdAt: session.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Error creating chat session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create session'
    });
  }
});

/**
 * GET /api/chat/sessions/:sessionId - Get a chat session with history
 */
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        messages: session.messages,
        userData: session.userData,
        applicationId: session.applicationId,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }
    });
  } catch (error) {
    console.error('❌ Error fetching chat session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch session'
    });
  }
});

/**
 * DELETE /api/chat/sessions/:sessionId - Delete a chat session
 */
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const deleted = await deleteSession(sessionId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      message: 'Session deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting chat session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete session'
    });
  }
});

// ==============================
// MESSAGE HANDLING ROUTES
// ==============================

/**
 * POST /api/chat/sessions/:sessionId/messages - Send a message and get AI response
 */
router.post('/sessions/:sessionId/messages', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;

    // Validate message
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a non-empty string'
      });
    }

    // Get session
    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Add user message to history
    const userMessage: ChatMessage = {
      role: 'user',
      content: message.trim(),
      timestamp: new Date()
    };
    await addMessage(sessionId, userMessage);

    // Process with ChatboxAgent
    const result = await processChat(
      chatboxAgent,
      session.messages,
      message.trim()
    );

    if (!result.success || !result.data) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to process message'
      });
    }

    const { content, toolCalls } = result.data;

    // Execute tool calls and collect results
    const toolResults: { name: string; success: boolean; message: string; data?: any }[] = [];

    if (toolCalls && toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        const toolResult = await executeToolCall(
          sessionId,
          toolCall.name,
          toolCall.args || {}
        );
        toolResults.push({
          name: toolCall.name,
          ...toolResult
        });
      }
    }

    // Create assistant message with tool calls
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: content || '',
      toolCalls: toolCalls?.map((tc: any) => ({
        name: tc.name,
        arguments: tc.args || {},
        result: toolResults.find(r => r.name === tc.name)
      })),
      timestamp: new Date()
    };

    // Add assistant message to history
    await addMessage(sessionId, assistantMessage);

    // Get updated session for userData
    const updatedSession = await getSession(sessionId);

    // Extract flow from tool results if present
    let detectedFlow: ConversationFlow = null;
    for (const result of toolResults) {
      if (result.name === 'detectConversationFlow' && result.success && result.data?.flow) {
        console.log('Detected conversation flow:', result.data.flow);
        detectedFlow = result.data.flow;
        break;
      }
    }

    // Extract applications list from tool results if present
    const applicationsResult = toolResults.find(r => r.name === 'retrieveAllApplications');
    const applications = applicationsResult?.data?.applications;

    res.json({
      success: true,
      data: {
        message: content || '',
        toolResults: toolResults.length > 0 ? toolResults : undefined,
        userData: updatedSession?.userData,
        flow: detectedFlow,
        applications: applications || undefined
      }
    });
  } catch (error) {
    console.error('❌ Error processing chat message:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process message'
    });
  }
});

/**
 * GET /api/chat/sessions/:sessionId/messages - Get message history for a session
 */
router.get('/sessions/:sessionId/messages', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      data: {
        messages: session.messages,
        count: session.messages.length
      }
    });
  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch messages'
    });
  }
});

/**
 * GET /api/chat/sessions/:sessionId/userData - Get captured user data for a session
 */
router.get('/sessions/:sessionId/userData', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      data: session.userData
    });
  } catch (error) {
    console.error('❌ Error fetching user data:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch user data'
    });
  }
});

export default router;
