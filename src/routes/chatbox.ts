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
  formStateService,
  getFlowContext,
  updateDraftPDFsInBackground
} from '../services/chatboxService.js';
import { ChatMessage, ConversationFlow } from '../types/index.js';
import websocketService from '../services/websocket.js';
import { requireChatSessionOwnership } from '../middleware/ownership.js';

const router = express.Router();

// Initialize the chatbox agent
const chatboxAgent = createChatboxAgent();
initializeChatboxAgent().catch(console.error);

// ==============================
// INACTIVITY TIMER MANAGEMENT
// ==============================

// Map to track inactivity timers per session
const sessionInactivityTimers = new Map<string, NodeJS.Timeout>();

/**
 * Reset the inactivity timer for a session
 * After 30 seconds of inactivity, PDFs will be updated in S3
 */
const resetInactivityTimer = (sessionId: string, applicationId?: string) => {
  // Clear existing timer
  const existingTimer = sessionInactivityTimers.get(sessionId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Set new 30-second timer only if we have an applicationId
  if (applicationId) {
    const timer = setTimeout(async () => {
      console.log(`⏱️ Inactivity timeout for session ${sessionId}, updating PDFs...`);
      await updateDraftPDFsInBackground(sessionId, applicationId);
      sessionInactivityTimers.delete(sessionId);
    }, 30000); // 30 seconds

    sessionInactivityTimers.set(sessionId, timer);
  }
};

/**
 * Clear the inactivity timer for a session
 * Called when session ends or is deleted
 */
const clearInactivityTimer = (sessionId: string) => {
  const timer = sessionInactivityTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    sessionInactivityTimers.delete(sessionId);
  }
};

/**
 * Get WebSocket rooms for a session
 */
const getRooms = (sessionId: string): string[] => ['global', sessionId];

/**
 * Generate fallback response if LLM fails to produce text after max iterations
 */

/**
 * POST /api/chat/sessions - Create a new chat session
 */
router.post('/sessions', async (req, res) => {
  try {
    const userId = req.user?._id?.toString();
    const session = await createSession(userId);

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
router.get('/sessions/:sessionId', requireChatSessionOwnership, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Include form field data if session has an application linked
    let formFieldData = null;
    if (session.applicationId) {
      const appId = session.applicationId.toString();
      // Ensure form state session is started
      if (!formStateService.hasSession(appId)) {
        await formStateService.startSession(appId);
      }
      // Get complete field data
      formFieldData = formStateService.getCompleteFieldData(appId);
    }

    res.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        messages: session.messages,
        userData: session.userData,
        applicationId: session.applicationId,
        formFieldData,  // NEW: Include complete field data
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
router.delete('/sessions/:sessionId', requireChatSessionOwnership, async (req, res) => {
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

    // Clear inactivity timer to prevent orphan PDF updates
    clearInactivityTimer(sessionId);

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
router.post('/sessions/:sessionId/messages', requireChatSessionOwnership, async (req, res) => {
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

    // Get flow context to remind LLM which flow it's in
    const flowContext = getFlowContext(session.userData);

    // Combine contexts (flow context first, then form state)
    let combinedContext: string | undefined;
    if (flowContext || formStateContext) {
      combinedContext = [flowContext, formStateContext].filter(Boolean).join('\n\n');
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
      combinedContext  // Inject flow + form state context
    );

    if (!firstResult.success || !firstResult.data) {
      return res.status(500).json({
        success: false,
        error: firstResult.error || 'Failed to process message'
      });
    }

    const { toolCalls } = firstResult.data;
    let finalContent = firstResult.data.content || '';

    // Fallback detection: If no tool calls but user message looks like data response
    // This catches cases where the LLM failed to call the appropriate tool
    if ((!toolCalls || toolCalls.length === 0) && finalContent && !message.trim().endsWith('?')) {
      // User message doesn't end with '?' (likely not a question)
      // and LLM provided text instead of tool calls
      // Log warning for monitoring
      console.log(`⚠️ FALLBACK DETECTION: LLM returned text without tool calls. User message: "${message.trim().substring(0, 50)}..."`);
      console.log(`⚠️ LLM response: "${finalContent.substring(0, 100)}..."`);
      console.log(`⚠️ This may indicate a missed data capture opportunity. Review conversation context.`);

      // Note: We're not auto-calling tools here because we don't have enough context
      // to determine which field/tool to use. Instead, we log for monitoring.
      // The user's next message should clarify or they can rephrase.
    }

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
      let updatedFormStateContext: string | undefined;
      if (activeAppId && formStateService.hasSession(activeAppId)) {
        updatedFormStateContext = formStateService.getStateContext(activeAppId);
      }

      // Get updated flow context (in case detectConversationFlow was just called)
      const updatedSession = await getSession(sessionId);
      const updatedFlowContext = getFlowContext(updatedSession?.userData);

      // Combine updated contexts
      let updatedCombinedContext: string | undefined;
      if (updatedFlowContext || updatedFormStateContext) {
        updatedCombinedContext = [updatedFlowContext, updatedFormStateContext].filter(Boolean).join('\n\n');
      }

      const secondResult = await processChat(
        chatboxAgent,
        session.messages,
        message.trim(),
        toolResultsForLLM,
        toolCalls,
        updatedCombinedContext  // Inject updated combined context
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

    // Extract documents from getFilledFields result (for continue_application flow)
    const filledFieldsResult = toolResults.find(r => r.name === 'getFilledFields');
    const documents = filledFieldsResult?.data?.documents;

    // Determine active application ID (for form progress and periodic save)
    const activeAppId = newApplicationId || applicationId;

    // Extract formProgress directly from FormStateService for real-time accuracy
    // This ensures frontend always gets the LATEST progress after all tool executions
    let formProgress;
    if (activeAppId && formStateService.hasSession(activeAppId)) {
      formProgress = formStateService.calculateProgress(activeAppId);
    }

    // Periodic save: save form state after each message (if dirty)
    if (activeAppId && formStateService.hasSession(activeAppId)) {
      await formStateService.saveSession(activeAppId);
    }

    // Get complete PDF field data for JSON response
    let formFieldData = null;
    if (activeAppId && formStateService.hasSession(activeAppId)) {
      formFieldData = formStateService.getCompleteFieldData(activeAppId);

      // Also broadcast via WebSocket for real-time updates
      if (formFieldData) {
        const rooms = getRooms(sessionId);
        websocketService.broadcast('pdf-fields-update', {
          sessionId,
          timestamp: new Date().toISOString(),
          applicationId: activeAppId,
          forms: formFieldData,
          source: 'chat'
        }, rooms);
        console.log(`📄 Broadcasted complete PDF field data for session ${sessionId}`);
      }
    }

    // Reset inactivity timer - will update PDFs after 30 seconds of no activity
    resetInactivityTimer(sessionId, activeAppId);

    res.json({
      success: true,
      data: {
        message: finalContent,
        toolResults: toolResults.length > 0 ? toolResults : undefined,
        userData: updatedSession?.userData,
        flow: detectedFlow,
        formProgress,      // Top-level for frontend convenience
        formFieldData,     // Complete PDF field data for frontend rendering
        documents,         // Top-level for frontend convenience
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
router.get('/sessions/:sessionId/messages', requireChatSessionOwnership, async (req, res) => {
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
router.get('/sessions/:sessionId/userData', requireChatSessionOwnership, async (req, res) => {
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
