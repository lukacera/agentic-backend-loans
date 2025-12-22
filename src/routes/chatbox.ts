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

// Type for tool result entries used in fallback logic
interface ToolResultEntry {
  name: string;
  success: boolean;
  message: string;
  data?: any;
}

// Helper function to construct contextual fallback when LLM returns empty content
function constructContextualFallback(toolResults: ToolResultEntry[]): string {
  // Find the last capture tool that was called successfully
  const captureTools = toolResults.filter(r => r.name.startsWith('capture') && r.success);

  if (captureTools.length === 0) {
    return "I've noted that information. What else can I help you with?";
  }

  const lastTool = captureTools[captureTools.length - 1].name;

  // Map tool names to next questions in owner flow
  const ownerFlowNext: Record<string, string> = {
    'captureUserTypeNewApplication': "When was your business founded?",
    'captureYearFounded': "What's your monthly revenue?",
    'captureMonthlyRevenue': "And what are your monthly expenses?",
    'captureMonthlyExpenses': "Do you have any existing debt payments? If so, how much per month?",
    'captureExistingDebtPayment': "How much are you looking to borrow?",
    'captureRequestedLoanAmount': "Are you a U.S. citizen?",
    'captureUSCitizen': "What's your credit score?",
    'captureCreditScore': "Let me calculate your eligibility..."
  };

  // Map tool names to next questions in buyer flow
  const buyerFlowNext: Record<string, string> = {
    'captureUserTypeNewApplication': "When was the business you're looking to buy founded?",
    'captureYearFounded': "What's the purchase price of the business?",
    'capturePurchasePrice': "How much cash do you have available for a down payment?",
    'captureAvailableCash': "What's the business's monthly cash flow?",
    'captureBusinessCashFlow': "How many years of experience do you have in this industry?",
    'captureIndustryExperience': "Are you a U.S. citizen?",
    'captureUSCitizen': "What's your credit score?",
    'captureCreditScore': "Let me calculate your eligibility..."
  };

  // Common capture tools that apply to both flows
  const commonFlowNext: Record<string, string> = {
    'captureUserName': "What's the name of your business?",
    'captureBusinessName': "What's your business phone number?",
    'capturePhoneNumber': "Let me get some more details about your situation."
  };

  // Try common flow first, then owner flow, then buyer flow
  return commonFlowNext[lastTool] || ownerFlowNext[lastTool] || buyerFlowNext[lastTool] ||
    "Got it! What other information can I help you with?";
}

// ==============================
// SESSION MANAGEMENT ROUTES
// ==============================

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

    let finalContent = content;

    // If we have tool calls, we need to do a second LLM invocation with tool results
    if (toolCalls && toolCalls.length > 0) {
      console.log(`🔄 Re-invoking LLM with ${toolResults.length} tool results`);

      // Create assistant message with tool calls
      const assistantMessageWithTools: ChatMessage = {
        role: 'assistant',
        content: content || '',
        toolCalls: toolCalls?.map((tc: any) => ({
          name: tc.name,
          arguments: tc.args || {},
          result: toolResults.find(r => r.name === tc.name)
        })),
        timestamp: new Date()
      };

      // Add assistant message with tool calls to history
      await addMessage(sessionId, assistantMessageWithTools);

      // Create a user message with tool results for the LLM
      // (Claude API doesn't allow system messages in the middle of conversation)
      const toolResultsMessage: ChatMessage = {
        role: 'user',
        content: `[Tool execution results]\n${toolResults.map(r =>
          `- ${r.name}: ${r.success ? 'SUCCESS' : 'FAILED'} - ${r.message}${r.data ? `\nData: ${JSON.stringify(r.data, null, 2)}` : ''}`
        ).join('\n')}\n\nBased on these tool results, continue the conversation naturally. If you're in the middle of collecting information for a loan application, ask for the next piece of information according to the flow. Do NOT echo the tool success messages - instead, acknowledge the information conversationally and proceed with the next question.`,
        timestamp: new Date()
      };

      // Add tool results message to history
      await addMessage(sessionId, toolResultsMessage);

      // Get updated session with tool results
      const sessionWithToolResults = await getSession(sessionId);
      if (!sessionWithToolResults) {
        throw new Error('Session not found after tool execution');
      }

      // Re-invoke LLM with complete history including tool results
      const secondResult = await processChat(
        chatboxAgent,
        sessionWithToolResults.messages,
        '' // Empty message - we're continuing the conversation with tool results
      );

      if (secondResult.success && secondResult.data) {
        finalContent = secondResult.data.content;

        // Validate non-empty response - LLM sometimes returns empty content
        if (!finalContent || finalContent.trim().length === 0) {
          console.warn(`⚠️ LLM returned empty content after tool execution, constructing contextual fallback`);
          finalContent = constructContextualFallback(toolResults);
        }

        console.log(`✅ Got final response from LLM after tool execution`);
      } else {
        console.warn(`⚠️ Second LLM invocation failed, using contextual fallback`);
        // Fallback: construct a contextual response based on what tools were called
        finalContent = constructContextualFallback(toolResults);
      }

      // Create final assistant message with natural language response
      const finalAssistantMessage: ChatMessage = {
        role: 'assistant',
        content: finalContent,
        timestamp: new Date()
      };

      // Add final response to history
      await addMessage(sessionId, finalAssistantMessage);
    } else {
      // No tool calls - just add the content response
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: finalContent || '',
        timestamp: new Date()
      };

      // Add assistant message to history
      await addMessage(sessionId, assistantMessage);
    }

    // Get updated session for userData
    const updatedSession = await getSession(sessionId);

    // Extract flow from tool results
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
        message: finalContent || '',
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
