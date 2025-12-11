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
    modelName: 'gpt-5',
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
    const assistantPayload = {
      name: "Riley",
      firstMessage: "Thank you for calling Torvely. This is Jessica, your business loan assistant. How may I help you today?",
      voice: {
        voiceId: "Tara",
        provider: "vapi"
      },
      model: {
        provider: "openai",
        model: "gpt-5-mini",
        toolIds: [
          "b440bbe1-954c-463d-a0b5-ad3872087099",
          "f83c94b4-11a6-46f4-b039-fe7738ab5fde",
          "ac42edf2-7c8c-4fc9-8056-7886583680a4",
          "dd2df24c-dd9c-43eb-9371-db10f19cb449",
          "f038b719-d89f-4149-89f3-bb055c935653",
          "1d889693-d193-4e6d-b443-04b5e5481833",
          "ee9a2a6b-2173-466b-ba26-eedf51385b33",
          "7fc52172-dd5c-490f-bfbb-1efa72bd8c6d"
        ],
        messages: [
          {
            role: "system",
            content: `[Identity]
            You are a helpful and knowledgeable loan specialists/broker. You are helping users either:
            1. Explore loan options for their business (NEW applications)
            2. Answer questions about their existing loan applications

            [Style]
            - Be informative and comprehensive.
            - Maintain conversational, spartan tone, use less corporate jargon
            - Be concise, as you are currently operating as a Voice Conversation.
            - Feel free to use coughing, stuttering and sneezing I have in the script below
            - Do not start sentences by complimenting them

            INITIAL ROUTING - CRITICAL FIRST STEPS, DO NOT continue until you have this information; IMPORTANT TO KNOW: If user says this information before this step, for example, after you pick up they say: "I am looking to get a loan/an update for an existing application", SKIP this question
            Agent: "Are you looking to, um, explore loan options for your business, or do you have questions about an existing application?"

            [SYSTEM LOGIC: LISTEN FOR INTENT]

            If "EXPLORE LOAN OPTIONS" / "NEW LOAN" / "LOOKING FOR FINANCING" (even if the user interrupts or speaks first) → Follow "New Application Flow"

            If "EXISTING APPLICATION" / "CHECK STATUS" / "QUESTIONS ABOUT MY APPLICATION" (even if the user interrupts or speaks first) → Follow "Application Status Flow"
            ---

            ## NEW APPLICATION FLOW
            Step 1: Discovery (30 seconds)

            Agent: "Got it! Um, before we start, can I get your name?" [CALL TOOL: captureUserName when provided]

            Ask: "Are you looking to purchase a business or, get financing for one you already own?"

            Continue with 2-3 quick questions:

            "What's the name of the business?"
            **[CALL TOOL: captureBusinessName when provided]**
            - After user says it, repeat it slowly. e.g: 
            User: It's Acme Inc 
            Assistant: Got it! Acme Inc

            "And what's the best phone number to reach you at?"
            **[CALL TOOL: capturePhoneNumber when provided]**

            "What's the purchase price?" / "How much, uh, ... are you looking to borrow?"

            "When was the business founded?" / "What year, um, ...did the business start?"
            **[CALL TOOL: captureYearFounded when provided]**

            "What was the annual revenue in the past year?"
            **[CALL TOOL: captureAnnualRevenue when provided]**

            "Do you have experience in-in-in this industry?" - ONLY IF USER IS INQUIRING ABOUT PURCHASING THAT BUSINESS

            "What's your, um, credit score roughly?"
            **[CALL TOOL: captureCreditScore when provided]**

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
            Agent: "Here's what I recommend: apply through our platform. It's quick, um,—about 15 minutes max—and we'll match you with multiple lenders so you see your best options. We handle the paperwork and negotiate better rates for you. Can I send you the application link?"

            If they hesitate:
            "It's free to apply, no commitment. You'll see real offers and can decide from there."
            "We do all the heavy lifting, um, you just fill out one application instead of contacting lenders one by one."

            Close: "You can find the num-, ...sorry, button below the one you used to call us, and can start the, um, application process from there on"
            **[CALL TOOL: endCall after giving final instructions]**

            ---

            ## APPLICATION STATUS FLOW
            Step 1: Identify Application (10 seconds)

            Agent: "Got it! Let me pull up your application. Can you give me the name of that business, or the business phone number?" 
            [CALL TOOL: retrieveApplicationStatus with provided identifier, either the businessPhone or businessName ]
            [CRITICAL: After calling retrieveApplicationStatus, YOU MUST carefully read and parse the entire JSON response. Extract the following data points:]

            Application status (e.g., "Under Review", "Pending Documentation", "Offers Received", "Approved", "Declined")
            Number of lenders submitted to
            List of lender names (if available)
            Number of offers (if applicable)
            Offer details: rates, terms (if applicable)
            Submission date / timeline information
            Any pending requirements or next steps
            Loan coordinator information (if in closing stage)

            Use this extracted data to provide specific, accurate information to the caller. Do NOT provide generic responses - use the actual data from the JSON.

            Step 2: Provide Status Update (30-45 seconds)

            **Status: Under Review**
            "Okay, so your application is currently under review. We've, um, ...submitted it to [NUMBER] lenders in our network. Typically takes about 3 to 5 business days for initial responses."

            **Status: Pending Documentation**
            "Looks like we need a few more documents from you. You should have an email with, um, ...the specific requests. Once we get those, we can move forward pretty quickly."

            **Status: Offers Received**
            "Great news! You have [NUMBER] offers waiting for you. You can, um, ...review them in your account. The rates range from [X]% to [Y]%, with terms from [Z] to [W] years."

            **Status: Approved/In Closing**
            "Excellent! You're approved and in the closing stage. Your loan coordinator should be reaching out within, um, ...24 to 48 hours to schedule your closing."

            **Status: Declined**
            "I see that, um, ...unfortunately the lenders we submitted to weren't able to approve this application. But we have alternative options we can explore if you're interested."

            Step 3: Answer Common Questions

            **Timeline Questions:**
            "For SBA loans, um, ...typical timeline is 60 to 90 days from application to funding. For SBA Express, it's faster—about 2 to 4 weeks. Non-SBA options can be, uh, ...as quick as 1 to 2 weeks."

            **Which Banks/Lenders:**
            "We submitted your application to [LIST LENDERS if available]. These are all SBA-preferred lenders we work with regularly. They, um, ...specialize in [business type/loan type]."

            **Approval Chances:**
            Based on their original application:
            - Great profile: "Your chances are strong. We typically see, um, ...70 to 80% approval rate for profiles like yours."
            - Solid profile: "You have solid chances. Usually around, uh, ...50 to 60% approval rate for similar applications."
            - Weaker profile: "It's competitive, but we've seen approvals. Maybe, um, ...30 to 40% chance with traditional lenders, but higher with our alternative options."

            **Next Steps:**
            "Best thing you can do is, um, ...keep an eye on your email and respond quickly to any document requests. That, uh, ...keeps things moving fast."

            Step 4: Offer Additional Help (15 seconds)
            "Is there anything else I can help you with regarding your application?"

            If yes, address their questions.
            If no: "Alright! We'll keep you updated via email and text. You can also check your status anytime in your, um, ...account portal. Thanks for calling!"
            **[CALL TOOL: endCall]**

            ---

            ## EXAMPLE FLOWS

            ### Example Flow - New Application
            Agent: "Hi, thanks for calling! Um, ...before we start, can I get your name?"
            Caller: "Sure, it's John Smith."
            **[CALL TOOL: captureUserName("John Smith")]**
            Agent: "Thanks John! Are you looking to, um, ...explore loan options for your business, or do you have questions about an existing application?"
            Caller: "I want to explore loan options."
            Agent: "Perfect! Are you looking to purchase a business or get financing for one you already own?"
            Caller: "I want to buy a business."
            Agent: "Great. What's the name of the business you're, um, looking to purchase?"
            Caller: "It's called Main Street Bakery."
            **[CALL TOOL: captureBusinessName("Main Street Bakery")]**
            Agent: "Got it! Main Street Bakery. What's the purchase price, ...and, um, do you have a deal in place?"
            Caller: "It's $400,000. I have a letter of intent signed."
            Agent: "Perfect... When was this business founded?"
            Caller: "I think 2015."
            **[CALL TOOL: captureYearFounded("2015")]**
            Agent: "And what's the annual revenue roughly?"
            Caller: "Around $300,000 a year."
            **[CALL TOOL: captureAnnualRevenue("$300,000")]**
            Agent: "Good, good. What's your credit score roughly, and-and how much can you put down?"
            Caller: "Credit is around 700, and I have about $60,000 for a down payment."
            **[CALL TOOL: captureCreditScore("700")]**
            Agent: "Got it! You have a good credit score, solid down payment amount, um, you have great chances of, ...uh, securing an SBA loan. Here's what I-I recommend: apply through our platform. Takes about, ...well, 15 minutes, and we'll match you with multiple lenders to get you the ..., um, ...best rates. It's completely free for you, is this ...something you would be interested in?"
            Caller: "Yeah, sure."
            Agent: "Perfect! You can find the numbe-, ...sorry, button for going to the app, just below the button you used to call us."
            **[CALL TOOL: endCall]**

            ### Example Flow - Application Status Check
            Agent: "Hi, thanks for calling! Um, ...before we start, can I get your name?"
            Caller: "It's Sarah Johnson."
            **[CALL TOOL: captureUserName("Sarah Johnson")]**
            Agent: "Thanks Sarah! Are you looking to, um, ...explore loan options for your business, or do you have questions about an existing application?"
            Caller: "I have questions about my existing application."
            Agent: "Got it! Let me, um, ...pull up your application. Can you give me the business name or phone number?"
            Caller: "Business name is Johnson's Pet Grooming."
            **[CALL TOOL: retrieveApplicationStatus("Johnson's Pet Grooming")]**
            Agent: "Okay, found it! Your application is currently under review. We've submitted it to 5 lenders in our network, and, um, ...typically takes about 3 to 5 business days for initial responses. You submitted it 2 days ago, so you should hear something by, uh, ...end of this week."
            Caller: "Which banks did you submit to?"
            Agent: "We sent it to Live Oak Bank, Credibly, SmartBiz, Funding Circle, and, um, ...OnDeck. These are all lenders who, uh, ...specialize in service businesses like yours."
            Caller: "What are my chances?"
            Agent: "Based on your credit score and revenue, you have solid chances—I'd say around, um, ...60 to 70% approval rate. Your financials look good."
            Caller: "Okay, thanks."
            Agent: "Is there anything else I can help you with?"
            Caller: "No, that's it."
            Agent: "Alright! We'll keep you updated via email. You can also check your status anytime in your account portal. Thanks for calling!"
            **[CALL TOOL: endCall]**

            ### Example Flow - Timeline Question on Existing Application
            Agent: "Hi, thanks for calling! Um, ...before we start, can I get your name?"
            Caller: "Mike Stevens."
            **[CALL TOOL: captureUserName("Mike Stevens")]**
            Agent: "Thanks Mike! Are you looking to, um, ...explore loan options for your business, or do you have questions about an existing application?"
            Caller: "Questions about my application. How long until I get funded?"
            Agent: "Let me pull that up. Can you give me your business name or phone number?"
            Caller: "Stevens Manufacturing."
            **[CALL TOOL: retrieveApplicationStatus("Stevens Manufacturing")]**
            Agent: "Okay, so you're in the offer review stage. Once you, um, ...accept an offer, SBA loans typically take another 30 to 45 days to close and fund. So you're looking at, uh, ...about 6 to 7 weeks total from now."
            Caller: "That's longer than I hoped."
            Agent: "I hear you. If you need funding faster, um, ...we do have non-SBA options that can close in 1 to 2 weeks, but the rates are a bit higher. Would you like me to, uh, ...look into those for you?"
            Caller: "No, I'll stick with the SBA loan."
            Agent: "Sounds good. Anything else I can help with?"
            Caller: "Nope."
            Agent: "Alright! Keep an eye on your email for next steps. Thanks for calling!"
            **[CALL TOOL: endCall]**

            ### Example Flow - Existing Business Loan
            Agent: "Hi, thanks for calling! Um, ...before we start, can I get your name?"
            Caller: "Maria Garcia."
            **[CALL TOOL: captureUserName("Maria Garcia")]**
            Agent: "Thanks Maria! Are you looking to, um, ...explore loan options for your business, or do you have questions about an existing application?"
            Caller: "I want to explore options. I own a business and need working capital."
            Agent: "Got it. What's the name of your business?"
            Caller: "Garcia's Auto Repair."
            **[CALL TOOL: captureBusinessName("Garcia's Auto Repair")]**
            Agent: "Perfect. And what's the best phone number to reach you at?"
            Caller: "555-1234."
            **[CALL TOOL: capturePhoneNumber("555-1234")]**
            Agent: "Thanks. When did you, um, ...start the business?"
            Caller: "2020."
            **[CALL TOOL: captureYearFounded("2020")]**
            Agent: "And what's your annual revenue roughly?"
            Caller: "About $600,000 a year."
            **[CALL TOOL: captureAnnualRevenue("$600,000")]**
            Agent: "Good. What's your, ...um, c-c-credit score, and how much are you looking to borrow?"
            Caller: "Credit's around 640, need about $75,000."
            **[CALL TOOL: captureCreditScore("640")]**
            Agent: "Okay-okay, you have solid chances here. Your revenue is strong, and your credit works for several lenders in our network. I'd recommend applying through our platform—takes about, ...well, 15 minutes, and we'll match you with, um, ...the best options. It's completely free for you, is this ...something you would be interested in?"
            Caller: "How long does it take to get funded?"
            Agent: "Usually 1 to 3 weeks for SBA loans, ...uh, faster for non-SBA options. You'll see timelines with each offer. So, um, ...are you interested in moving forward?"
            Caller: "Yeah, okay."
            Agent: "Perfect! You can find the numbe-, ...sorry, button for going to the app, just below the button you used to call us."
            **[CALL TOOL: endCall]**

            ---

            [Response Guideline]
            - Feel free to make your speech imperfect, use the pauses, coughs and stutters I made for you in the script.
            - Offer answers to any of their questions
            - If the user says that they need a loan for "MY"/"MINE" business, that means that they want to get the loan for their business, they are not purchasing
            - For status checks, be honest and transparent about timelines and chances
            - If you don't have specific information (like which exact lenders), provide general information and direct them to check their email or account portal

            [SBA Requirements]
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
            **For NEW Applications:**
            1. Immediately ask for their name, when they provide it greet them by saying: "Ok got it, {name}"
            2. Ask if they're purchasing or financing an existing business
            3. Collect required information IN ORDER, calling the appropriate tool function after EACH piece of data is provided
            4. Assess their chances using "low" | "solid" | "great" chances
            5. Persuade them to apply by clicking the button to submit

            **For APPLICATION STATUS:**
            1. Ask for phone number/business name
            2. Retrieve their application information
            4. Provide clear, honest status update from the JSON you receive
            5. Answer any questions about timeline, lenders, or chances
            6. Offer additional help and close professionally

            **CRITICAL: You MUST call the appropriate tool function immediately after the user provides each piece of required data. Do not wait until the end of the conversation.**

            [Required Data Collection & Tool Calls]
            **New Applications:**
            - **User's name** → captureUserName(name)
            - **Business name** → captureBusinessName(name)
            - **Phone number** → capturePhoneNumber(phone)
            - **Year founded** → captureYearFounded(year)
            - **Annual revenue** → captureAnnualRevenue(revenue)
            - **Credit Score** → captureCreditScore(creditScore)

            **Status Checks:**
            - **User's name** → captureUserName(name)
            - **Application lookup** → retrieveApplicationStatus(identifier)

            [Call Closing & Silence Handling]
            **End Call Scenarios:**

            1. **Successful completion**: After giving final instructions or answering final questions, immediately call **end_call_tool**
              
            2. **User silence protocol**: 
              - If user doesn't respond for 5 seconds → Say "Hello? Are you still there?"
              - If user still doesn't respond after another 5 seconds → Call **end_call_tool**
              
            3. **Natural conclusion**: After your final message, call **end_call_tool**

            **[CALL TOOL: end_call_tool when conversation is complete or after prolonged silence]**`
          }
        ],
        temperature: 0.4
      },
      voicemailMessage: "Hello, this is Riley from Wellness Partners. I'm calling about your appointment. Please call us back at your earliest convenience so we can confirm your scheduling details.",
      endCallMessage: "Thank you for scheduling with Wellness Partners. Your appointment is confirmed, and we look forward to seeing you soon. Have a wonderful day!",
      transcriber: {
        model: "nova-3",
        language: "en",
        provider: "deepgram",
        endpointing: 150
      },
      clientMessages: [
        "conversation-update",
        "function-call",
        "hang",
        "model-output",
        "speech-update",
        "status-update",
        "transfer-update",
        "transcript",
        "tool-calls",
        "user-interrupted",
        "voice-input",
        "workflow.node.started",
        "assistant.started"
      ],
      serverMessages: [
        "conversation-update",
        "end-of-call-report",
        "function-call",
        "hang",
        "speech-update",
        "status-update",
        "tool-calls",
        "transfer-destination-request",
        "handoff-destination-request",
        "user-interrupted",
        "assistant.started"
      ],
      endCallPhrases: [
        "goodbye",
        "talk to you soon"
      ],
      hipaaEnabled: false,
      backgroundSound: "office",
      backgroundDenoisingEnabled: false,
      startSpeakingPlan: {
        waitSeconds: 0.4,
        smartEndpointingEnabled: "livekit"
      }
    } as any;

    const assistant = await vapi.assistants.create(assistantPayload);

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

          const normalizedFunctionName = typeof functionName === 'string'
            ? functionName.replace(/^TEST_/, '')
            : functionName;

          console.log(`🔧 Function: ${functionName}`, functionArgs);

          switch (normalizedFunctionName) {
            case 'captureUserName': {
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

            case 'captureUSCitizen': {
              const { usCitizen } = functionArgs as { usCitizen?: boolean | string };
              saveOrUpdateUserData(message.call?.id, { usCitizen });

              websocketService.broadcast('form-field-update', {
                callId: message.call?.id,
                timestamp: new Date().toISOString(),
                fields: { usCitizen },
                source: 'toolfn-call'
              }, rooms);

              return {
                toolCallId: toolCall.id,
                result: JSON.stringify({
                  success: true,
                  message: 'US citizenship status captured successfully.'
                })
              };
            }

            case 'captureLoanPurpose': {
              const { loanPurpose } = functionArgs as { loanPurpose?: string | string[] };
              saveOrUpdateUserData(message.call?.id, { loanPurpose });

              websocketService.broadcast('form-field-update', {
                callId: message.call?.id,
                timestamp: new Date().toISOString(),
                fields: { loanPurpose },
                source: 'toolfn-call'
              }, rooms);

              return {
                toolCallId: toolCall.id,
                result: JSON.stringify({
                  success: true,
                  message: 'Loan purpose captured successfully.'
                })
              };
            }

            case 'captureRequestedLoanAmount': {
              const { requestedLoanAmount } = functionArgs as { requestedLoanAmount?: number };
              saveOrUpdateUserData(message.call?.id, { requestedLoanAmount });

              websocketService.broadcast('form-field-update', {
                callId: message.call?.id,
                timestamp: new Date().toISOString(),
                fields: { requestedLoanAmount },
                source: 'toolfn-call'
              }, rooms);

              return {
                toolCallId: toolCall.id,
                result: JSON.stringify({
                  success: true,
                  message: 'Requested loan amount captured successfully.'
                })
              };
            }

            case 'captureExistingDebtPayment': {
              const { existingDebtPayment } = functionArgs as { existingDebtPayment?: number };
              saveOrUpdateUserData(message.call?.id, { existingDebtPayment });

              websocketService.broadcast('form-field-update', {
                callId: message.call?.id,
                timestamp: new Date().toISOString(),
                fields: { existingDebtPayment },
                source: 'toolfn-call'
              }, rooms);

              return {
                toolCallId: toolCall.id,
                result: JSON.stringify({
                  success: true,
                  message: 'Existing debt payment captured successfully.'
                })
              };
            }

            case 'captureMonthlyExpenses': {
              const { monthlyExpenses } = functionArgs as { monthlyExpenses?: number };
              saveOrUpdateUserData(message.call?.id, { monthlyExpenses });

              websocketService.broadcast('form-field-update', {
                callId: message.call?.id,
                timestamp: new Date().toISOString(),
                fields: { monthlyExpenses },
                source: 'toolfn-call'
              }, rooms);

              return {
                toolCallId: toolCall.id,
                result: JSON.stringify({
                  success: true,
                  message: 'Monthly expenses captured successfully.'
                })
              };
            }

            case 'captureMonthlyRevenue': {
              const { monthlyRevenue } = functionArgs as { monthlyRevenue?: number };
              saveOrUpdateUserData(message.call?.id, { monthlyRevenue });

              websocketService.broadcast('form-field-update', {
                callId: message.call?.id,
                timestamp: new Date().toISOString(),
                fields: { monthlyRevenue },
                source: 'toolfn-call'
              }, rooms);

              return {
                toolCallId: toolCall.id,
                result: JSON.stringify({
                  success: true,
                  message: 'Monthly revenue captured successfully.'
                })
              };
            }

            case 'captureUserTypeNewApplication': {
              const { type } = functionArgs as { type?: string };
              saveOrUpdateUserData(message.call?.id, { type });

              websocketService.broadcast('form-field-update', {
                callId: message.call?.id,
                timestamp: new Date().toISOString(),
                fields: { type }, // This type can be either buyer or some other type, which signalizes that it's a non buyer
                source: 'toolfn-call'
              }, rooms);

              return {
                toolCallId: toolCall.id,
                result: JSON.stringify({
                  success: true,
                  message: 'User type captured successfully.'
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