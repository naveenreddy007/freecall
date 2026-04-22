require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();

// Allow multiple frontend origins
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'https://freecall4u.vercel.app'
].filter(Boolean);

app.use(cors({ 
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is allowed
    if (ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed) || allowed === '*')) {
      callback(null, true);
    } else {
      console.log(`Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.get('/health', (_, res) => res.json({ status: 'ok', sessions: sessionsById.size }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: { 
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true
  },
  // Keep connections alive through Render's idle timeouts
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// ── Persistent session store ──────────────────────────────────────────────────
const SESSION_FILE = path.join('/tmp', 'globcall-sessions.json');

const sessionsById = new Map();
const userToSessionId = new Map();

const loadSessions = () => {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      for (const s of data) {
        // Restore session but mark inactive — socket is gone after restart
        s.active = false;
        s.socketId = null;
        sessionsById.set(s.sessionId, s);
        userToSessionId.set(s.userId, s.sessionId);
      }
      console.log(`Loaded ${sessionsById.size} sessions from disk`);
    }
  } catch (err) {
    console.error('Failed to load sessions:', err.message);
  }
};

const saveSessions = () => {
  try {
    const data = Array.from(sessionsById.values()).map(s => ({
      sessionId: s.sessionId,
      userId: s.userId
    }));
    fs.writeFileSync(SESSION_FILE, JSON.stringify(data), 'utf8');
  } catch (err) {
    console.error('Failed to save sessions:', err.message);
  }
};

loadSessions();

// ── Session helpers ───────────────────────────────────────────────────────────
const createUserId = () => {
  let userId = uuidv4().slice(0, 8);
  while (userToSessionId.has(userId)) userId = uuidv4().slice(0, 8);
  return userId;
};

const createSession = (sessionId) => {
  const session = { sessionId, userId: createUserId(), socketId: null, active: false };
  sessionsById.set(sessionId, session);
  userToSessionId.set(session.userId, sessionId);
  saveSessions();
  return session;
};

const getSessionByUserId = (userId) => {
  const sessionId = userToSessionId.get(userId);
  return sessionId ? (sessionsById.get(sessionId) || null) : null;
};

const getActiveSocketId = (userId) => {
  const session = getSessionByUserId(userId);
  return session?.active && session?.socketId ? session.socketId : null;
};

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  const requestedSessionId = socket.handshake.auth?.sessionId?.trim();
  const sessionId = requestedSessionId || uuidv4();
  let session = sessionsById.get(sessionId);

  if (!session) {
    session = createSession(sessionId);
  }

  session.socketId = socket.id;
  session.active = true;
  socket.data.sessionId = sessionId;
  socket.data.userId = session.userId;

  socket.emit('session-established', { sessionId, userId: session.userId });
  socket.emit('user-connected', session.userId);
  console.log(`Session ready: ${sessionId} | User: ${session.userId}`);

  socket.on('call-user', ({ userId: targetUserId, signalData }) => {
    const targetSocketId = getActiveSocketId(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('incoming-call', {
        callerId: session.userId,
        callerSocketId: socket.id,
        signalData
      });
      console.log(`Call: ${session.userId} → ${targetUserId}`);
    } else {
      socket.emit('call-error', { message: 'User not found or offline' });
    }
  });

  socket.on('answer-call', ({ callerSocketId, signalData }) => {
    io.to(callerSocketId).emit('call-accepted', { signalData });
    console.log(`Call answered by ${session.userId}`);
  });

  socket.on('ice-candidate', ({ targetUserId, candidate }) => {
    const targetSocketId = getActiveSocketId(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', { candidate, senderId: session.userId });
    }
  });

  socket.on('reject-call', ({ callerSocketId }) => {
    io.to(callerSocketId).emit('call-rejected');
  });

  socket.on('end-call', ({ targetUserId }) => {
    const targetSocketId = getActiveSocketId(targetUserId);
    if (targetSocketId) io.to(targetSocketId).emit('call-ended');
  });

  socket.on('send-chat-message', ({ targetUserId, message }) => {
    const targetSocketId = getActiveSocketId(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('chat-message', {
        senderId: session.userId,
        message,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('disconnect', () => {
    const s = socket.data.sessionId ? sessionsById.get(socket.data.sessionId) : null;
    if (s && s.socketId === socket.id) {
      s.active = false;
      s.socketId = null;
      console.log(`User disconnected: ${s.userId}`);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Signaling server running on 0.0.0.0:${PORT}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
});
