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
import { getIO } from '../services/websocket.js';

const router = express.Router();

// Initialize the chatbox agent
const chatboxAgent = createChatboxAgent();
initializeChatboxAgent().catch(console.error);


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

      // Build flow-specific continuation instructions
      let continuationInstruction = `Based on these tool results, continue the conversation naturally.

⚠️ MANDATORY: You MUST generate natural language text in your response. Do NOT return empty content.

If you're collecting information for a loan application, ask for the next piece of information according to the flow. Always include a question or statement to continue the conversation.`;

      // Check for continue form flow
      const hasOpenFormResult = toolResults.some(r => r.name === 'captureOpenSBAForm');
      const hasFilledFieldsResult = toolResults.some(r => r.name === 'getFilledFields');

      if (hasOpenFormResult && hasFilledFieldsResult) {
        const formResult = toolResults.find(r => r.name === 'captureOpenSBAForm');
        const formType = formResult?.data?.formType || 'SBA_1919';

        continuationInstruction = `The user has selected to continue with ${formType}. You MUST now guide them through filling out the remaining empty fields listed in the getFilledFields result. Start by acknowledging the form is open, tell them how many fields remain, then ask about the FIRST empty field. Follow the form completion flow from your instructions.`;
      } else if (hasOpenFormResult) {
        // Form opened but no filled fields data (new application flow)
        const formResult = toolResults.find(r => r.name === 'captureOpenSBAForm');
        const formType = formResult?.data?.formType || 'SBA_1919';

        continuationInstruction = `The user has selected ${formType}. You MUST now begin the guided form completion flow. Acknowledge the form is open and start asking about the first field according to your form completion instructions.`;
      }

      // Check for new application eligibility results
      const hasEligibilityResult = toolResults.some(r =>
        r.name === 'chancesUserSBAApprovedBUYER' || r.name === 'chancesUserSBAApprovedOWNER'
      );
      if (hasEligibilityResult) {
        continuationInstruction = "You just calculated the user's SBA eligibility. You MUST explain the results including the score, chance level, and ALL the reasons from the reasons array. Then ask if they're ready to fill out the form.";
      }

      // Check for retrieveAllApplications
      const hasAllAppsResult = toolResults.some(r => r.name === 'retrieveAllApplications');
      if (hasAllAppsResult) {
        const appsResult = toolResults.find(r => r.name === 'retrieveAllApplications');
        const count = appsResult?.data?.applications?.length || 0;
        continuationInstruction = `You retrieved ${count} application(s) for the user. Tell them how many applications you found and ask them to select one to continue with.`;
      }

      // CRITICAL: Check for form filling in progress (captureHighlightField)
      const hasHighlightResult = toolResults.some(r => r.name === 'captureHighlightField');
      if (hasHighlightResult) {
        // Extract field info from the last highlight call
        const highlightResults = toolResults.filter(r => r.name === 'captureHighlightField');
        const lastHighlight = highlightResults[highlightResults.length - 1];
        const fieldName = lastHighlight.data?.field || 'unknown';
        const fieldText = lastHighlight.data?.text || '';
        const formType = lastHighlight.data?.formType || 'SBA_1919';

        if (fieldText && fieldText.trim().length > 0) {
          // Step 2: Just filled a field with value
          continuationInstruction = `✅ You just filled the "${fieldName}" field in ${formType} with the value "${fieldText}".

🎯 YOUR NEXT ACTION (MANDATORY):
According to the form filling protocol, in your NEXT response you MUST:
1. Call captureHighlightField for the NEXT field in the form sequence with empty text parameter ("")
2. In the SAME response, generate natural language asking the user for that next field's information

Example correct response structure:
- Tool calls: [captureHighlightField("nextFieldName", "", "${formType}")]
- Text: "What's the [next field description]?"

❌ DO NOT:
- Say "Got it" or acknowledge the previous field
- Return empty text content
- Return only tool calls without a question

✅ DO:
- Move immediately to the next field in the sequence
- Ask a natural, conversational question about the next field
- Include BOTH tool call AND natural language text in your response`;
        } else {
          // Step 1: Just highlighted empty field
          continuationInstruction = `✅ You just highlighted the "${fieldName}" field in ${formType} with empty text (to show the user where to enter data).

🎯 YOUR NEXT ACTION (MANDATORY):
You MUST now generate a natural language question asking the user for information for the "${fieldName}" field.

Example for "${fieldName}":
Look up this field name in your form instructions and ask the appropriate question in a conversational, natural way.

⚠️ CRITICAL: Your response MUST contain text asking about "${fieldName}". Do NOT return empty content.`;
        }
      }

      // Auto-highlight first empty field when form is opened in continue flow
      if (hasOpenFormResult && hasFilledFieldsResult) {
        const filledFieldsResult = toolResults.find(r => r.name === 'getFilledFields');
        const openFormResult = toolResults.find(r => r.name === 'captureOpenSBAForm');
        const formType = (openFormResult?.data?.formType || 'SBA_1919') as string;
        const formKey = formType === 'SBA_413' ? 'sba413' : 'sba1919';
        const emptyFields = filledFieldsResult?.data?.[formKey]?.emptyFields || [];

        if (emptyFields.length > 0) {
          const firstEmptyField = emptyFields[0];
          const io = getIO();

          if (io) {
            io.to('global').to(sessionId).emit('highlight-fields', {
              sessionId,
              timestamp: new Date().toISOString(),
              field: firstEmptyField,
              formType,
              source: 'auto-advance-chat'
            });

            console.log(`➡️ Auto-highlighted first empty field: ${firstEmptyField} for session ${sessionId}`);
          }
        }
      }

      // Create a user message with tool results for the LLM
      // (Claude API doesn't allow system messages in the middle of conversation)
      // Filter out captureHighlightField results - they're just UI updates
      // BUT: Keep them if we're giving specific form filling instructions
      const relevantToolResults = hasHighlightResult
        ? toolResults // Keep all results when in form filling mode for context
        : toolResults.filter(r => r.name !== 'captureHighlightField'); // Otherwise filter out UI-only tools

      const toolResultsMessage: ChatMessage = {
        role: 'user',
        content: `[Tool execution results]\n${relevantToolResults.map(r =>
          `- ${r.name}: ${r.success ? 'SUCCESS' : 'FAILED'} - ${r.message}${r.data ? `\nData: ${JSON.stringify(r.data, null, 2)}` : ''}`
        ).join('\n')}\n\n${continuationInstruction}\n\n🚨 CRITICAL INSTRUCTIONS - YOU MUST FOLLOW THESE EXACTLY:
1. DO NOT mention tool execution results to the user
2. DO NOT say "Field highlighted successfully" or "captured successfully" or any technical confirmation
3. DO NOT return empty content - you MUST generate a natural language response
4. ALWAYS include a question or statement in your response - NEVER return just tool calls without text
5. These tool results are internal system messages - continue the conversation naturally as if the tools ran silently in the background

⚠️ MANDATORY: Your response MUST contain natural language text that continues the conversation. Tool calls alone are NOT sufficient.`,
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

        // Validate non-empty response - This should NEVER happen with proper prompting
        if (!finalContent || finalContent.trim().length === 0) {
          console.error(`❌ CRITICAL: LLM returned empty content after tool execution despite explicit instructions`);
          console.error(`Tool results were:`, JSON.stringify(toolResults.map(r => ({ name: r.name, success: r.success })), null, 2));

          // This is an error condition - the LLM should ALWAYS generate content
          // Return an error to the user instead of hiding it with a fallback
          return res.status(500).json({
            success: false,
            error: 'AI assistant failed to generate a response. Please try again.'
          });
        }

        console.log(`✅ Got final response from LLM after tool execution`);
      } else {
        console.error(`❌ Second LLM invocation failed:`, secondResult.error);
        return res.status(500).json({
          success: false,
          error: 'Failed to process message. Please try again.'
        });
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
