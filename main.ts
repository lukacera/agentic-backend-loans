import express from 'express';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize the LangChain agent
class AIAgent {
  private llm: ChatOpenAI;
  private chain: RunnableSequence;

  constructor() {
    // Initialize the OpenAI LLM
    this.llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'gpt-3.5-turbo',
      temperature: 0.7,
    });

    // Create a prompt template
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "You are a helpful AI assistant. Answer questions clearly and concisely."],
      ["human", "{input}"]
    ]);

    // Create the chain
    this.chain = RunnableSequence.from([
      prompt,
      this.llm,
      new StringOutputParser()
    ]);
  }

  async processQuery(input: string): Promise<string> {
    try {
      const response = await this.chain.invoke({ input });
      return response;
    } catch (error) {
      console.error('Error processing query:', error);
      throw new Error('Failed to process query');
    }
  }
}

// Initialize the agent
const agent = new AIAgent();

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Torvely AI Agent Backend is running!',
    endpoints: {
      chat: 'POST /api/chat',
      health: 'GET /health'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await agent.processQuery(message);
    
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