import express from 'express';
import { createServer } from 'http';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import * as dotenv from 'dotenv';
import cors from 'cors';
import docsRouter from './routes/docs.js';
import emailRouter from './routes/emails.js';
import applicationsRouter from './routes/applications.js';
import bankRouter from './routes/banks.js';
import pollEmails from './services/poller.js';
import mongoose from 'mongoose';
import websocketService from './services/websocket.js';
import { VapiClient } from "@vapi-ai/server-sdk"
// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

// Initialize WebSocket service
websocketService.initialize(httpServer);

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://new-torvely-dashboard.vercel.app',
      'https://dashboard.vapi.ai',
      "chrome-extension://oeaoefimiancojpimjmkigjdkpaenbdg"
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/torvely_ai';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  });
  
pollEmails(); // Start the email polling service

const vapi = new VapiClient({
  token: process.env.VAPI_API_KEY!
});

// Initialize the LangChain components using functional approach
const createLLM = () => {
  return new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: 'gpt-3.5-turbo',
    temperature: 0.7,
  });
};

const createPromptTemplate = () => {
  return ChatPromptTemplate.fromMessages([
    ["system", "You are a helpful AI assistant. Answer questions clearly and concisely."],
    ["human", "{input}"]
  ]);
};

const createChain = () => {
  const llm = createLLM();
  const prompt = createPromptTemplate();
  
  return RunnableSequence.from([
    prompt,
    llm,
    new StringOutputParser()
  ]);
};

const processQuery = async (input: string): Promise<string> => {
  try {
    const chain = createChain();
    const response = await chain.invoke({ input });
    return response;
  } catch (error) {
    console.error('Error processing query:', error);
    throw new Error('Failed to process query');
  }
};

