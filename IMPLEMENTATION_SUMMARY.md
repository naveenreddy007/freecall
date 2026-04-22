# GlobCall Implementation Summary

Developed by Vikram from USCL

## What Was Added

- Short user IDs instead of long UUID-style IDs
- Persistent session per browser tab without a database
- `Reset ID` button to create a new identity manually
- Native share button for invite links
- Direct WhatsApp share button
- Local environment variable setup for frontend and backend
- Root-level start/stop scripts for both services

## How It Works

- Frontend stores a session ID in `sessionStorage`
- Backend reuses the same user ID when the same session reconnects
- Refreshing the same tab keeps the same ID
- Closing the tab or pressing `Reset ID` creates a new session

## Local Development

Start both apps:

```bash
npm start
```

Stop both apps:

```bash
npm run stop
```

Local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

## Important Notes

- No database is used
- If the backend restarts, in-memory sessions are lost
- A refresh does not change the user ID in the same tab
- Ongoing calls still need to be reconnected after a network drop

## Deployment Note

- Frontend: Vercel
- Backend: Render or Railway
- Set `VITE_SERVER_URL` on the frontend
- Set `FRONTEND_URL` on the backend
