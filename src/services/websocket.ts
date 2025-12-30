import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { VapiMessage } from '../types/index.js';

// Module-level state (closure)
let io: SocketIOServer | null = null;

/**
 * Setup WebSocket event handlers
 */
const setupEventHandlers = (ioInstance: SocketIOServer): void => {
  ioInstance.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);

    // Automatically join the global room
    socket.join('global');
    console.log(`Socket ${socket.id} auto-joined room: global`);

    // Join specific rooms when client requests
    socket.on('join-room', (room: string) => {
      socket.join(room);
      console.log(`Socket ${socket.id} joined room: ${room}`);

      // Send confirmation back to client
      socket.emit('room-joined', { room, socketId: socket.id });
    });

    // Leave room
    socket.on('leave-room', (room: string) => {
      socket.leave(room);
      console.log(`Socket ${socket.id} left room: ${room}`);

      // Send confirmation back to client
      socket.emit('room-left', { room, socketId: socket.id });
    });

    // Request VAPI call status
    socket.on('vapi-request-status', (callId: string) => {
      console.log(`Socket ${socket.id} requested status for call: ${callId}`);
      // This could be extended to query a database or cache for call status
      socket.emit('vapi-status-response', {
        callId,
        message: 'Status request received',
        timestamp: new Date().toISOString()
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('❌ Client disconnected:', socket.id);
    });
  });
};

/**
 * Initialize WebSocket server
 */
export const initialize = (httpServer: HTTPServer): SocketIOServer => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: [
        'http://localhost:3000',
        'http://localhost:5173',
        'https://new-torvely-dashboard.vercel.app',
        'chrome-extension://oeaoefimiancojpimjmkigjdkpaenbdg',
        'https://herminia-clangorous-alphonse.ngrok-free.dev'
      ],
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  setupEventHandlers(io);
  console.log('🔌 WebSocket service initialized');

  return io;
};

/**
 * Create payload for Vapi events
 */
const createVapiPayload = (message: VapiMessage) => ({
  event: 'vapi-update',
  type: message.type,
  timestamp: new Date().toISOString(),
  data: message,
  metadata: {
    callId: message.call?.id,
    phoneNumber: message.call?.phoneNumber?.number,
  }
});

/**
 * Emit event to specified rooms
 */
const emitToRooms = (
  ioInstance: SocketIOServer,
  event: string,
  payload: any,
  rooms: string[]
): void => {
  rooms.forEach(room => {
    ioInstance.to(room).emit(event, payload);
  });
};

/**
 * Broadcast Vapi event to WebSocket clients
 */
export const broadcastVapiEvent = (
  message: VapiMessage,
  rooms: string[] = ['global']
): void => {
  if (!io) {
    console.warn('⚠️ WebSocket not initialized, cannot broadcast event');
    return;
  }

  const payload = createVapiPayload(message);
  const allRooms = rooms.includes('global') ? rooms : [...rooms, 'global'];
  console.log('Broadcasting to rooms:', allRooms);
  // Broadcast generic vapi-update event
  emitToRooms(io, 'vapi-update', payload, allRooms);

  // Broadcast specific typed events based on message type
  switch (message.type) {
    case 'assistant-request':
      emitToRooms(io, 'vapi-assistant-request', payload, allRooms);
      break;

    case 'conversation-update':
      emitToRooms(io, 'vapi-conversation-update', {
        ...payload,
        messages: message.messages || [],
        messagesCount: message.messages?.length || 0
      }, allRooms);
      break;

    case 'transcript':
      emitToRooms(io, 'vapi-transcript', {
        ...payload,
        transcript: message.transcript,
        transcriptType: message.transcriptType,
        role: message.role
      }, allRooms);
      break;

    case 'end-of-call-report':
      emitToRooms(io, 'vapi-call-ended', {
        ...payload,
        endedReason: message.endedReason,
        duration: message.call?.duration,
        status: message.status
      }, allRooms);
      break;

    case 'speech-update':
      emitToRooms(io, 'vapi-speech-update', {
        ...payload,
        speaker: message.speaker ?? message.output?.speaker,
        transcript: message.transcript ?? message.output?.transcript,
        words: message.words ?? message.output?.words ?? [],
        wordsCount: Array.isArray(message.words ?? message.output?.words) ? (message.words ?? message.output?.words).length : 0,
        status: message.status,
        transcriptType: message.transcriptType ?? message.output?.transcriptType,
      }, allRooms);
      break;

    case 'status-update':
      emitToRooms(io, 'vapi-status-update', {
        ...payload,
        status: message.status
      }, allRooms);
      break;

    case 'tool-calls':
      emitToRooms(io, 'vapi-tool-calls', {
        ...payload,
        toolCalls: message.toolCallList || []
      }, allRooms);
      break;

    case 'function-call':
      emitToRooms(io, 'vapi-function-call', payload, allRooms);
      break;

    case 'hang':
      emitToRooms(io, 'vapi-hang', payload, allRooms);
      break;

    case 'model-output':
      emitToRooms(io, 'vapi-model-output', {
        ...payload,
        output: message.output
      }, allRooms);
      break;
  }

  console.log(`📡 WebSocket broadcast: ${message.type} to rooms: ${allRooms.join(', ')}`);
};

/**
 * Broadcast custom event to specific rooms
 */
export const broadcast = (
  event: string,
  data: any,
  rooms: string[] = ['global']
): void => {
  if (!io) {
    console.warn('⚠️ WebSocket not initialized, cannot broadcast event');
    return;
  }

  emitToRooms(io, event, data, rooms);
  console.log(`📡 WebSocket broadcast: ${event} to rooms: ${rooms.join(', ')}`);
};

/**
 * Get Socket.IO instance
 */
export const getIO = (): SocketIOServer | null => io;

// Default export with all functions
export default {
  initialize,
  broadcastVapiEvent,
  broadcast,
  getIO
};
