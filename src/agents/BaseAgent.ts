import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { InMemoryCache } from "@langchain/core/caches"; 
import { StringOutputParser, StructuredOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { AgentConfig, AgentStatus, BaseAgentResponse } from '../types';

// Agent state type
export interface AgentState {
  name: string;
  config: AgentConfig;
  startTime: Date;
  tasksProcessed: number;
  lastActivity: Date;
  llm: ChatAnthropic;
}

// Create an agent instance
export const createAgent = (name: string, config: Partial<AgentConfig> = {}): AgentState => {
  const fullConfig: AgentConfig = {
    name,
    enabled: true,
    maxConcurrentTasks: 5,
    timeout: 30000,
    ...config
  };

  const cache = new InMemoryCache(); // 

  const llm = new ChatAnthropic({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    modelName: "claude-haiku-4-5",
    cache: cache 
  });

  return {
    name,
    config: fullConfig,
    startTime: new Date(),
    tasksProcessed: 0,
    lastActivity: new Date(),
    llm
  };
};

// Process with LLM
export const processWithLLM = async (
  agent: AgentState,
  systemPrompt: string,
  userInput: string,
  additionalContext?: string
): Promise<string> => {
  
  // 1. Define messages with Cache Control
  // Anthropic requires the 'cache_control' metadata to know WHAT to cache.
  const messages: any[] = [
    {
      role: "system",
      content: [
        {
          type: "text",
          text: systemPrompt,
          // This tells Anthropic: "Keep this system prompt in the KV cache"
          cache_control: { type: "" } 
        }
      ]
    }
  ];

  if (additionalContext) {
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: `Context: ${additionalContext}`,
          // Optional: Cache the context too if it's very large (>2048 tokens)
          cache_control: { type: "ephemeral" }
        }
      ]
    });
  }

  messages.push({ role: "user", content: userInput });

  // 2. We use the raw messages format for better control over metadata
  try {
    // Note: Use .invoke() or .predictMessages() 
    // If using RunnableSequence, ensure the prompt template preserves metadata
    const response = await agent.llm.invoke(messages);
    
    updateActivity(agent);
    return response.content as string;
  } catch (error) {
    console.error(`${agent.name} LLM error:`, error);
    throw error;
  }
};

// Create a response
export const createResponse = <T>(
  success: boolean,
  data?: T,
  error?: string,
  processingTime?: number
): BaseAgentResponse<T> => ({
  success,
  data,
  error,
  timestamp: new Date(),
  processingTime: processingTime || 0
});

// Update agent activity
export const updateActivity = (agent: AgentState): AgentState => {
  agent.lastActivity = new Date();
  agent.tasksProcessed++;
  return agent;
};

// Get agent status
export const getAgentStatus = (agent: AgentState): AgentStatus => {
  const now = new Date();
  const uptime = now.getTime() - agent.startTime.getTime();
  
  return {
    name: agent.name,
    status: agent.config.enabled ? 'active' : 'inactive',
    uptime,
    tasksProcessed: agent.tasksProcessed,
    lastActivity: agent.lastActivity,
    currentLoad: 0
  };
};

// Agent control functions
export const isAgentEnabled = (agent: AgentState): boolean => agent.config.enabled;

export const enableAgent = (agent: AgentState): AgentState => {
  agent.config.enabled = true;
  return agent;
};

export const disableAgent = (agent: AgentState): AgentState => {
  agent.config.enabled = false;
  return agent;
};