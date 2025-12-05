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

    // Join specific rooms when client requests
    socket.on('join-room', (room: string) => {
      socket.join(room);
      console.log(`Socket ${socket.id} joined room: ${room}`);
    });

    // Leave room
    socket.on('leave-room', (room: string) => {
      socket.leave(room);
      console.log(`Socket ${socket.id} left room: ${room}`);
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
        'chrome-extension://oeaoefimiancojpimjmkigjdkpaenbdg'
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

  emitToRooms(io, 'vapi-update', payload, allRooms);
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
