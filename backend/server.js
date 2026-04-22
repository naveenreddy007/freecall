require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(cors({ origin: FRONTEND_URL }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"]
  }
});

const sessionsById = new Map();
const userToSessionId = new Map();

const createUserId = () => {
  let userId = uuidv4().slice(0, 8);

  while (userToSessionId.has(userId)) {
    userId = uuidv4().slice(0, 8);
  }

  return userId;
};

const createSession = (sessionId) => {
  const session = {
    sessionId,
    userId: createUserId(),
    socketId: null,
    active: false
  };

  sessionsById.set(sessionId, session);
  userToSessionId.set(session.userId, sessionId);

  return session;
};

const getSessionByUserId = (userId) => {
  const sessionId = userToSessionId.get(userId);

  if (!sessionId) {
    return null;
  }

  return sessionsById.get(sessionId) || null;
};

const getActiveSocketId = (userId) => {
  const session = getSessionByUserId(userId);

  if (!session || !session.active || !session.socketId) {
    return null;
  }

  return session.socketId;
};

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

  socket.emit('session-established', {
    sessionId,
    userId: session.userId
  });
  socket.emit('user-connected', session.userId);
  console.log(`Session ready: ${sessionId}`);
  console.log(`User ID assigned: ${session.userId}`);

  socket.on('call-user', ({ userId: targetUserId, signalData }) => {
    const targetSocketId = getActiveSocketId(targetUserId);
    
    if (targetSocketId) {
      io.to(targetSocketId).emit('incoming-call', {
        callerId: session.userId,
        callerSocketId: socket.id,
        signalData
      });
      console.log(`Call initiated from ${session.userId} to ${targetUserId}`);
    } else {
      socket.emit('call-error', { message: 'User not found or offline' });
    }
  });

  socket.on('answer-call', ({ callerSocketId, signalData }) => {
    io.to(callerSocketId).emit('call-accepted', { signalData });
    console.log(`Call answered from ${session.userId}`);
  });

  socket.on('ice-candidate', ({ targetUserId, candidate }) => {
    const targetSocketId = getActiveSocketId(targetUserId);
    
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', { candidate, senderId: session.userId });
    }
  });

  socket.on('reject-call', ({ callerSocketId }) => {
    io.to(callerSocketId).emit('call-rejected');
    console.log(`Call rejected by ${session.userId}`);
  });

  socket.on('end-call', ({ targetUserId }) => {
    const targetSocketId = getActiveSocketId(targetUserId);
    
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-ended');
    }
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
    const currentSession = socket.data.sessionId ? sessionsById.get(socket.data.sessionId) : null;

    if (currentSession && currentSession.socketId === socket.id) {
      currentSession.active = false;
      currentSession.socketId = null;
      console.log(`User disconnected: ${currentSession.userId}`);
    }
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Signaling server running on 0.0.0.0:${PORT}`);
  console.log(`Allowed frontend: ${FRONTEND_URL}`);
  console.log(`STUN server: stun:stun.l.google.com:19302`);
});
