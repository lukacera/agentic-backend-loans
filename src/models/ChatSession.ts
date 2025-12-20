import { Schema, model, Document } from 'mongoose';
import { IChatSession, ChatMessage, ChatToolCall } from '../types/index.js';

export interface IChatSessionDocument extends IChatSession, Document {}

const chatToolCallSchema = new Schema<ChatToolCall>({
  name: { type: String, required: true },
  arguments: { type: Schema.Types.Mixed, default: {} },
  result: { type: Schema.Types.Mixed }
}, { _id: false });

const chatMessageSchema = new Schema<ChatMessage>({
  role: {
    type: String,
    required: true,
    enum: ['user', 'assistant', 'system']
  },
  content: { type: String, required: true },
  toolCalls: [chatToolCallSchema],
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const chatSessionSchema = new Schema<IChatSessionDocument>({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  messages: [chatMessageSchema],
  userData: {
    type: Schema.Types.Mixed,
    default: {}
  },
  applicationId: {
    type: Schema.Types.ObjectId,
    ref: 'Application'
  }
}, {
  timestamps: true
});

// Index for efficient queries
chatSessionSchema.index({ createdAt: -1 });
chatSessionSchema.index({ applicationId: 1 });

export const ChatSession = model<IChatSessionDocument>('ChatSession', chatSessionSchema);
