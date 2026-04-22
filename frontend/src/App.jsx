import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'
const SESSION_STORAGE_KEY = 'globcall-session-id'

const getInitialPage = () => {
  if (typeof window === 'undefined') {
    return 'home'
  }

  return window.location.hash === '#how-it-works' ? 'how' : 'home'
}

const readSessionId = () => {
  if (typeof window === 'undefined') {
    return ''
  }

  try {
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

const saveSessionId = (sessionId) => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId)
  } catch {
    // Ignore storage failures and keep the in-memory session.
  }
}

const clearSessionId = () => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.google.com:19302' }
]

const STUDENT_STEPS = [
  {
    number: '01',
    title: 'Open',
    description: 'The frontend connects to the backend and gets a short user ID.'
  },
  {
    number: '02',
    title: 'Share',
    description: 'Send the ID with Share, WhatsApp, or Copy ID.'
  },
  {
    number: '03',
    title: 'Call',
    description: 'One user starts the call and the backend forwards the request.'
  },
  {
    number: '04',
    title: 'Talk',
    description: 'WebRTC connects audio directly between the two browsers.'
  }
]

const ARCHITECTURE_CARDS = [
  {
    title: 'Frontend',
    description: 'React UI, buttons, status, chat, and invite actions.'
  },
  {
    title: 'Backend',
    description: 'Express + Socket.IO relays user IDs and call messages.'
  },
  {
    title: 'WebRTC',
    description: 'Browser-to-browser audio path after signaling is done.'
  }
]

const DEMO_NOTES = [
  'Refresh the same tab to keep the same ID',
  'Reset ID to create a fresh identity',
  'No database is used, so backend restarts clear sessions'
]

