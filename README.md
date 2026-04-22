# GlobCall - Free Online Calling Platform

A full-stack web application for peer-to-peer audio calling using WebRTC, similar to Globfone.

Developed by Vikram from USCL

## Project Structure

```
project/
├── backend/                 # Node.js + Express + Socket.IO server
│   ├── server.js         # Signaling server
│   └── package.json      # Backend dependencies
│
├── frontend/              # React + Vite + Tailwind CSS
│   ├── src/
│   │   ├── App.jsx       # Main application component
│   │   ├── main.jsx      # Entry point
│   │   └── index.css    # Tailwind styles
│   ├── public/
│   │   └── phone.svg   # App icon
│   ├── index.html       # HTML template
│   ├── vite.config.js  # Vite configuration
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json  # Frontend dependencies
│
└── README.md            # This file
```

## Simple Guide

If you want an easy explanation, read [`HOW_IT_WORKS.md`](./HOW_IT_WORKS.md).
The app also has a separate `How it works` page linked from the main screen.

## Features

- **User-to-user audio calling** using WebRTC
- **Unique user ID** for each connected user
- **Incoming call notifications** with accept/reject buttons
- **Share invite link** using the native share sheet, WhatsApp, or clipboard fallback
- **Persistent user ID per tab** with a manual `Reset ID` button
- **Call controls**: mute, unmute, end call
- **Connection status** display (calling, connected, disconnected)
- **In-call chat** messaging
- **STUN server**: stun:stun.l.google.com:19302

## Tech Stack

- **Frontend**: React 18, Vite 5, Tailwind CSS 3
- **Backend**: Node.js, Express, Socket.IO 4
- **Real-time**: WebRTC, Socket.IO signaling

## Prerequisites

- Node.js 18+ installed
- Modern browser with WebRTC support

## Installation & Setup

### 1. Install Backend Dependencies

```bash
cd backend
npm install
```

### 2. Install Frontend Dependencies

```bash
cd frontend
npm install
```

### 3. Configure Environment Variables

Backend (`backend/.env`):

```bash
PORT=3001
FRONTEND_URL=http://localhost:5173
```

Frontend (`frontend/.env`):

```bash
VITE_SERVER_URL=http://localhost:3001
```

## Running the Application

### Start both services

```bash
npm start
```

Or:

```bash
npm run dev
```

This starts:
- Backend on `http://localhost:3001`
- Frontend on `http://localhost:5173`

### Stop both services

```bash
npm run stop
```

### Start individually

```bash
cd backend && npm start
cd frontend && npm run dev
```

## Local vs Online

- Use local development if you want to test and change code on your machine.
- After deployment, you do not need to run locally for normal use.
- For online testing, set `FRONTEND_URL` to your Vercel domain and `VITE_SERVER_URL` to your backend URL.
- Refreshing the same tab keeps the same User ID.
- Use `Reset ID` to create a new one.
- Use a different browser or incognito window if you want a second user.
- If the backend restarts, all in-memory IDs are reset.

## How to Use

1. **Open the app** in two different browser windows/tabs
2. **Share your User ID** using the Share button, or copy it from the top
3. **Enter the other user's ID** in the input field
4. **Click "Start Call"** to initiate the call
5. **Accept or reject** the incoming call on the other window
6. **Use mute/unmute** to control your microphone
7. **Use the chat** to send messages during the call

## Testing Tips

- Use two different browsers (e.g., Chrome and Firefox) for testing
- Or use incognito mode in the same browser
- For production, use TURN servers for NAT traversal

## WebRTC Configuration

```javascript
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.google.com:19302' }
]
```

## Socket.IO Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `user-connected` | Server -> Client | User ID assigned |
| `call-user` | Client -> Server | Initiate call |
| `incoming-call` | Server -> Client | Receive call |
| `answer-call` | Client -> Server | Accept call |
| `call-accepted` | Server -> Client | Call accepted |
| `reject-call` | Client -> Server | Reject call |
| `ice-candidate` | Both | ICE candidate exchange |
| `end-call` | Client -> Server | End call |
| `call-ended` | Server -> Client | Call ended |
| `chat-message` | Both | Send/receive chat |

## Deployment (Optional)

### Frontend (Vercel)

```bash
cd frontend
npm run build
vercel deploy
```

### Backend (Render/Railway)

```bash
cd backend
npm start
```

Set these production env vars in your hosting dashboard:

- Backend: `FRONTEND_URL=https://your-frontend.vercel.app`
- Frontend: `VITE_SERVER_URL=https://your-backend.onrender.com`

## Troubleshooting

- **Microphone permission denied**: Ensure browser has microphone access
- **Call fails to connect**: Check firewall/NAT settings
- **User not found**: Verify the target user ID is correct and they are online

## License

MIT
