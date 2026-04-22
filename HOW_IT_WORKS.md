# GlobCall: How It Works

Developed by Vikram from USCL

Open this page from the main screen using the `How it works` link.

## Simple Overview

GlobCall is a web app for voice calling.

- Frontend shows the UI and handles buttons
- Backend gives each user an ID and sends call messages
- WebRTC carries the audio directly between users

## Frontend Architecture

Main file: `frontend/src/App.jsx`

What it does:

- Connects to the backend with Socket.IO
- Gets a user ID from the server
- Saves the session in `sessionStorage`
- Starts a call when you click `Start Call`
- Accepts or rejects incoming calls
- Shows mute, end call, chat, share, and WhatsApp actions

Main logic functions:

- `startCall()` begins a new call
- `acceptCall()` answers an incoming call
- `endCall()` closes the current call
- `shareInvite()` opens the share sheet or copies the link
- `shareOnWhatsApp()` opens WhatsApp with the invite text
- `resetIdentity()` clears the saved session and creates a new User ID

## Backend Architecture

Main file: `backend/server.js`

What it does:

- Listens for browser connections
- Assigns a short user ID
- Keeps session info in memory
- Sends call signals between users
- Sends chat messages and ICE candidates

Main logic events:

- `session-established` sends the saved session and User ID
- `call-user` sends an incoming call request
- `answer-call` returns the answer to the caller
- `ice-candidate` helps WebRTC connect audio
- `send-chat-message` forwards chat text

## Main Call Flow

1. Open the app
2. Frontend connects to backend
3. Backend gives a short User ID
4. Share your ID with the other person
5. One user clicks `Start Call`
6. Backend sends the call request to the other user
7. Other user clicks `Accept`
8. WebRTC connects the audio

## Network Path

Tags:

- `[UI]` browser screen and buttons
- `[SIGNAL]` Socket.IO messages for call setup
- `[MEDIA]` WebRTC audio stream
- `[ISP]` your internet provider carries packets
- `[TURN]` fallback relay when direct connection fails

Simple path:

`[UI] Browser -> [SIGNAL] Backend -> [UI] Other Browser`

After accept:

`[MEDIA] Browser A <-> Browser B`

In real deployments, if direct peer-to-peer fails:

`[MEDIA] Browser A -> [TURN] -> Browser B`

What the ISP can see:

- Your device connecting to the backend or TURN server
- Timing and data size
- Not the raw audio content when encryption is working

## Refresh Behavior

- Refreshing the same tab keeps the same User ID
- `Reset ID` makes a new session
- If the backend restarts, IDs reset because no database is used

## Share Options

- `Share` uses the mobile share sheet or clipboard
- `WhatsApp` opens a direct WhatsApp message link

## Local Run

```bash
npm start
```

Stop both services:

```bash
npm run stop
```

## Important Note

This project currently uses memory only, not a database.