function App() {
  const [page, setPage] = useState(getInitialPage())
  const [socket, setSocket] = useState(null)
  const [userId, setUserId] = useState('')
  const [targetUserId, setTargetUserId] = useState('')
  const [callStatus, setCallStatus] = useState('disconnected')
  const [incomingCall, setIncomingCall] = useState(null)
  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState(null)
  const [shareMessage, setShareMessage] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [callDuration, setCallDuration] = useState(0)
  const [traceLogs, setTraceLogs] = useState([])
  const addTrace = (type, direction, message, source = '') => {
    const log = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      type,
      direction,
      message,
      source
    }
    setTraceLogs(prev => [...prev, log].slice(-500))
  }

  const peerConnection = useRef(null)
  const callTimer = useRef(null)
  const shareTimer = useRef(null)
  const sessionIdRef = useRef(readSessionId())
  const activeCallUserId = useRef(null)

  useEffect(() => {
    const syncPage = () => setPage(getInitialPage())

    window.addEventListener('hashchange', syncPage)
    syncPage()

    return () => {
      window.removeEventListener('hashchange', syncPage)
    }
  }, [])

  useEffect(() => {
    const newSocket = io(SERVER_URL, {
      auth: (cb) => cb({ sessionId: sessionIdRef.current || undefined })
    })

     newSocket.on('session-established', ({ sessionId, userId: sessionUserId }) => {
       sessionIdRef.current = sessionId
       saveSessionId(sessionId)
       setUserId(sessionUserId)
       setError(null)
       addTrace('SESSION', 'IN', `Session established: ${sessionId}`, 'frontend/src/App.jsx:138')
     })

     newSocket.on('user-connected', (id) => {
       setUserId(id)
       console.log('Connected with ID:', id)
       addTrace('SESSION', 'IN', `User ID assigned: ${id}`, 'frontend/src/App.jsx:145')
     })

     newSocket.on('incoming-call', async ({ callerId, callerSocketId, signalData }) => {
       setIncomingCall({ callerId, callerSocketId, signalData })
       setCallStatus('incoming')
       addTrace('SIGNAL', 'IN', `Incoming call from ${callerId}`, 'frontend/src/App.jsx:150')
     })

     newSocket.on('call-accepted', async ({ signalData }) => {
       try {
         await peerConnection.current.setRemoteDescription(new RTCSessionDescription(signalData))
         setCallStatus('connected')
         startCallTimer()
         addTrace('WEBRTC', 'IN', 'Remote description set (call accepted)', 'frontend/src/App.jsx:155')
       } catch (err) {
         console.error('Error setting remote description:', err)
         setError('Failed to connect call')
         setCallStatus('disconnected')
         addTrace('ERROR', 'IN', 'Failed to set remote description', 'frontend/src/App.jsx:161')
       }
     })

    newSocket.on('call-rejected', () => {
      setError('Call was rejected')
      setCallStatus('disconnected')
      cleanupCall()
    })

    newSocket.on('call-ended', () => {
      setCallStatus('disconnected')
      cleanupCall()
    })

    newSocket.on('call-error', ({ message }) => {
      setError(message)
      setCallStatus('disconnected')
      cleanupCall()
    })

    newSocket.on('ice-candidate', async ({ candidate, senderId }) => {
      try {
        if (peerConnection.current) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate))
        }
      } catch (err) {
        console.error('Error adding ICE candidate:', err)
      }
    })

    newSocket.on('chat-message', ({ senderId, message, timestamp }) => {
      setChatMessages(prev => [...prev, { senderId, message, timestamp, isOwn: senderId === userId }])
    })

    newSocket.on('disconnect', () => {
      setError('Disconnected from server')
      setCallStatus('disconnected')
    })

    setSocket(newSocket)

    const params = new URLSearchParams(window.location.search)
    const sharedCallId = params.get('call')
    if (sharedCallId) {
      setTargetUserId(sharedCallId)
    }

    return () => {
      newSocket.disconnect()
      cleanupCall()
      if (shareTimer.current) {
        clearTimeout(shareTimer.current)
      }
    }
  }, [])

  const startCallTimer = () => {
    setCallDuration(0)
    callTimer.current = setInterval(() => {
      setCallDuration(prev => prev + 1)
    }, 1000)
  }

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const cleanupCall = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop())
      setLocalStream(null)
    }
    if (remoteStream) {
      setRemoteStream(null)
    }
    if (peerConnection.current) {
      peerConnection.current.close()
      peerConnection.current = null
    }
    if (callTimer.current) {
      clearInterval(callTimer.current)
      callTimer.current = null
    }
    setCallDuration(0)
    setChatMessages([])
    setIncomingCall(null)
  }

  const showShareMessage = (message) => {
    setShareMessage(message)

    if (shareTimer.current) {
      clearTimeout(shareTimer.current)
    }

    shareTimer.current = setTimeout(() => {
      setShareMessage('')
      shareTimer.current = null
    }, 3000)
  }

  const getInviteDetails = () => {
    const inviteUrl = new URL(window.location.href)
    inviteUrl.searchParams.set('call', userId)

    const shareText = `Call me on GlobCall. My ID is ${userId}`

    return {
      inviteUrl: inviteUrl.toString(),
      shareText
    }
  }

  const shareInvite = async () => {
    if (!userId) return

    const { inviteUrl, shareText } = getInviteDetails()
    const shareData = {
      title: 'GlobCall Invite',
      text: shareText,
      url: inviteUrl
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
        showShareMessage('Share sheet opened')
        return
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error('Error sharing invite:', err)
    }

    try {
      await navigator.clipboard.writeText(`${shareText}\n${inviteUrl.toString()}`)
      showShareMessage('Invite link copied')
    } catch (err) {
      console.error('Error copying invite:', err)
      setError('Unable to share invite')
    }
  }

  const shareOnWhatsApp = () => {
    if (!userId) return

    const { inviteUrl, shareText } = getInviteDetails()
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${inviteUrl}`)}`
    const opened = window.open(whatsappUrl, '_blank', 'noopener,noreferrer')

    if (!opened) {
      setError('Popup blocked. Allow popups or use Share.')
      return
    }

    showShareMessage('WhatsApp opened')
  }

  const copyUserId = async () => {
    if (!userId) return

    try {
      await navigator.clipboard.writeText(userId)
      showShareMessage('User ID copied')
    } catch (err) {
      console.error('Error copying User ID:', err)
      setError('Unable to copy User ID')
    }
  }

  const resetIdentity = () => {
    cleanupCall()

    if (socket) {
      socket.disconnect()
    }

    sessionIdRef.current = ''
    clearSessionId()
    setUserId('')
    setError(null)
    setShareMessage('')

    window.location.reload()
  }

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    pc.onicecandidate = (event) => {
      if (event.candidate && socket && activeCallUserId.current) {
        socket.emit('ice-candidate', { targetUserId: activeCallUserId.current, candidate: event.candidate })
      }
    }

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0])
    }

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState)
      if (pc.iceConnectionState === 'connected') {
        setCallStatus('connected')
        startCallTimer()
      } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        setCallStatus('disconnected')
        cleanupCall()
      }
    }

    return pc
  }

  const startCall = async () => {
    if (!targetUserId.trim()) {
      setError('Please enter a user ID to call')
      return
    }

    setError(null)
    setCallStatus('calling')
    activeCallUserId.current = targetUserId

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      setLocalStream(stream)

      peerConnection.current = createPeerConnection()

      stream.getTracks().forEach(track => {
        peerConnection.current.addTrack(track, stream)
      })

      const offer = await peerConnection.current.createOffer()
      await peerConnection.current.setLocalDescription(new RTCSessionDescription(offer))

      socket.emit('call-user', {
        userId: targetUserId,
        signalData: offer
      })

    } catch (err) {
      console.error('Error starting call:', err)
      setError('Failed to access microphone. Please grant permission.')
      setCallStatus('disconnected')
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
        setLocalStream(null)
      }
    }
  }

  const acceptCall = async () => {
    if (!incomingCall) return

    setError(null)
    setCallStatus('connecting')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      setLocalStream(stream)

      peerConnection.current = createPeerConnection()

      stream.getTracks().forEach(track => {
        peerConnection.current.addTrack(track, stream)
      })

      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(incomingCall.signalData))

      const answer = await peerConnection.current.createAnswer()
      await peerConnection.current.setLocalDescription(new RTCSessionDescription(answer))

      socket.emit('answer-call', {
        callerSocketId: incomingCall.callerSocketId,
        signalData: answer
      })

      activeCallUserId.current = incomingCall.callerId
      setIncomingCall(null)
      setCallStatus('connected')
      startCallTimer()

    } catch (err) {
      console.error('Error accepting call:', err)
      setError('Failed to accept call')
      setCallStatus('disconnected')
    }
  }

  const rejectCall = () => {
    if (incomingCall && socket) {
      socket.emit('reject-call', { callerSocketId: incomingCall.callerSocketId })
    }
    setIncomingCall(null)
    setCallStatus('disconnected')
  }

  const endCall = () => {
    if (socket && activeCallUserId.current) {
      socket.emit('end-call', { targetUserId: activeCallUserId.current })
    }
    if (incomingCall && socket) {
      socket.emit('reject-call', { callerSocketId: incomingCall.callerSocketId })
    }
    setCallStatus('disconnected')
    cleanupCall()
  }

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setIsMuted(!isMuted)
    }
  }

  const sendChatMessage = () => {
    if (chatInput.trim() && socket && activeCallUserId.current) {
      socket.emit('send-chat-message', { targetUserId: activeCallUserId.current, message: chatInput })
      setChatMessages(prev => [...prev, { 
        senderId: userId, 
        message: chatInput, 
        timestamp: new Date().toISOString(),
        isOwn: true 
      }])
      setChatInput('')
    }
  }

  const getStatusDisplay = () => {
    switch (callStatus) {
      case 'calling': return { text: 'Calling...', color: 'text-yellow-600', bg: 'bg-yellow-100' }
      case 'incoming': return { text: 'Incoming Call', color: 'text-blue-600', bg: 'bg-blue-100' }
      case 'connecting': return { text: 'Connecting...', color: 'text-yellow-600', bg: 'bg-yellow-100' }
      case 'connected': return { text: `Connected (${formatDuration(callDuration)})`, color: 'text-green-600', bg: 'bg-green-100' }
      default: return { text: 'Offline', color: 'text-gray-600', bg: 'bg-gray-100' }
    }
  }

  const statusDisplay = getStatusDisplay()

  const renderHomePage = () => (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-100">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 shadow-lg shadow-emerald-600/20">
              <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">GlobCall</h1>
              <p className="text-sm text-slate-600">Free online calling</p>
            </div>
          </div>

          <a
            href="#how-it-works"
            className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
          >
            How it works
          </a>
        </div>

        <div className="card mb-6">
          <div className="rounded-2xl bg-slate-50 p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-500">Your User ID</p>
                <p className="mt-1 break-all font-mono text-2xl font-semibold tracking-tight text-emerald-700">
                  {userId || 'Connecting...'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${statusDisplay.bg} ${statusDisplay.color}`}>
                  <span className={`status-indicator ${callStatus === 'calling' ? 'status-calling' : callStatus === 'connected' ? 'status-connected' : userId ? 'status-online' : 'status-offline'}`}></span>
                  {statusDisplay.text}
                </div>
                <button onClick={copyUserId} disabled={!userId} className="btn-secondary px-3 py-2 text-sm whitespace-nowrap">
                  Copy ID
                </button>
                <button onClick={shareInvite} disabled={!userId} className="btn-secondary px-3 py-2 text-sm whitespace-nowrap">
                  Share
                </button>
                <button
                  onClick={shareOnWhatsApp}
                  disabled={!userId}
                  className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  WhatsApp
                </button>
                <button onClick={resetIdentity} className="btn-danger px-3 py-2 text-sm whitespace-nowrap">
                  Reset ID
                </button>
              </div>
            </div>

            <p className="mt-4 text-sm text-slate-600">
              Share your ID with the other person, then start the call.
            </p>
          </div>

          {shareMessage && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm text-emerald-700">{shareMessage}</p>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            {callStatus === 'disconnected' && (
              <div>
                <p className="text-sm font-medium text-slate-500">Call someone</p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    placeholder="Enter user ID to call"
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    className="input-field flex-1"
                  />
                  <button
                    onClick={startCall}
                    disabled={!userId || !targetUserId.trim()}
                    className="btn-primary inline-flex items-center justify-center gap-2"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    Start Call
                  </button>
                </div>
              </div>
            )}

            {(callStatus === 'calling' || callStatus === 'connecting') && (
              <div className="text-center py-6">
                <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent"></div>
                <p className="mt-4 text-slate-600">{callStatus === 'calling' ? 'Calling...' : 'Connecting...'}</p>
                <button onClick={endCall} className="btn-danger mt-4 w-full sm:w-auto">
                  Cancel
                </button>
              </div>
            )}

            {(callStatus === 'connected' || callStatus === 'incoming') && (
              <div>
                {callStatus === 'incoming' && incomingCall && (
                  <div className="mb-4 rounded-2xl bg-blue-50 p-4 text-center">
                    <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-700">Incoming call</p>
                    <p className="mt-2 font-mono text-lg font-semibold text-slate-900">{incomingCall.callerId}</p>
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row">
                  {(callStatus === 'connected' || callStatus === 'incoming') && (
                    <button
                      onClick={callStatus === 'incoming' ? acceptCall : toggleMute}
                      className={callStatus === 'incoming' ? 'btn-primary flex-1' : `btn-primary flex-1 ${isMuted ? 'bg-red-600 hover:bg-red-700' : ''}`}
                    >
                      {callStatus === 'incoming' ? 'Accept' : isMuted ? 'Unmute' : 'Mute'}
                    </button>
                  )}
                  <button onClick={callStatus === 'incoming' ? rejectCall : endCall} className="btn-danger flex-1">
                    {callStatus === 'incoming' ? 'Reject' : 'End Call'}
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-center gap-2 text-slate-600">
                  <svg className={`h-4 w-4 ${isMuted ? 'text-red-500' : 'text-green-500'}`} fill="currentColor" viewBox="0 0 24 24">
                    {isMuted ? (
                      <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
                    ) : (
                      <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z" />
                    )}
                  </svg>
                  <span className="text-sm font-medium">{isMuted ? 'Muted' : 'Unmuted'}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {callStatus === 'connected' && (
          <section className="card mb-6">
            <h3 className="text-lg font-semibold text-slate-900">Chat</h3>
            <div className="mt-4 h-48 overflow-y-auto rounded-2xl bg-slate-50 p-4 space-y-2">
              {chatMessages.length === 0 ? (
                <p className="pt-16 text-center text-sm text-slate-500">No messages yet</p>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`max-w-[80%] rounded-2xl px-3 py-2 ${msg.isOwn ? 'ml-auto bg-emerald-600 text-white' : 'bg-white text-slate-800 shadow-sm'}`}
                  >
                    <p className="text-sm">{msg.message}</p>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <input
                type="text"
                placeholder="Type a message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                className="input-field flex-1"
              />
              <button onClick={sendChatMessage} disabled={!chatInput.trim()} className="btn-primary px-4">
                Send
              </button>
            </div>
          </section>
        )}

        <footer className="text-center text-sm text-slate-500">
          <p>Share your User ID to receive calls</p>
          <p className="mt-1">STUN: stun:stun.l.google.com:19302</p>
          <p className="mt-2 font-medium text-slate-700">Developed by Vikram from USCL</p>
        </footer>
      </div>
    </div>
  )

  const renderHowItWorksPage = () => (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-emerald-400/15 blur-3xl"></div>
        <div className="absolute right-0 top-20 h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-teal-400/10 blur-3xl"></div>
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:py-10 lg:py-12">
        <div className="mb-6 flex items-center justify-between gap-4">
          <a
            href="#home"
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/15"
          >
            <span>←</span>
            Back to Call
          </a>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">Developed by Vikram from USCL</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
            <div className="inline-flex items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/20">
              Simple explanation
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">How GlobCall works</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
              This page is for students and beginners. It explains the app in plain words without code.
            </p>

            <div className="mt-6 rounded-3xl border border-white/10 bg-slate-900/70 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">One-line idea</p>
              <p className="mt-3 text-base leading-7 text-slate-200">
                The frontend talks to the backend for IDs and call messages, then WebRTC sends audio directly between two browsers.
              </p>
            </div>

            <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5 ring-1 ring-white/10">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200">Network path</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-200">
                <span className="rounded-full bg-cyan-500/15 px-3 py-1 font-semibold text-cyan-200">[UI]</span>
                <span>Browser</span>
                <span className="text-slate-500">→</span>
                <span className="rounded-full bg-amber-500/15 px-3 py-1 font-semibold text-amber-200">[SIGNAL]</span>
                <span>Backend</span>
                <span className="text-slate-500">→</span>
                <span className="rounded-full bg-cyan-500/15 px-3 py-1 font-semibold text-cyan-200">[UI]</span>
                <span>Other browser</span>
              </div>
              <div className="mt-4 rounded-2xl bg-black/20 p-4 text-sm leading-7 text-slate-300">
                <p><span className="font-semibold text-white">After accept:</span> [MEDIA] Browser A &lt;--&gt; Browser B</p>
                <p className="mt-2"><span className="font-semibold text-white">In real deployments, if direct path fails:</span> [MEDIA] Browser A -&gt; [TURN] -&gt; Browser B</p>
                <p className="mt-2"><span className="font-semibold text-white">ISP view:</span> it can see network traffic to the app or relay server, but not the raw audio content.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {STUDENT_STEPS.map((step) => (
                <div key={step.number} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/20 text-sm font-bold text-emerald-200">
                    {step.number}
                  </div>
                  <p className="mt-3 font-semibold text-white">{step.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{step.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-6 shadow-2xl sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">Main parts</p>
            <div className="mt-4 space-y-3">
              {ARCHITECTURE_CARDS.map((card) => (
                <div key={card.title} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                  <p className="font-semibold text-white">{card.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{card.description}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-slate-200">
              <p className="font-semibold text-emerald-200">What students should remember</p>
              <ul className="mt-3 space-y-2">
                {DEMO_NOTES.map((note) => (
                  <li key={note} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300"></span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-300">
              <p className="font-semibold text-white">Main files</p>
              <p className="mt-2">Frontend logic lives in <code className="rounded bg-black/30 px-1 py-0.5">frontend/src/App.jsx</code>.</p>
              <p className="mt-2">Backend signaling lives in <code className="rounded bg-black/30 px-1 py-0.5">backend/server.js</code>.</p>
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-xl sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">How to explain it</p>
            <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300 sm:text-base">
              <p>1. The app opens and gives you a short User ID.</p>
              <p>2. You share that ID with the other person.</p>
              <p>3. One person presses Start Call.</p>
              <p>4. The backend sends the call request.</p>
              <p>5. After Accept, WebRTC sends the audio directly.</p>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-xl sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">In plain words</p>
            <div className="mt-4 rounded-3xl border border-white/10 bg-slate-950/60 p-5">
              <p className="text-sm leading-7 text-slate-200">
                Frontend = screen, buttons, and user actions.
                <br />
                Backend = messenger between two users.
                <br />
                WebRTC = the actual audio pipe.
              </p>
            </div>
            <a
              href="#home"
              className="mt-5 inline-flex rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
            >
              Open Call Page
            </a>
          </section>
        </div>
      </div>
    </div>
  )

  return page === 'how' ? renderHowItWorksPage() : renderHomePage()
}

export default App