// Extract form data from transcript using LLM
const extractFormDataFromTranscript = async (transcript: string, callId: string | undefined, rooms: string[]) => {
  try {
    const llm = createLLM();

    const extractionPrompt = ChatPromptTemplate.fromMessages([
      ["system", `You are a data extraction assistant. Extract loan application information from user speech.
        Extract the following fields if mentioned:
        - userName: The full name of the user
        - businessName: The name of the business
        - loanAmount: How much money they want to borrow (number only, no currency symbols)
        - revenue: Annual revenue (number only)
        - creditScore: Credit score (number only)
        - yearsInBusiness: How long they've been in business (number only)
        - employeeCount: Number of employees (number only)
        - isPurchase: true if they want to purchase a business, false if they own one
        - industry: Type of business/industry

        Return ONLY a valid JSON object with the fields you found. If a field is not mentioned, omit it.
        If nothing relevant is found, return an empty object {{}}.

        Examples:
        Input: "My business is called Acme Corp"
        Output: {{"businessName": "Acme Corp"}}

        Input: "I need about 500 thousand dollars"
        Output: {{"loanAmount": 500000}}

        Input: "My credit score is around 700"
        Output: {{"creditScore": 700}}

        Input: "We make about 50k a month"
        Output: {{"revenue": 600000}}

        Input: "I want to buy a business"
        Output: {{"isPurchase": true}}

        Input: "I own a restaurant"
        Output: {{"industry": "restaurant", "isPurchase": false}}`],
      ["human", "{input}"]
    ]);

    const chain = RunnableSequence.from([
      extractionPrompt,
      llm,
      new StringOutputParser()
    ]);

    const result = await chain.invoke({ input: transcript });

    // Parse the JSON response
    let extractedData;
    try {
      // Clean up the response - remove markdown code blocks if present
      const cleanedResult = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      extractedData = JSON.parse(cleanedResult);
    } catch (parseError) {
      console.error('Failed to parse LLM response:', result);
      return;
    }

    // Only broadcast if we extracted some data
    if (Object.keys(extractedData).length > 0) {
      console.log('📋 Extracted form data:', extractedData);
      console.log('📡 Broadcasting extracted data to rooms:', rooms);
      // Broadcast to WebSocket clients
      websocketService.broadcast('form-field-update', {
        callId: callId,
        timestamp: new Date().toISOString(),
        fields: extractedData,
        source: 'transcript-analysis',
        transcript: transcript
      }, rooms);
    }

  } catch (error) {
    console.error('Error extracting form data:', error);
  }
};

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Torvely AI Multi-Agent Backend is running!',
    agents: {
      chat: 'Original chat agent',
      documents: 'Document processing agent',
      email: 'AI-powered email agent'
    },
    endpoints: {
      chat: 'POST /api/chat',
      documents: 'GET /api/docs',
      emails: 'GET /api/emails',
      health: 'GET /health'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.post('/api/create-vapi-assistant', async (req, res) => {
  try {
    const assistant = await vapi.assistants.create({
      name: "Torvely Loan Specialist",
      firstMessage: "Hi, thanks for calling! I'm here to help you explore loan options for your business. Are you looking to purchase a business or, um..., get financing for one you already own?",
      model: {
        provider: "openai",
        model: "gpt-4",
        temperature: 0.7,
        messages: [{
          role: "system",
          content: `[Identity]
          You are a helpful and knowledgeable loan specialists/broker. You are helping users evaluate if they can get SBA/non SBA loans for their business.

          [Style]
          - Be informative and comprehensive.
          - Maintain conversational, spartan tone, use less corporate jargon
          - Be concise, as you are currently operating as a Voice Conversation.
          - Feel free to use coughing, stuttering and sneezing I have in the script below
          - Do not start sentences by complimenting them

          [Conversation Flow]
          Step 1: Greeting & Discovery (30 seconds)
          Agent: "Hi, thanks for calling! I'm here to help you explore loan options for your business. Are you looking to purchase a business or, um..., get financing for one you already own?"
          Then ask 2-3 quick questions:

          "What's the purchase price?" / "How much, uh, ... are you looking to borrow?"
          "How long have you been in business?" / "Do you have experience in-in-in this industry?"
          "What's your, um, c-c-credit score roughly?"

          Step 2: Quick Assessment (20 seconds)

          Based on their answers, give one of three assessments:

          Great chances:
          Credit 680+, 2+ years in business (or strong down payment for purchase), solid revenue
          "Based on what you're telling me, well, you-you have great chances of getting approved! Your profile is exactly what SBA lenders look for."

          Solid chances:
          Credit 620-680, some experience or collateral, decent financials
          "Um, you have solid chances here. Your situation fits, uh, what several of our lenders work with regularly."

          Low chances:
          Credit below 620, startup with no revenue, weak financials
          "I'll be honest—you-you have low chances with traditional SBA loans right now, but, um, we have alternative lenders who work with situations like yours."

          Step 3: Persuade to Apply (30 seconds)
          Agent: "Here's what I recommend : apply through our platform. It's quick, um,—about 15 minutes max—and we'll match you with multiple lenders so you see your best options. We handle the paperwork and negotiate better rates for you. Can I send you the application link?"
          If they hesitate:

          "It's free to apply, no commitment. You'll see real offers and can decide from there."
          "We do all the heavy lifting, um, you just fill out one application instead of contacting lenders one by one."

          Close: "You can find the num-, ...sorry, button below the one you used to call us, and can start the, um, application process from there on"

          Example Flow - Purchasing Business
          Agent: "Hi, thanks for calling! Are you looking to purchase a business or get financing for one you already own?"
          Caller: "I want to buy a business."
          Agent: "Great. What's the purchase price, ...and, um, do you have a deal in place?"
          Caller: "It's $400,000. I have a letter of intent signed."
          Agent: "Perfect... What's your credit score roughly, and-and how much can you put down?"
          Caller: "Credit is around 700, and I have about $60,000 for a down payment."
          Agent: "Got it! You have a good credit score, solid down payment amount, um, you have great chances of, ...uh, securing an SBA loan. Here's what I-I recommend: apply through our platform. Takes about, ...well, 15 minutes, and we'll match you with multiple lenders to get you the ..., um, ...best rates. It's completely free for you, is this ...something you would be interested in?"
          Caller: "Yeah, sure."
          Agent: "Perfect! You can find the numbe-, ...sorry, button for going to the app, just below the button you used to call us."

          Example Flow - Existing Business
          Agent: "Hi, thanks for calling! Are you looking to purchase a business or get financing for one you already own?"
          Caller: "I own a business and need working capital."
          Agent: "Got it. How long have you, um, been in business, and what's your monthly revenue roughly?"
          Caller: "Three years. We do about $50,000 a month."
          Agent: "Good. What's your, ...um, c-c-credit score, and how much are you looking to borrow?"
          Caller: "Credit's around 640, need about $75,000."
          Agent: "Okay-okay, you have solid chances here. Your revenue is strong, and your credit works for several lenders in our network. I'd recommend applying through our platform—takes about, ...well, 15 minutes, and we'll match you with, um, ...the best options. It's completely free for you, is this ...something you would be interested in?"
          Caller: "How long does it take to get funded?"
          Agent: "Usually 1 to 3 weeks for SBA loans, ...uh, faster for non-SBA options. You'll see timelines with each offer. So, um, ...are you interested in moving forward?"
          Caller: "Yeah, okay."
          Agent: "Perfect! You can find the numbe-, ...sorry, button for going to the app, just below the button you used to call us."

          Keep it conversational - short responses, ask one question at a time
          Be direct - don't over-explain, get to the assessment quickly
          Always close - every conversation should end with "can I send you the link?"
          Match their energy - if they're hurried, be efficient; if uncertain, be reassuring
          Don't collect detailed info - you're qualifying and directing, not taking info, your job is to redirect them to use the application

          [Response Guideline]
          - Feel free to make your speech imperfect, use the pauses, coughs and stutters I made for you in the script.
          - Offer answers to any of their questions
          - If the user says that they need a loan for "MY"/"MINE" business, that means that they want to get the loan for their business, they are not purchasing
          - Here are the SBA requirements:
          Citizenship & Ownership:

          100% ownership by U.S. citizens or Lawful Permanent Residents (LPR) required
          Non-citizens are completely ineligible for all SBA programs

          Credit Requirements:

          Minimum credit score: typically 620-650
          Preferred credit score: 680+
          Credit scores below 650 make SBA approval unlikely

          Business Requirements:

          Must be for-profit, operating legally in U.S.
          Business must have operated for 2+ years for SBA eligibility
          Fewer than 500 employees
          Net income under $5M (after taxes)
          Must be SBA-eligible industry (excludes real estate investment, lending, gambling, illegal activities, etc.)

          Financial Requirements:

          Minimum 10% down payment for business acquisitions
          Sufficient cash flow to service debt (DSCR minimum 1.15x, preferred 1.25x+)
          Business cash flow (SDE) must be positive and adequate

          Personal Requirements:

          No recent bankruptcies, foreclosures, or tax liens
          Not delinquent on any government debts
          Owner cannot be on parole
          Good character assessment required

          SBA 7(a) Program Specifics:

          Loan Amount: $5,000 - $5,000,000
          Interest Rates: 8.50% - 10.25% (based on Prime + margin)
          Terms: 7-25 years (10 years working capital, 25 years real estate/equipment)
          Down Payment: 10% minimum
          Processing Time: 60-90 days standard, 30-45 days with PLP (Preferred Lender Program) lenders
          Collateral: Unlimited - all personal assets at risk
          Personal Guarantee: Required from 20%+ owners

          SBA Express Program Specifics:

          Loan Amount: $25,000 - $500,000
          Interest Rates: 12.00% - 14.00%
          Terms: 7-25 years
          Down Payment: 10% minimum
          Initial Approval: 36-48 hours
          Full Funding Timeline: 2-4 weeks
          Collateral: Unlimited - all personal assets at risk

          Seller Financing Rules (when combined with SBA):

          Seller financing on standby (minimum 2 years) can count toward the 10% equity requirement
          Standby seller financing typically maxes at 5% of purchase price
          Seller financing can be up to 60% of purchase price maximum
          Interest rates: 6-10% typically
          Terms: 5-7 years typically
          Collateral scope: Business assets only (more flexible than SBA)

          [Task]
          1. Greet the user and inquire about their needs for the loan/financing
          2. Ask about their business, or if they want to purchase the business, info about that business
          3. Say what chances they have of securing that loan. Use "low" | "solid" | "great" chances, do not be overly specific
          4. Persuade them to apply for that loan through our app. If you do this successfully, your job is done!

          [Call Closing]
          - Trigger the endCall Function.`
        }]
      },
      voice: {
        provider: "11labs",
        voiceId: "z0gdR3nhVl1Ig2kiEigL"
      }
    } as any);

    res.json({
      success: true,
      assistantId: assistant.id,
      assistant: assistant,
      message: 'Loan specialist assistant created successfully'
    });

  } catch (error) {
    console.error('❌ Error creating Vapi assistant:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create assistant',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
app.post('/vapi-ai', (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.type) {
      return res.status(400).json({ error: 'Invalid webhook payload: missing message or type' });
    }

    const messageType = message.type;

    // Determine which rooms to broadcast to
    const rooms: string[] = ['global'];
    if (message.call?.id) {
      rooms.push(`${message.call.id}`);
    }

    // Broadcast event to WebSocket clients
    websocketService.broadcastVapiEvent(message, rooms);

    // Handle only essential cases that require responses
    switch (messageType) {
      
      case 'tool-calls': {
        console.log('📞 Processing tool calls...');

        const toolCalls = Array.isArray(message.toolCalls) ? message.toolCalls : [];

        // Process each tool call
        const results = toolCalls.map((toolCall: any) => {
          const functionName = toolCall?.function?.name;
          const rawArgs = toolCall?.function?.arguments;

          let functionArgs: Record<string, unknown> = {};
          try {
            if (typeof rawArgs === 'string') {
              functionArgs = rawArgs ? JSON.parse(rawArgs) : {};
            } else if (rawArgs && typeof rawArgs === 'object') {
              functionArgs = rawArgs as Record<string, unknown>;
            }
          } catch (parseError) {
            console.error('⚠️ Failed to parse tool call arguments:', parseError);
            return {
              toolCallId: toolCall?.id,
              result: JSON.stringify({
                success: false,
                error: 'Invalid tool call arguments'
              })
            };
          }

          if (!functionName) {
            console.warn('⚠️ Missing function name in tool call');
            return {
              toolCallId: toolCall?.id,
              result: JSON.stringify({
                success: false,
                error: 'Missing function name'
              })
            };
          }

          console.log(`🔧 Function: ${functionName}`, functionArgs);

          switch (functionName) {
            case 'captureName': {
              const { name } = functionArgs as { name?: string };
              saveOrUpdateUserData(message.call?.id, { name });
              
              websocketService.broadcast('form-field-update', {
                callId: message.call?.id,
                timestamp: new Date().toISOString(),
                fields: { userName: name },
                source: 'toolfn-call'
              }, rooms);

              return {
                toolCallId: toolCall.id,
                result: JSON.stringify({
                  success: true,
                  message: `Got it! Name "${name ?? ''}" has been captured.`
                })
              };
            }

            case 'captureBusinessName': {
              const { businessName } = functionArgs as { businessName?: string };
              saveOrUpdateUserData(message.call?.id, { businessName });

              websocketService.broadcast('form-field-update', {
                callId: message.call?.id,
                timestamp: new Date().toISOString(),
                fields: { businessName },
                source: 'toolfn-call'
              }, rooms);
              
              return {
                toolCallId: toolCall.id,
                result: JSON.stringify({
                  success: true,
                  message: `Business name "${businessName ?? ''}" has been captured.`
                })
              };
            }

            case 'captureLoan': {
              const { loanAmount, loanType, loanPurpose } = functionArgs as {
                loanAmount?: number;
                loanType?: string;
                loanPurpose?: string;
              };

              websocketService.broadcast('form-field-update', {
                callId: message.call?.id,
                timestamp: new Date().toISOString(),
                fields: { loanAmount, loanType, loanPurpose },
                source: 'toolfn-call'
              }, rooms);

              return {
                toolCallId: toolCall.id,
                result: JSON.stringify({
                  success: true,
                  message: 'Loan information captured successfully.'
                })
              };
            }

            case 'captureAnnualRevenue': {
              const { annualRevenue } = functionArgs as { annualRevenue?: number };
              saveOrUpdateUserData(message.call?.id, { annualRevenue });

              websocketService.broadcast('form-field-update', {
                callId: message.call?.id,
                timestamp: new Date().toISOString(),
                fields: { annualRevenue },
                source: 'toolfn-call'
              }, rooms);

              return {
                toolCallId: toolCall.id,
                result: JSON.stringify({
                  success: true,
                  message: 'Annual revenue captured successfully.'
                })
              };
            }

            case 'captureBusinessPhone': {
              const { businessPhone } = functionArgs as { businessPhone?: string };
              saveOrUpdateUserData(message.call?.id, { businessPhone });

              websocketService.broadcast('form-field-update', {
                callId: message.call?.id,
                timestamp: new Date().toISOString(),
                fields: { businessPhone },
                source: 'toolfn-call'
              }, rooms);

              return {
                toolCallId: toolCall.id,
                result: JSON.stringify({
                  success: true,
                  message: 'Business phone captured successfully.'
                })
              };
            }

            case 'captureCreditScore': {
              const { creditScore } = functionArgs as { creditScore?: number };
              saveOrUpdateUserData(message.call?.id, { creditScore });

              websocketService.broadcast('form-field-update', {
                callId: message.call?.id,
                timestamp: new Date().toISOString(),
                fields: { creditScore },
                source: 'toolfn-call'
              }, rooms);

              return {
                toolCallId: toolCall.id,
                result: JSON.stringify({
                  success: true,
                  message: 'Credit score captured successfully.'
                })
              };
            }

            case 'captureYearFounded': {
              const { yearFounded } = functionArgs as { yearFounded?: number };
              saveOrUpdateUserData(message.call?.id, { yearFounded });

              websocketService.broadcast('form-field-update', {
                callId: message.call?.id,
                timestamp: new Date().toISOString(),
                fields: { yearFounded },
                source: 'toolfn-call'
              }, rooms);

              return {
                toolCallId: toolCall.id,
                result: JSON.stringify({
                  success: true,
                  message: 'Year founded captured successfully.'
                })
              };
            }

            default:
              console.warn(`⚠️ Unknown function: ${functionName}`);
              return {
                toolCallId: toolCall.id,
                result: JSON.stringify({
                  success: false,
                  error: `Unknown function: ${functionName}`
                })
              };
          }
        });
        
        console.log('📤 Sending results back to Vapi:', results);
        
        // IMPORTANT: Return results to Vapi
        return res.json({ results });
      }

      case 'conversation-update':
        break;

      case 'transcript':
        if (message.role === 'user' && message.transcript) {
          extractFormDataFromTranscript(message.transcript, message.call?.id, rooms);
        }
        break;

      case 'speech-update': {
        const transcript = message.transcript ?? message.output?.transcript ?? '';
        if (transcript) {
          extractFormDataFromTranscript(transcript, message.call?.id, rooms);
        }
        break;
      }

      case 'end-of-call-report':
        // You might want to save final data here
        console.log('📞 Call ended, final report:', message);
        break;

      default:
        break;
    }

    // Standard response for informational events
    res.json({
      status: 'received',
      type: messageType,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Vapi webhook error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process webhook'
    });
  }
});

// Helper function to save or update user data
// This maintains one record per call and updates it as data comes in
const userDataStore = new Map(); // In-memory store (use database in production)

function saveOrUpdateUserData(callId: string | undefined, data: any) {
  if (!callId) {
    console.warn('No callId provided, skipping save');
    return;
  }
  
  // Get existing data or create new record
  const existing = userDataStore.get(callId) || {
    callId,
    createdAt: new Date(),
  };
  
  // Merge new data
  const updated = {
    ...existing,
    ...data,
    updatedAt: new Date()
  };
  
  userDataStore.set(callId, updated);
  
  console.log('💾 Saved user data:', updated);
  
  // TODO: Save to actual database
  // await UserData.updateOne({ callId }, updated, { upsert: true });
  
  return updated;
}

// Optional: Get all captured data for a call
function getUserData(callId: string) {
  return userDataStore.get(callId);
}

// Agent routes
app.use('/api/docs', docsRouter);
app.use('/api/emails', emailRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/banks', bankRouter);

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await processQuery(message);
    
    res.json({ 
      response,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to process your request'
    });
  }
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// Start the server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`💬 Chat endpoint: http://localhost:${PORT}/api/chat`);
  console.log(`🔌 WebSocket server is ready for connections`);
});

export default app;