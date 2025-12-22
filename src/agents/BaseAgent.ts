import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
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

  const llm = new ChatAnthropic({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    modelName: "claude-sonnet-4-20250514",
    temperature: 0.4
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
  const messages: [string, string][] = [
    ["system", systemPrompt],
    ["human", userInput]
  ];

  if (additionalContext) {
    messages.splice(1, 0, ["assistant", `Context: ${additionalContext}`]);
  }

  const prompt = ChatPromptTemplate.fromMessages(messages);
  const chain = RunnableSequence.from([
    prompt,
    agent.llm,
    new StringOutputParser()
  ]);

  try {
    const response = await chain.invoke({ input: userInput });
    updateActivity(agent);
    return response;
  } catch (error) {
    console.error(`${agent.name} LLM processing error:`, error);
    throw new Error(`LLM processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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