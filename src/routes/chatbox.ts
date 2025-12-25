import express from 'express';
import {
  createChatboxAgent,
  initializeChatboxAgent,
  processChat,
  ToolResultForLLM
} from '../agents/ChatboxAgent.js';
import {
  createSession,
  getSession,
  addMessage,
  deleteSession,
  executeToolCall,
  formStateService
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

    // Get session to find applicationId before deleting
    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // End form state session if active (saves and removes from memory)
    const applicationId = session.applicationId?.toString();
    if (applicationId && formStateService.hasSession(applicationId)) {
      console.log(`🔚 Ending form state session for application: ${applicationId}`);
      await formStateService.endSession(applicationId);
    }

    const deleted = await deleteSession(sessionId);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Failed to delete session'
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
    const { message, applicationId: requestApplicationId } = req.body;

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

    // Get applicationId from request body or session
    const applicationId = requestApplicationId || session.applicationId?.toString();

    // If we have an applicationId, ensure form state session is started
    if (applicationId && !formStateService.hasSession(applicationId)) {
      console.log(`📋 Starting form state session for application: ${applicationId}`);
      await formStateService.startSession(applicationId);
    }

    // Get form state context for LLM injection (if we have an active form session)
    let formStateContext: string | undefined;
    if (applicationId && formStateService.hasSession(applicationId)) {
      formStateContext = formStateService.getStateContext(applicationId);
    }
    
    // Add user message to history
    const userMessage: ChatMessage = {
      role: 'user',
      content: message.trim(),
      timestamp: new Date()
    };
    const updatedConvoWithNewMessage = await addMessage(sessionId, userMessage);
    
    const firstResult = await processChat(
      chatboxAgent,
      updatedConvoWithNewMessage?.messages || [],
      message.trim(),
      undefined,
      undefined,
      formStateContext  // Inject form state context
    );

    if (!firstResult.success || !firstResult.data) {
      return res.status(500).json({
        success: false,
        error: firstResult.error || 'Failed to process message'
      });
    }

    const { toolCalls } = firstResult.data;
    let finalContent = firstResult.data.content || '';

    // Execute tool calls and collect results
    const toolResults: { name: string; success: boolean; message: string; instruction?: string; data?: any }[] = [];
    const toolResultsForLLM: ToolResultForLLM[] = [];

    // Track if an application was selected (for starting form state session)
    let newApplicationId: string | undefined;

    if (toolCalls && toolCalls.length > 0) {
      console.log(`🔧 Executing ${toolCalls.length} tool calls`);

      for (const toolCall of toolCalls) {
        const toolResult = await executeToolCall(
          sessionId,
          toolCall.name,
          toolCall.args || {},
          applicationId  // Pass applicationId for form state operations
        );

        // Store for API response
        toolResults.push({
          name: toolCall.name,
          ...toolResult
        });

        // Store for second LLM pass
        toolResultsForLLM.push({
          toolCallId: toolCall.id || `call_${toolCall.name}_${Date.now()}`,
          name: toolCall.name,
          result: JSON.stringify(toolResult)
        });

        // Check if this was an eligibility calculation that created a draft application
        if ((toolCall.name === 'chancesUserSBAApprovedBUYER' || toolCall.name === 'chancesUserSBAApprovedOWNER') &&
            toolResult.success && toolResult.data?.draftApplicationId) {
          const draftAppId = toolResult.data.draftApplicationId as string;
          newApplicationId = draftAppId;
          // Start form state session for the new application
          console.log(`📋 Starting form state session for new application: ${draftAppId}`);
          await formStateService.startSession(draftAppId);
          // Persist applicationId to MongoDB so it survives between requests
          session.applicationId = draftAppId;
          await session.save();
          console.log(`💾 Saved applicationId to chat session: ${draftAppId}`);
        }

        // Check if getFilledFields was called (for continue flow)
        if (toolCall.name === 'getFilledFields' && toolResult.success) {
          // The applicationId is in the args
          const filledFieldsAppId = toolCall.args?.applicationId as string | undefined;
          if (filledFieldsAppId) {
            if (!formStateService.hasSession(filledFieldsAppId)) {
              console.log(`📋 Starting form state session for selected application: ${filledFieldsAppId}`);
              await formStateService.startSession(filledFieldsAppId);
            }
            newApplicationId = filledFieldsAppId;
            // Persist applicationId to MongoDB so it survives between requests
            session.applicationId = filledFieldsAppId;
            await session.save();
            console.log(`💾 Saved applicationId to chat session: ${filledFieldsAppId}`);
          }
        }
      }

      // Get updated form state context after tool execution
      const activeAppId = newApplicationId || applicationId;
      if (activeAppId && formStateService.hasSession(activeAppId)) {
        formStateContext = formStateService.getStateContext(activeAppId);
      }

      const secondResult = await processChat(
        chatboxAgent,
        session.messages,
        message.trim(),
        toolResultsForLLM,
        toolCalls,
        formStateContext  // Inject updated form state context
      );

      if (secondResult.success && secondResult.data?.content) {
        finalContent = secondResult.data.content;
      } else {
        console.warn('⚠️ Second pass failed or returned empty content, using fallback');
      }
    }

    // Fallback if still no content
    if (!finalContent || finalContent.trim() === '') {
      throw new Error('LLM failed to generate a response after tool execution.');
    }

    // Create assistant message with tool calls
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: finalContent,
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
        detectedFlow = result.data.flow;
        break;
      }
    }

    // Extract applications list from tool results if present
    const applicationsResult = toolResults.find(r => r.name === 'retrieveAllApplications');
    const applications = applicationsResult?.data?.applications;

    // Periodic save: save form state after each message (if dirty)
    const activeAppId = newApplicationId || applicationId;
    if (activeAppId && formStateService.hasSession(activeAppId)) {
      await formStateService.saveSession(activeAppId);
    }

    res.json({
      success: true,
      data: {
        message: finalContent,
        toolResults: toolResults.length > 0 ? toolResults : undefined,
        userData: updatedSession?.userData,
        flow: detectedFlow,
        applications: applications || undefined,
        applicationId: newApplicationId || applicationId  // Return current applicationId
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
