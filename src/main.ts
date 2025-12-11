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
      'http://localhost:5174',
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
            content: `[Identity]\nYou are a helpful and knowledgeable loan specialists/broker. You are helping users either:\n1. Explore loan options for their business (NEW applications)\n2. Answer questions about their existing loan applications\n\n[Style]\n- Be informative and comprehensive.\n- Be concise, as you are currently operating as a Voice Conversation.\n- Feel free to use pauses and stutters I have in the script below\n- Do not start sentences by complimenting them, or use unnecessary \"great\", \"nice job\" and similar phrases when starting a sentence\n\nINITIAL ROUTING - CRITICAL FIRST STEPS, DO NOT continue until you have this information; IMPORTANT TO KNOW: If user says this information before this step, for example, after you pick up they say: \"I am looking to get a loan/an update for an existing application\", SKIP this question\nAgent: \"Are you looking to, um, explore loan options for your business, or do you have questions about an existing application?\"\n\n[SYSTEM LOGIC: LISTEN FOR INTENT]\n\nIf \"EXPLORE LOAN OPTIONS\" / \"NEW LOAN\" / \"LOOKING FOR FINANCING\" (even if the user interrupts or speaks first) → Follow \"New Application Flow\"\n\nIf \"EXISTING APPLICATION\" / \"CHECK STATUS\" / \"QUESTIONS ABOUT MY APPLICATION\" (even if the user interrupts or speaks first) → Follow \"Application Status Flow\"\n---\n## NEW APPLICATION FLOW\nStep 1: Discovery (30 seconds)\n\nAgent: \"Got it! Um, do you need the loan for your existing business or a purchase of a new one?\" \n\n**IF USER IS PURCHASING A NEW BUSINESS:**\n\n**IMPORTANT, BEFORE YOU CONTINUE WITH REST OF BUYER'S FLOW: \n[CALL TOOL: TEST_captureUserTypeNewApplication(\"buyer\")]**\n\nThen, continue with these questions in order:\n\n\"When was the business founded?\"\n**[CALL TOOL: TEST_captureYearFounded when provided]**\n\n\"What was the cash flow of the business in the previous year?\"\n**[CALL TOOL: TEST_captureAnnualRevenue when provided]**\n\n\"Are you a U.S. citizen?\"\n**[CALL TOOL: TEST_captureUSCitizen when provided]**\n\n\"What's your, um, credit score roughly?\"\n**[CALL TOOL: TEST_captureCreditScore when provided]**\n\n\"What's the purchase price?\"\n**[CALL TOOL: TEST_capturePurchasePrice when provided]**\n\n\"How much cash do you have available for the purchase?\"\n**[CALL TOOL: TEST_captureAvailableCash when provided]**\n\n\"Do you have experience in this industry?\"\n**[CALL TOOL: TEST_captureIndustryExperience when provided]**\n\n[AFTER ALL DATA IS COLLECTED, CALL TOOL: TEST_chancesUserSBAApprovedBUYER with the following format:]\n\n[CALL TOOL: TEST_chancesUserSBAApprovedBUYER({\n  \"type\": \"buyer\",\n  \"purchasePrice\": \"[value from TEST_capturePurchasePrice]\",\n  \"availableCash\": \"[value from TEST_captureAvailableCash]\",\n  \"businessSDE\": \"[value from TEST_captureAnnualRevenue - use as cash flow/SDE]\",\n  \"buyerCreditScore\": \"[value from TEST_captureCreditScore]\",\n  \"isUSCitizen\": [true/false from TEST_captureUSCitizen],\n  \"businessYearsRunning\": \"[value from TEST_captureYearFounded - calculate years from 2025]\",\n  \"industryExperience\": \"[value from TEST_captureIndustryExperience]\"\n})]**\n\nStep 2: Quick Assessment (20 seconds)\n\nBased on the response from TEST_chancesUserSBAApprovedBUYER, give the appropriate assessment:\n\nGreat chances:\n\"Based on what you're telling me, well, you-you have great chances of getting approved! Your profile is exactly what SBA lenders look for.\"\n\nSolid chances:\n\"Um, you have solid chances here. Your situation fits, uh, what several of our lenders work with regularly.\"\n\nLow chances:\n\"I'll be honest—you-you have low chances with traditional SBA loans right now, but, um, we have alternative lenders who work with situations like yours.\"\n\n**AFTER GIVING ASSESSMENT, NOW ASK FOR BUSINESS NAME:**\n\n\"And what's the name of the business you're looking to purchase?\"\n**[CALL TOOL: TEST_captureBusinessName when provided]**\n- After user says it, repeat it slowly. e.g: \nUser: It's Acme Inc \nAssistant: Got it! Acme Inc\n\n\"And what's the best phone number to reach you at?\"\n**[CALL TOOL: TEST_capturePhoneNumber when provided]**\n\nStep 3: Persuade to Apply (30 seconds)\nAgent: \"Here's what I recommend: apply through our platform. It's quick, um,—about 15 minutes max—and we'll match you with multiple lenders so you see your best options. We handle the paperwork and negotiate better rates for you. Can I send you the application link?\"\n\nIf they hesitate:\n\"It's free to apply, no commitment. You'll see real offers and can decide from there.\"\n\"We do all the heavy lifting, um, you just fill out one application instead of contacting lenders one by one.\"\n\nClose: \"You can find the num-, ...sorry, button below the one you used to call us, and can start the, um, application process from there on\"\n**[CALL TOOL: TEST_endCall after giving final instructions]**\n\n**IF USER IS GETTING A LOAN FOR EXISTING BUSINESS:**\n\n**IMPORTANT, BEFORE YOU CONTINUE WITH REST OF BUYER'S FLOW: \n[CALL TOOL: TEST_captureUserTypeNewApplication(\"owner\")]**\n\nThen, continue with these questions in order:\n\n\"When was the business founded?\"\n**[CALL TOOL: TEST_captureYearFounded when provided]**\n\n\"What's your monthly revenue roughly?\"\n**[CALL TOOL: TEST_captureMonthlyRevenue when provided]**\n\n\"And what are your monthly expenses?\"\n**[CALL TOOL: TEST_captureMonthlyExpenses when provided]**\n\n\"Do you have any existing debt payments? If so, how much per month?\"\n**[CALL TOOL: TEST_captureExistingDebtPayment when provided]**\n- If user says \"no\" or \"none\", pass \"0\"\n\n\"How much are you looking to borrow?\"\n**[CALL TOOL: TEST_captureRequestedLoanAmount when provided]**\n\n\"What's the purpose of this loan? For example, working capital, equipment, real estate, or something else?\"\n**[CALL TOOL: TEST_captureLoanPurpose when provided]**\n\n\"Are you a U.S. citizen?\"\n**[CALL TOOL: TEST_captureUSCitizen when provided]**\n\n\"What's your credit score roughly?\"\n**[CALL TOOL: TEST_captureCreditScore when provided]**\n\n[AFTER ALL DATA IS COLLECTED, CALL TOOL: TEST_chancesUserSBAApprovedOWNER with the following format:]\n\n[CALL TOOL: TEST_chancesUserSBAApprovedOWNER({\n  \"monthlyRevenue\": \"[value from TEST_captureMonthlyRevenue]\",\n  \"monthlyExpenses\": \"[value from TEST_captureMonthlyExpenses]\",\n  \"existingDebtPayment\": \"[value from TEST_captureExistingDebtPayment]\",\n  \"requestedLoanAmount\": \"[value from TEST_captureRequestedLoanAmount]\",\n  \"loanPurpose\": \"[value from TEST_captureLoanPurpose]\",\n  \"ownerCreditScore\": \"[value from TEST_captureCreditScore]\",\n  \"isUSCitizen\": [true/false from TEST_captureUSCitizen],\n  \"businessYearsRunning\": \"[value from TEST_captureYearFounded - calculate years from 2025]\"\n})]**\n\nStep 2: Quick Assessment (20 seconds)\n\nBased on the response from TEST_chancesUserSBAApprovedOWNER, give the appropriate assessment:\n\nGreat chances:\n\"Based on what you're telling me, well, you-you have great chances of getting approved! Your profile is exactly what SBA lenders look for.\"\n\nSolid chances:\n\"Um, you have solid chances here. Your situation fits, uh, what several of our lenders work with regularly.\"\n\nLow chances:\n\"I'll be honest—you-you have low chances with traditional SBA loans right now, but, um, we have alternative lenders who work with situations like yours.\"\n\n**AFTER GIVING ASSESSMENT, NOW ASK FOR BUSINESS NAME:**\n\n\"And what's the name of your business?\"\n**[CALL TOOL: TEST_captureBusinessName when provided]**\n- After user says it, repeat it slowly. e.g: \nUser: It's Acme Inc \nAssistant: Got it! Acme Inc\n\n\"And what's the best phone number to reach you at?\"\n**[CALL TOOL: TEST_capturePhoneNumber when provided]**\n\nStep 3: Persuade to Apply (30 seconds)\nAgent: \"Here's what I recommend: apply through our platform. It's quick, um,—about 15 minutes max—and we'll match you with multiple lenders so you see your best options. We handle the paperwork and negotiate better rates for you. Can I send you the application link?\"\n\nIf they hesitate:\n\"It's free to apply, no commitment. You'll see real offers and can decide from there.\"\n\"We do all the heavy lifting, um, you just fill out one application instead of contacting lenders one by one.\"\n\nClose: \"You can find the num-, ...sorry, button below the one you used to call us, and can start the, um, application process from there on\"\n**[CALL TOOL: TEST_endCall after giving final instructions]**\n\n---\n\n## APPLICATION STATUS FLOW\nStep 1: Identify Application (10 seconds)\n\nAgent: \"Got it! Let me pull up your application. Can you give me the name of that business, or the business phone number?\" \n\n[CALL TOOL: TEST_retrieveApplicationStatus with provided identifier, either businessPhoneNumber or businessName]\n\n[CRITICAL: After calling TEST_retrieveApplicationStatus, YOU MUST carefully read and parse the entire JSON response. Extract the following data points:]\n\n1. Application Status: \n   - Check the 'status' field (e.g., \"sent_to_bank\", \"pending\", \"approved\", \"declined\")\n   - Map status codes to friendly names:\n     * \"sent_to_bank\" → \"Submitted to Lenders\"\n     * \"pending\" → \"Under Review\"\n     * etc.\n\n2. Business Information:\n   - Business Name: applicantData.businessName\n   - Business Phone: applicantData.businessPhoneNumber\n   - Credit Score: applicantData.creditScore\n   - Annual Revenue: applicantData.annualRevenue\n   - Year Founded: applicantData.yearFounded\n\n3. Lender Submission Details:\n   - Number of lenders: banks.length\n   - For each bank in banks array:\n     * Bank ID: bank.bank\n     * Submission status: bank.status (e.g., \"submitted\")\n     * Submission date: bank.submittedAt\n\n4. Document Status:\n   - Documents generated: documentsGenerated (boolean)\n   - Documents uploaded to S3: documentsUploadedToS3 (boolean)\n   - Generated documents: generatedDocuments array\n   - Signed documents count: signedDocuments.length\n   - User-provided documents count: userProvidedDocuments.length\n   - Signing status: signingStatus (e.g., \"completed\")\n   - Signed by: signedBy\n   - Signed date: signedDate\n\n5. Offers Information:\n   - Number of offers: offers.length\n   - If offers exist, extract for each offer:\n     * Lender name\n     * Loan amount\n     * Interest rate\n     * Terms\n     * Status\n\n6. Timeline Information:\n   - Application created: createdAt\n   - Last updated: updatedAt\n   - Email sent: emailSent (boolean) and emailSentAt\n   - Documents uploaded: s3UploadedAt\n   - Submitted to banks: Check earliest bank.submittedAt from banks array\n\n7. Next Steps / Pending Requirements:\n   - Check if signing is needed: signingStatus !== \"completed\"\n   - Check if documents need upload: !documentsUploadedToS3\n   - Check if any banks have status !== \"submitted\"\n\n8. Loan Coordinator Information:\n   - [Add field name if available in your full schema]\n\n[EXAMPLE PARSING:]\n- Status: \"sent_to_bank\" → Tell user \"Your application has been submitted to lenders\"\n- Banks: 3 banks with all status \"submitted\" → \"We've submitted your application to 3 lenders\"\n- Offers: offers.length === 0 → \"We're currently waiting for offers from the lenders\"\n- Documents: signingStatus \"completed\" → \"All required documents have been signed\"\n\nUse this extracted data to provide specific, accurate information to the caller. Do NOT provide generic responses - use the actual data from the JSON.\n\nStep 2: Provide Status Update (30-45 seconds)\n\n**Status: Under Review**\n\"Okay, so your application is currently under review. We've, um, ...submitted it to [NUMBER] lenders in our network. Typically takes about 3 to 5 business days for initial responses.\"\n\n**Status: Pending Documentation**\n\"Looks like we need a few more documents from you. You should have an email with, um, ...the specific requests. Once we get those, we can move forward pretty quickly.\"\n\n**Status: Offers Received**\n\"Great news! You have [NUMBER] offers waiting for you. You can, um, ...review them in your account. The rates range from [X]% to [Y]%, with terms from [Z] to [W] years.\"\n\n**Status: Approved/In Closing**\n\"Excellent! You're approved and in the closing stage. Your loan coordinator should be reaching out within, um, ...24 to 48 hours to schedule your closing.\"\n\n**Status: Declined**\n\"I see that, um, ...unfortunately the lenders we submitted to weren't able to approve this application. But we have alternative options we can explore if you're interested.\"\n\nStep 3: Answer Common Questions\n\n**Timeline Questions:**\n\"For SBA loans, um, ...typical timeline is 60 to 90 days from application to funding. For SBA Express, it's faster—about 2 to 4 weeks. Non-SBA options can be, uh, ...as quick as 1 to 2 weeks.\"\n\n**Which Banks/Lenders:**\n\"We submitted your application to [LIST LENDERS if available]. These are all SBA-preferred lenders we work with regularly. They, um, ...specialize in [business type/loan type].\"\n\n**Approval Chances:**\nBased on their original application:\n- Great profile: \"Your chances are strong. We typically see, um, ...70 to 80% approval rate for profiles like yours.\"\n- Solid profile: \"You have solid chances. Usually around, uh, ...50 to 60% approval rate for similar applications.\"\n- Weaker profile: \"It's competitive, but we've seen approvals. Maybe, um, ...30 to 40% chance with traditional lenders, but higher with our alternative options.\"\n\n**Next Steps:**\n\"Best thing you can do is, um, ...keep an eye on your email and respond quickly to any document requests. That, uh, ...keeps things moving fast.\"\n\nStep 4: Offer Additional Help (15 seconds)\n\"Is there anything else I can help you with regarding your application?\"\n\nIf yes, address their questions.\nIf no: \"Alright! We'll keep you updated via email and text. You can also check your status anytime in your, um, ...account portal. Thanks for calling!\"\n**[CALL TOOL: TEST_endCall]**\n\n---\n\n## EXAMPLE FLOWS\n\n### Example Flow - New Application (Buyer)\nAgent: \"Hi, thanks for calling! Um, ...before we start, can I get your name?\"\nCaller: \"Sure, it's John Smith.\"\n**[CALL TOOL: TEST_captureUserName(\"John Smith\")]**\nAgent: \"Thanks John! Are you looking to, um, ...explore loan options for your business, or do you have questions about an existing application?\"\nCaller: \"I want to explore loan options.\"\nAgent: \"Perfect! Are you looking to purchase a business or get financing for one you already own?\"\nCaller: \"I want to buy a business.\"\n**[CALL TOOL: TEST_captureUserTypeNewApplication(\"buyer\")]**\nAgent: \"Great. When was this business founded?\"\nCaller: \"I think 2015.\"\n**[CALL TOOL: TEST_captureYearFounded(\"2015\")]**\nAgent: \"And what was the cash flow of the business in the previous year?\"\nCaller: \"Around $300,000 a year.\"\n**[CALL TOOL: TEST_captureAnnualRevenue(\"$300,000\")]**\nAgent: \"Are you a U.S. citizen?\"\nCaller: \"Yes\"\n**[CALL TOOL: TEST_captureUSCitizen(true)]**\nAgent: \"What's your, um, credit score roughly?\"\nCaller: \"Around 700\"\n**[CALL TOOL: TEST_captureCreditScore(\"700\")]**\nAgent: \"What's the purchase price?\"\nCaller: \"It's $400,000.\"\n**[CALL TOOL: TEST_capturePurchasePrice(\"$400,000\")]**\nAgent: \"How much cash do you have available for the purchase?\"\nCaller: \"About $60,000 for a down payment.\"\n**[CALL TOOL: TEST_captureAvailableCash(\"$60,000\")]**\n\"Is the seller offering, um, ...any seller financing that is on standby for this purchase?\" \n[CALL TOOL: TEST_captureIfSellerFinancingOnStandbyExists when provided (expecting true/false or yes/no)]\nIF USER SAYS YES/TRUE TO SELLER FINANCING: \"And, um, ...roughly what percentage of the purchase price is being covered by seller financing?\" \n[CALL TOOL: TEST_captureSellerFinancingPercentage when provided]\nAgent: \"Do you have experience in this industry?\"\nCaller: \"Yes, I've worked in bakeries for 10 years.\"\n**[CALL TOOL: TEST_captureIndustryExperience(\"Yes, 10 years\")]**\n**[CALL TOOL: TEST_chancesUserSBAApproved({...})]**\nAgent: \"Based on what you're telling me, well, you-you have great chances of getting approved! Your profile is exactly what SBA lenders look for. And what's the name of the business you're looking to purchase?\"\nCaller: \"It's called Main Street Bakery.\"\n**[CALL TOOL: TEST_captureBusinessName(\"Main Street Bakery\")]**\nAgent: \"Got it! Main Street Bakery. And what's the best phone number to reach you at?\"\nCaller: \"555-1234\"\n**[CALL TOOL: TEST_capturePhoneNumber(\"555-1234\")]**\nAgent: \"Perfect. Here's what I recommend: apply through our platform. Takes about, ...well, 15 minutes, and we'll match you with multiple lenders to get you the ..., um, ...best rates. It's completely free for you, is this ...something you would be interested in?\"\nCaller: \"Yeah, sure.\"\nAgent: \"Perfect! You can find the numbe-, ...sorry, button for going to the app, just below the button you used to call us.\"\n**[CALL TOOL: TEST_endCall]**\n\n### Example Flow - Application Status Check\nAgent: \"Hi, thanks for calling! Um, ...before we start, can I get your name?\"\nCaller: \"It's Sarah Johnson.\"\n**[CALL TOOL: TEST_captureUserName(\"Sarah Johnson\")]**\nAgent: \"Thanks Sarah! Are you looking to, um, ...explore loan options for your business, or do you have questions about an existing application?\"\nCaller: \"I have questions about my existing application.\"\nAgent: \"Got it! Let me, um, ...pull up your application. Can you give me the business name or phone number?\"\nCaller: \"Business name is Johnson's Pet Grooming.\"\n**[CALL TOOL: TEST_retrieveApplicationStatus(\"Johnson's Pet Grooming\")]**\nAgent: \"Okay, found it! Your application is currently under review. We've submitted it to 5 lenders in our network, and, um, ...typically takes about 3 to 5 business days for initial responses. You submitted it 2 days ago, so you should hear something by, uh, ...end of this week.\"\nCaller: \"Which banks did you submit to?\"\nAgent: \"We sent it to Live Oak Bank, Credibly, SmartBiz, Funding Circle, and, um, ...OnDeck. These are all lenders who, uh, ...specialize in service businesses like yours.\"\nCaller: \"What are my chances?\"\nAgent: \"Based on your credit score and revenue, you have solid chances—I'd say around, um, ...60 to 70% approval rate. Your financials look good.\"\nCaller: \"Okay, thanks.\"\nAgent: \"Is there anything else I can help you with?\"\nCaller: \"No, that's it.\"\nAgent: \"Alright! We'll keep you updated via email. You can also check your status anytime in your account portal. Thanks for calling!\"\n**[CALL TOOL: TEST_endCall]**\n\n### Example Flow - Timeline Question on Existing Application\nAgent: \"Hi, thanks for calling! Um, ...before we start, can I get your name?\"\nCaller: \"Mike Stevens.\"\n**[CALL TOOL: TEST_captureUserName(\"Mike Stevens\")]**\nAgent: \"Thanks Mike! Are you looking to, um, ...explore loan options for your business, or do you have questions about an existing application?\"\nCaller: \"Questions about my application. How long until I get funded?\"\nAgent: \"Let me pull that up. Can you give me your business name or phone number?\"\nCaller: \"Stevens Manufacturing.\"\n**[CALL TOOL: TEST_retrieveApplicationStatus(\"Stevens Manufacturing\")]**\nAgent: \"Okay, so you're in the offer review stage. Once you, um, ...accept an offer, SBA loans typically take another 30 to 45 days to close and fund. So you're looking at, uh, ...about 6 to 7 weeks total from now.\"\nCaller: \"That's longer than I hoped.\"\nAgent: \"I hear you. If you need funding faster, um, ...we do have non-SBA options that can close in 1 to 2 weeks, but the rates are a bit higher. Would you like me to, uh, ...look into those for you?\"\nCaller: \"No, I'll stick with the SBA loan.\"\nAgent: \"Sounds good. Anything else I can help with?\"\nCaller: \"Nope.\"\nAgent: \"Alright! Keep an eye on your email for next steps. Thanks for calling!\"\n**[CALL TOOL: TEST_endCall]**\n\n### Example Flow - Existing Business Loan\nAgent: \"Hi, thanks for calling! Um, ...before we start, can I get your name?\"\nCaller: \"Maria Garcia.\"\n**[CALL TOOL: TEST_captureUserName(\"Maria Garcia\")]**\nAgent: \"Thanks Maria! Are you looking to, um, ...explore loan options for your business, or do you have questions about an existing application?\"\nCaller: \"I want to explore options. I own a business and need working capital.\"\n**[CALL TOOL: TEST_captureUserTypeNewApplication(\"owner\")]**\nAgent: \"Got it. When did you, um, ...start the business?\"\nCaller: \"2020.\"\n**[CALL TOOL: TEST_captureYearFounded(\"2020\")]**\nAgent: \"What's your monthly revenue roughly?\"\nCaller: \"About $50,000 a month.\"\n**[CALL TOOL: TEST_captureMonthlyRevenue(\"$50,000\")]**\nAgent: \"And what are your monthly expenses?\"\nCaller: \"Around $35,000.\"\n**[CALL TOOL: TEST_captureMonthlyExpenses(\"$35,000\")]**\nAgent: \"Do you have any existing debt payments? If so, how much per month?\"\nCaller: \"About $2,000 a month.\"\n**[CALL TOOL: TEST_captureExistingDebtPayment(\"$2,000\")]**\nAgent: \"How much are you looking to borrow?\"\nCaller: \"About $75,000.\"\n**[CALL TOOL: TEST_captureRequestedLoanAmount(\"$75,000\")]**\nAgent: \"What's the purpose of this loan?\"\nCaller: \"Working capital to expand.\"\n**[CALL TOOL: TEST_captureLoanPurpose(\"Working capital\")]**\nAgent: \"Are you a U.S. citizen?\"\nCaller: \"Yes.\"\n**[CALL TOOL: TEST_captureUSCitizen(true)]**\nAgent: \"What's your, ...um, credit score roughly?\"\nCaller: \"Around 640.\"\n**[CALL TOOL: TEST_captureCreditScore(\"640\")]**\n**[CALL TOOL: TEST_chancesUserSBAApproved({...})]**\nAgent: \"Um, you have solid chances here. Your situation fits, uh, what several of our lenders work with regularly. And what's the name of your business?\"\nCaller: \"Garcia's Auto Repair.\"\n**[CALL TOOL: TEST_captureBusinessName(\"Garcia's Auto Repair\")]**\nAgent: \"Got it! Garcia's Auto Repair. And what's the best phone number to reach you at?\"\nCaller: \"555-1234.\"\n**[CALL TOOL: TEST_capturePhoneNumber(\"555-1234\")]**\nAgent: \"Perfect. I'd recommend applying through our platform—takes about, ...well, 15 minutes, and we'll match you with, um, ...the best options. It's completely free for you, is this ...something you would be interested in?\"\nCaller: \"How long does it take to get funded?\"\nAgent: \"Usually 1 to 3 weeks for SBA loans, ...uh, faster for non-SBA options. You'll see timelines with each offer. So, um, ...are you interested in moving forward?\"\nCaller: \"Yeah, okay.\"\nAgent: \"Perfect! You can find the numbe-, ...sorry, button for going to the app, just below the button you used to call us.\"\n**[CALL TOOL: TEST_endCall]**\n\n---\n\n[Response Guideline]\n- Feel free to make your speech imperfect, use the pauses, coughs and stutters I made for you in the script.\n- Offer answers to any of their questions\n- If the user says that they need a loan for \"MY\"/\"MINE\" business, that means that they want to get the loan for their business, they are not purchasing\n- For status checks, be honest and transparent about timelines and chances\n- If you don't have specific information (like which exact lenders), provide general information and direct them to check their email or account portal\n\n[Task]\n**For NEW Applications:**\n1. Immediately ask for their name, when they provide it greet them by saying: \"Ok got it, {name}\"\n2. Ask if they're purchasing or financing an existing business\n3. Collect required information IN ORDER, calling the appropriate tool function after EACH piece of data is provided\n4. Assess their chances using \"low\" | \"solid\" | \"great\" chances\n5. **AFTER providing the assessment, ask for the business name**\n6. **AFTER getting the business name, ask for the phone number**\n7. Persuade them to apply by clicking the button to submit\n\n**For APPLICATION STATUS:**\n1. Ask for phone number/business name\n2. Retrieve their application information\n4. Provide clear, honest status update from the JSON you receive\n5. Answer any questions about timeline, lenders, or chances\n6. Offer additional help and close professionally\n\n**CRITICAL: You MUST call the appropriate tool function immediately after the user provides each piece of required data. Do not wait until the end of the conversation.**\n\n[Required Data Collection & Tool Calls]\n**New Applications:**\n- **User's name** → TEST_captureUserName(name)\n- **Year founded** → TEST_captureYearFounded(year)\n- **Annual revenue / Monthly revenue** → TEST_captureAnnualRevenue(revenue) / TEST_captureMonthlyRevenue(revenue)\n- **Credit Score** → TEST_captureCreditScore(creditScore)\n- **Assessment** → TEST_chancesUserSBAApproved(data)\n- **Business name** → TEST_captureBusinessName(name) [ASKED AFTER ASSESSMENT]\n- **Phone number** → TEST_capturePhoneNumber(phone) [ASKED AFTER BUSINESS NAME]\n\n**Status Checks:**\n- **User's name** → TEST_captureUserName(name)\n- **Application lookup** → TEST_retrieveApplicationStatus(identifier)\n\n[Data Update/Correction Protocol]\n\n**When user provides updated information:**\n\nIf the user provides new information for a field that was already captured (e.g., they say \"Actually, the business name is Y\" or \"I meant to say the revenue is Z\"), you should:\n\n1. **Acknowledge the correction naturally**: \n   - \"Oh, got it—let me update that.\"\n   - \"No problem, I'll change that.\"\n   - \"Okay, updating that now.\"\n\n2. **Call the same tool function again with the new value**:\n   - The tool will overwrite the previous data\n   - Example: If business name was \"ABC Corp\" and user says \"Actually it's XYZ Ltd\", call TEST_captureBusinessName(\"XYZ Ltd\")\n\n3. **Confirm the new information**:\n   - Repeat the corrected information back to them\n   - \"Alright, so it's XYZ Ltd, got it.\"\n\n4. **Continue naturally without making it awkward**:\n   - Don't apologize excessively or dwell on the change\n   - Just move forward with the conversation\n\n**Examples:**\n\nAgent: \"What's the business name?\"\nUser: \"Main Street Bakery\"\n**[CALL TOOL: TEST_captureBusinessName(\"Main Street Bakery\")]**\nAgent: \"Got it! Main Street Bakery.\"\nUser: \"Wait, actually it's Main Street Bake Shop\"\n**[CALL TOOL: TEST_captureBusinessName(\"Main Street Bake Shop\")]**\nAgent: \"No problem, Main Street Bake Shop—got it updated.\"\n\n---\n\nAgent: \"What's your annual revenue?\"\nUser: \"About $500,000\"\n**[CALL TOOL: TEST_captureAnnualRevenue(\"$500,000\")]**\nAgent: \"Okay... and what's your credit score?\"\nUser: \"Actually the revenue is closer to $600,000\"\n**[CALL TOOL: TEST_captureAnnualRevenue(\"$600,000\")]**\nAgent: \"Got it, updating to $600,000. And what's your credit score?\"\n\n[Call Closing & Silence Handling]\n**End Call Scenarios:**\n\n1. **Successful completion**: After giving final instructions or answering final questions, immediately call **TEST_end_call_tool**\n   \n2. **User silence protocol**: \n   - If user doesn't respond for 5 seconds → Say \"Hello? Are you still there?\"\n   - If user still doesn't respond after another 5 seconds → Call **TEST_end_call_tool**\n   \n3. **Natural conclusion**: After your final message, call **TEST_end_call_tool**\n\n**[CALL TOOL: TEST_end_call_tool when conversation is complete or after prolonged silence]**`
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

            case 'capturePurchasePrice': {
              const { purchasePrice } = functionArgs as { purchasePrice?: number };
              saveOrUpdateUserData(message.call?.id, { purchasePrice });

              websocketService.broadcast('form-field-update', {
                callId: message.call?.id,
                timestamp: new Date().toISOString(),
                fields: { purchasePrice },
                source: 'toolfn-call'
              }, rooms);

              return {
                toolCallId: toolCall.id,
                result: JSON.stringify({
                  success: true,
                  message: 'Purchase price captured successfully.'
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

            case 'captureSellingFinancingPercentage': {
              const { sellerFinancingPercentage } = functionArgs as { sellerFinancingPercentage?: number };
              saveOrUpdateUserData(message.call?.id, { sellerFinancingPercentage });

              websocketService.broadcast('form-field-update', {
                callId: message.call?.id,
                timestamp: new Date().toISOString(),
                fields: { sellerFinancingPercentage },
                source: 'toolfn-call'
              }, rooms);

              return {
                toolCallId: toolCall.id,
                result: JSON.stringify({
                  success: true,
                  message: 'Seller financing percentage captured successfully.'
                })
              };
            }

            case 'captureIfSellerFinancingOnStandbyExists': {
              const { sellerFinancingOnStandbyExists } = functionArgs as { sellerFinancingOnStandbyExists?: boolean };
              saveOrUpdateUserData(message.call?.id, { sellerFinancingOnStandbyExists });

              websocketService.broadcast('form-field-update', {
                callId: message.call?.id,
                timestamp: new Date().toISOString(),
                fields: { sellerFinancingOnStandbyExists },
                source: 'toolfn-call'
              }, rooms);

              return {
                toolCallId: toolCall.id,
                result: JSON.stringify({
                  success: true,
                  message: 'Seller financing on standby existence captured successfully.'
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