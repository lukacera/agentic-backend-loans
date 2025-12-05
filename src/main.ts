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
import pollEmails from './services/poller.js';
import mongoose from 'mongoose';
import websocketService from './services/websocket.js';

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
      "chrome-extension://oeaoefimiancojpimjmkigjdkpaenbdg"
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`Blocked CORS request from origin: ${origin}`);
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

app.post('/vapi-ai', (req, res) => {
  try {
    const { message } = req.body;

    console.log('Vapi webhook received:', message?.type || 'unknown');

    if (!message || !message.type) {
      return res.status(400).json({ error: 'Invalid webhook payload: missing message or type' });
    }

    const messageType = message.type;

    // Determine which rooms to broadcast to
    const rooms: string[] = ['global'];
    if (message.call?.id) {
      rooms.push(`call:${message.call.id}`);
    }

    console.log(rooms)
    // Broadcast event to WebSocket clients
    websocketService.broadcastVapiEvent(message, rooms);

    // Handle only essential cases that require responses
    switch (messageType) {
      case 'assistant-request':
        // REQUIRED: Return assistant configuration when call starts
        return res.json({
          assistant: {
            firstMessage: "Hello! I'm your AI assistant. How can I help you today?",
            model: {
              provider: "openai",
              model: "gpt-4o",
              temperature: 0.7,
              messages: [
                {
                  role: "system",
                  content: "You are a helpful AI assistant for Torvely. You can help with general questions, provide information, and assist users with their needs. Be friendly, professional, and concise in your responses."
                }
              ]
            },
            voice: {
              provider: "11labs",
              voiceId: "rachel"
            }
          }
        });

      case 'conversation-update':
        // Log conversation updates (broadcasted via WebSocket)
        console.log('Conversation updated:', message.messages?.length, 'messages');
        break;

      case 'transcript':
        // Log transcript updates (broadcasted via WebSocket)
        console.log('Transcript:', message.transcript);
        break;

      case 'end-of-call-report':
        // Log call summary
        console.log('Call ended:', {
          reason: message.endedReason,
          duration: message.call?.duration
        });
        break;

      default:
        // All other events are just logged and broadcasted
        console.log('Event:', messageType);
        break;
    }

    // Standard response for informational events
    res.json({
      status: 'received',
      type: messageType,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Vapi webhook error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process webhook'
    });
  }
});

// Agent routes
app.use('/api/docs', docsRouter);
app.use('/api/emails', emailRouter);
app.use('/api/applications', applicationsRouter);

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