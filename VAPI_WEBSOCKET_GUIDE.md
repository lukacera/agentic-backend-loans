# VAPI WebSocket Events Guide

## WebSocket Connection

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');
```

## Available Events to Listen For

### 1. Generic Event (All VAPI Updates)
```javascript
socket.on('vapi-update', (payload) => {
  console.log('Generic VAPI event:', payload);
  // Contains: event, type, timestamp, data, metadata
});
```

### 2. **Conversation Update** (Your Primary Interest)
```javascript
socket.on('vapi-conversation-update', (payload) => {
  console.log('Conversation updated!');
  console.log('Messages:', payload.messages);
  console.log('Total messages:', payload.messagesCount);
  console.log('Call ID:', payload.metadata.callId);

  // Payload structure:
  // {
  //   event: 'vapi-update',
  //   type: 'conversation-update',
  //   timestamp: '2025-12-05T...',
  //   data: { ...full VAPI message },
  //   metadata: { callId, phoneNumber },
  //   messages: [...array of messages],
  //   messagesCount: 5
  // }
});
```

### 3. Transcript Updates
```javascript
socket.on('vapi-transcript', (payload) => {
  console.log('Transcript:', payload.transcript);
  console.log('Type:', payload.transcriptType);
  console.log('Role:', payload.role); // 'user' or 'assistant'

  // Payload includes:
  // - transcript: string
  // - transcriptType: string
  // - role: 'user' | 'assistant'
});
```

### 4. Assistant Request (Call Started)
```javascript
socket.on('vapi-assistant-request', (payload) => {
  console.log('New call started!');
  console.log('Call ID:', payload.metadata.callId);
});
```

### 5. Call Ended
```javascript
socket.on('vapi-call-ended', (payload) => {
  console.log('Call ended');
  console.log('Reason:', payload.endedReason);
  console.log('Duration:', payload.duration);
  console.log('Status:', payload.status);
});
```

### 6. Speech Update
```javascript
socket.on('vapi-speech-update', (payload) => {
  console.log('Speech update:', payload);
});
```

### 7. Status Update
```javascript
socket.on('vapi-status-update', (payload) => {
  console.log('Status:', payload.status);
});
```

### 8. Tool Calls
```javascript
socket.on('vapi-tool-calls', (payload) => {
  console.log('Tool calls:', payload.toolCalls);
});
```

### 9. Function Call
```javascript
socket.on('vapi-function-call', (payload) => {
  console.log('Function call:', payload);
});
```

### 10. Hang Event
```javascript
socket.on('vapi-hang', (payload) => {
  console.log('Hang detected:', payload);
});
```

### 11. Model Output
```javascript
socket.on('vapi-model-output', (payload) => {
  console.log('Model output:', payload.output);
});
```

## Room Management

### Join Rooms
```javascript
// Join global room (happens automatically on connect)
socket.emit('join-room', 'global');

// Join specific call room
socket.emit('join-room', 'call:call_123456');

// Listen for confirmation
socket.on('room-joined', (data) => {
  console.log('Joined room:', data.room);
});
```

### Leave Rooms
```javascript
socket.emit('leave-room', 'call:call_123456');

socket.on('room-left', (data) => {
  console.log('Left room:', data.room);
});
```

### Request Call Status
```javascript
socket.emit('vapi-request-status', 'call_123456');

socket.on('vapi-status-response', (data) => {
  console.log('Status response:', data);
});
```

## Complete React Example - Conversation Focus

```javascript
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const VapiConversationMonitor = ({ callId }) => {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [transcripts, setTranscripts] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socketInstance = io('http://localhost:3000');

    socketInstance.on('connect', () => {
      console.log('Connected to WebSocket');
      setIsConnected(true);

      // Join global and specific call room
      socketInstance.emit('join-room', 'global');
      if (callId) {
        socketInstance.emit('join-room', `call:${callId}`);
      }
    });

    // Listen for conversation updates
    socketInstance.on('vapi-conversation-update', (payload) => {
      console.log('📝 Conversation Update:', payload);
      setMessages(payload.messages || []);
    });

    // Listen for transcripts
    socketInstance.on('vapi-transcript', (payload) => {
      console.log('🎤 Transcript:', payload.transcript);
      setTranscripts(prev => [...prev, {
        text: payload.transcript,
        role: payload.role,
        type: payload.transcriptType,
        timestamp: payload.timestamp
      }]);
    });

    // Listen for call end
    socketInstance.on('vapi-call-ended', (payload) => {
      console.log('☎️ Call ended:', payload.endedReason);
      socketInstance.emit('leave-room', `call:${callId}`);
    });

    socketInstance.on('disconnect', () => {
      console.log('Disconnected from WebSocket');
      setIsConnected(false);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [callId]);

  return (
    <div>
      <h2>VAPI Call Monitor</h2>
      <p>Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}</p>

      <h3>Conversation Messages ({messages.length})</h3>
      <div>
        {messages.map((msg, idx) => (
          <div key={idx}>
            <strong>{msg.role}:</strong> {msg.content}
          </div>
        ))}
      </div>

      <h3>Live Transcripts</h3>
      <div>
        {transcripts.map((transcript, idx) => (
          <div key={idx}>
            <strong>{transcript.role}:</strong> {transcript.text}
            <small> ({transcript.type})</small>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VapiConversationMonitor;
```

## Vanilla JavaScript Example

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('✅ Connected');
  socket.emit('join-room', 'global');
});

// Focus on conversation updates
socket.on('vapi-conversation-update', (payload) => {
  console.log('💬 Conversation Update');
  console.log('Messages:', payload.messages);
  console.log('Count:', payload.messagesCount);

  // Update your UI with the messages
  updateConversationUI(payload.messages);
});

// Also listen to transcripts for real-time updates
socket.on('vapi-transcript', (payload) => {
  console.log(`🎤 ${payload.role}: ${payload.transcript}`);

  // Append to live transcript display
  appendTranscript(payload.role, payload.transcript);
});

function updateConversationUI(messages) {
  const container = document.getElementById('messages');
  container.innerHTML = messages.map(msg =>
    `<div class="message ${msg.role}">
      <strong>${msg.role}:</strong> ${msg.content}
    </div>`
  ).join('');
}

function appendTranscript(role, text) {
  const container = document.getElementById('transcripts');
  const div = document.createElement('div');
  div.className = `transcript ${role}`;
  div.innerHTML = `<strong>${role}:</strong> ${text}`;
  container.appendChild(div);
}
```

## Event Priority for Conversation Tracking

For tracking conversations, listen to these events in order of importance:

1. **`vapi-conversation-update`** - Full conversation state (most important)
2. **`vapi-transcript`** - Real-time transcript updates
3. **`vapi-call-ended`** - Know when conversation ends
4. **`vapi-assistant-request`** - Know when conversation starts

## Payload Structure Reference

All events include:
```javascript
{
  event: 'vapi-update',
  type: string,           // Event type
  timestamp: string,       // ISO timestamp
  data: VapiMessage,      // Full VAPI webhook message
  metadata: {
    callId: string,       // Call identifier
    phoneNumber: string   // Phone number if available
  }
}
```

Additional fields are added based on event type (see examples above).
