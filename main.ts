import express from 'express';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import * as dotenv from 'dotenv';
import cors from 'cors';
import docsRouter from './src/routes/docs.js';
import emailRouter from './src/routes/emails.js';
import pollEmails from './src/services/poller.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Agent routes
app.use('/api/docs', docsRouter);
app.use('/api/emails', emailRouter);

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
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`💬 Chat endpoint: http://localhost:${PORT}/api/chat`);
});

export default app;