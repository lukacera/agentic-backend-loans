import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { AgentState, createAgent, createResponse, updateActivity } from './BaseAgent.js';
import { BaseAgentResponse, ChatMessage, ToolDefinition } from '../types/index.js';

// Tool definitions for Claude function calling
export const CHAT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'captureUserName',
      description: 'Capture the user\'s full name when they provide it',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The user\'s full name' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureBusinessName',
      description: 'Capture the business name when the user provides it',
      parameters: {
        type: 'object',
        properties: {
          businessName: { type: 'string', description: 'The name of the business' }
        },
        required: ['businessName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureBusinessPhone',
      description: 'Capture the business phone number when the user provides it',
      parameters: {
        type: 'object',
        properties: {
          businessPhone: { type: 'string', description: 'The business phone number' }
        },
        required: ['businessPhone']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureCreditScore',
      description: 'Capture the credit score when the user provides it (typically between 300-850)',
      parameters: {
        type: 'object',
        properties: {
          creditScore: { type: 'number', description: 'The credit score (300-850)' }
        },
        required: ['creditScore']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureYearFounded',
      description: 'Capture the year the business was founded',
      parameters: {
        type: 'object',
        properties: {
          yearFounded: { type: 'number', description: 'The year the business was founded' }
        },
        required: ['yearFounded']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureUSCitizen',
      description: 'Capture whether the user is a US citizen',
      parameters: {
        type: 'object',
        properties: {
          usCitizen: { type: 'boolean', description: 'Whether the user is a US citizen' }
        },
        required: ['usCitizen']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureAnnualRevenue',
      description: 'Capture the annual revenue of the business',
      parameters: {
        type: 'object',
        properties: {
          annualRevenue: { type: 'number', description: 'The annual revenue in dollars' }
        },
        required: ['annualRevenue']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureMonthlyRevenue',
      description: 'Capture the monthly revenue of the business',
      parameters: {
        type: 'object',
        properties: {
          monthlyRevenue: { type: 'number', description: 'The monthly revenue in dollars' }
        },
        required: ['monthlyRevenue']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureMonthlyExpenses',
      description: 'Capture the monthly expenses of the business',
      parameters: {
        type: 'object',
        properties: {
          monthlyExpenses: { type: 'number', description: 'The monthly expenses in dollars' }
        },
        required: ['monthlyExpenses']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureExistingDebtPayment',
      description: 'Capture the existing monthly debt payment',
      parameters: {
        type: 'object',
        properties: {
          existingDebtPayment: { type: 'number', description: 'The existing monthly debt payment in dollars' }
        },
        required: ['existingDebtPayment']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureRequestedLoanAmount',
      description: 'Capture the requested loan amount',
      parameters: {
        type: 'object',
        properties: {
          requestedLoanAmount: { type: 'number', description: 'The requested loan amount in dollars' }
        },
        required: ['requestedLoanAmount']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureLoanPurpose',
      description: 'Capture the purpose of the loan',
      parameters: {
        type: 'object',
        properties: {
          loanPurpose: { type: 'string', description: 'The purpose of the loan (e.g., working capital, equipment, expansion)' }
        },
        required: ['loanPurpose']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'capturePurchasePrice',
      description: 'Capture the purchase price (for business acquisition)',
      parameters: {
        type: 'object',
        properties: {
          purchasePrice: { type: 'number', description: 'The purchase price in dollars' }
        },
        required: ['purchasePrice']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureAvailableCash',
      description: 'Capture the available cash/down payment amount',
      parameters: {
        type: 'object',
        properties: {
          availableCash: { type: 'number', description: 'The available cash in dollars' }
        },
        required: ['availableCash']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureBusinessCashFlow',
      description: 'Capture the business cash flow',
      parameters: {
        type: 'object',
        properties: {
          businessCashFlow: { type: 'number', description: 'The business cash flow in dollars' }
        },
        required: ['businessCashFlow']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureIndustryExperience',
      description: 'Capture the user\'s industry experience',
      parameters: {
        type: 'object',
        properties: {
          industryExperience: { type: 'string', description: 'Description of industry experience' }
        },
        required: ['industryExperience']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureUserTypeNewApplication',
      description: 'Capture whether the user is a business owner or buyer',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'The user type: "owner" for existing business owner, "buyer" for someone buying a business',
            enum: ['owner', 'buyer']
          }
        },
        required: ['type']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureSellingFinancingPercentage',
      description: 'Capture the seller financing percentage',
      parameters: {
        type: 'object',
        properties: {
          sellerFinancingPercentage: { type: 'number', description: 'The seller financing percentage (0-100)' }
        },
        required: ['sellerFinancingPercentage']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureIfSellerFinancingOnStandbyExists',
      description: 'Capture whether seller financing on standby exists',
      parameters: {
        type: 'object',
        properties: {
          sellerFinancingOnStandbyExists: { type: 'boolean', description: 'Whether seller financing on standby exists' }
        },
        required: ['sellerFinancingOnStandbyExists']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureCheckboxSelection',
      description: 'Capture a checkbox selection for SBA forms. Use this for entity type, veteran status, sex, race, ethnicity, or special ownership type selections.',
      parameters: {
        type: 'object',
        properties: {
          group: {
            type: 'string',
            description: 'The checkbox group name',
            enum: ['entity', 'veteranStatus', 'sex', 'race', 'ethnicity', 'specialOwnershipType', 'businessType', 'wosbMaritalStatus', 'loanProgram']
          },
          value: {
            type: 'string',
            description: 'The selected value within the group'
          },
          formType: {
            type: 'string',
            description: 'The form type (SBA_1919 or SBA_413)',
            enum: ['SBA_1919', 'SBA_413']
          }
        },
        required: ['group', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureOpenSBAForm',
      description: 'Signal to open a specific SBA form for the user',
      parameters: {
        type: 'object',
        properties: {
          formType: {
            type: 'string',
            description: 'The form to open',
            enum: ['SBA_1919', 'SBA_413']
          }
        },
        required: ['formType']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureHighlightField',
      description: 'Highlight a specific field on the SBA form and optionally fill it with text',
      parameters: {
        type: 'object',
        properties: {
          field: { type: 'string', description: 'The field name to highlight' },
          text: { type: 'string', description: 'Optional text to fill in the field' },
          formType: {
            type: 'string',
            description: 'The form type (SBA_1919 or SBA_413)',
            enum: ['SBA_1919', 'SBA_413']
          }
        },
        required: ['field']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'captureLoan',
      description: 'Capture loan information including amount, type, and purpose',
      parameters: {
        type: 'object',
        properties: {
          loanAmount: { type: 'number', description: 'The loan amount in dollars' },
          loanType: { type: 'string', description: 'The type of loan' },
          loanPurpose: { type: 'string', description: 'The purpose of the loan' }
        }
      }
    }
  }
];

// System prompt for the chat agent
export const CHATBOX_SYSTEM_PROMPT = `You are Jessica, Torvely's AI loan specialist assistant. You help users apply for SBA (Small Business Administration) loans through a conversational chat interface.

Your role:
- Guide users through the SBA loan application process step by step
- Collect applicant information naturally through conversation
- Help users fill out SBA forms (Form 1919, Form 413) by capturing their information
- Update users on the status of their loan applications
- Answer questions about SBA loan requirements and eligibility
- Calculate loan eligibility based on provided information
- Be helpful, professional, and friendly

Information you need to collect for a loan application:
1. User's full name
2. Business name
3. Business phone number
4. Credit score (300-850)
5. Year business was founded
6. Whether they are a US citizen
7. User type: Are they an existing business owner or buying a business?

For existing business OWNERS, also collect:
- Monthly revenue
- Monthly expenses
- Existing debt payments
- Requested loan amount
- Loan purpose

For business BUYERS, also collect:
- Purchase price
- Available cash/down payment
- Business cash flow
- Industry experience

Guidelines:
- Ask for one piece of information at a time to keep the conversation natural
- Use the appropriate capture tool when the user provides information
- If the user provides multiple pieces of information at once, capture all of them
- Be conversational and supportive - applying for a loan can be stressful
- If the user asks about eligibility, explain that credit score, business age, and financials all factor in
- Always acknowledge when you've captured information
- When helping users fill out forms, use the captureHighlightField tool to guide them to specific fields
- When users ask about their application status, provide helpful information about where they are in the process
- Use the captureOpenSBAForm tool to help users navigate to specific SBA forms when needed

Start by introducing yourself and asking how you can help with their SBA loan application.`;

// Create chatbox agent
export const createChatboxAgent = (): AgentState => {
  return createAgent('ChatboxAgent', {
    maxConcurrentTasks: 5,
    timeout: 90000 // 90 seconds for function calling
  });
};

// Initialize chatbox agent
export const initializeChatboxAgent = async (): Promise<void> => {
  console.log('✅ Chatbox agent initialized successfully');
};

// Process chat message with function calling
export const processChat = async (
  agent: AgentState,
  messages: ChatMessage[],
  userMessage: string
): Promise<BaseAgentResponse<{ content: string; toolCalls: any[] }>> => {
  const startTime = Date.now();

  try {
    // Build message history for the LLM
    const langchainMessages: BaseMessage[] = [
      new SystemMessage(CHATBOX_SYSTEM_PROMPT)
    ];

    // Add conversation history
    for (const msg of messages) {
      if (msg.role === 'user') {
        langchainMessages.push(new HumanMessage(msg.content));
      } else if (msg.role === 'assistant') {
        langchainMessages.push(new AIMessage(msg.content));
      } else if (msg.role === 'system') {
        langchainMessages.push(new SystemMessage(msg.content));
      }
    }

    // Add the new user message
    langchainMessages.push(new HumanMessage(userMessage));

    // Create LLM with tools bound
    const llmWithTools = agent.llm.bindTools(CHAT_TOOLS as any);

    // Invoke the LLM
    const response = await llmWithTools.invoke(langchainMessages);

    updateActivity(agent);

    // Extract content and tool calls
    const content = typeof response.content === 'string'
      ? response.content
      : '';

    const toolCalls = response.tool_calls || [];

    return createResponse(
      true,
      { content, toolCalls },
      undefined,
      Date.now() - startTime
    );

  } catch (error) {
    console.error('❌ Chatbox processing error:', error);
    return createResponse<{ content: string; toolCalls: any[] }>(
      false,
      undefined,
      error instanceof Error ? error.message : 'Failed to process chat message',
      Date.now() - startTime
    );
  }
};

// Get agent capabilities
export const getChatboxAgentCapabilities = (): string[] => [
  'AI-powered loan application assistance',
  'Natural language conversation',
  'Automatic data extraction and capture',
  'Claude function calling for structured data',
  'Full conversation history support',
  'SBA loan eligibility guidance',
  'Real-time form field updates via WebSocket',
  'Support for both business owners and buyers',
  'Checkbox and form field capture',
  'Multi-form support (SBA 1919, SBA 413)'
];
