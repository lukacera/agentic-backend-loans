export interface AgentConfig {
  name: string;
  enabled: boolean;
  maxConcurrentTasks: number;
  timeout: number;
}

export interface BaseAgentResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
  processingTime: number;
}

export interface AgentStatus {
  name: string;
  status: 'active' | 'inactive' | 'error';
  uptime: number;
  tasksProcessed: number;
  lastActivity: Date;
  currentLoad: number;
}