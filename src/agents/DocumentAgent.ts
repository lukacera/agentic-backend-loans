import { AgentState, createAgent, createResponse } from './BaseAgent.js';
import { 
  initializeStorage,
} from '../services/documentProcessor.js';

// Create document agent
export const createDocumentAgent = (): AgentState => {
  return createAgent('DocumentAgent', {
    maxConcurrentTasks: 3,
    timeout: 60000 // 60 seconds
  });
};

// Initialize document agent
export const initializeDocumentAgent = async (): Promise<void> => {
  await initializeStorage();
  console.log('Document agent initialized successfully');
};