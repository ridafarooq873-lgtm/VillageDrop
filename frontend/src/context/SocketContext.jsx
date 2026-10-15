import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from './AuthContext.jsx'

const SocketContext = createContext(null)

/** Every event the backend can emit to a rider or admin socket. */
export const SOCKET_EVENTS = [
  'order:update',
  'delivery:update',
  'assignment:assigned',
  'assignment:removed',
  'approval:update',
  'availability:update',
  'account:update',
  'dispute:update',
]

/**
 * Resolve the socket endpoint. Uses VITE_API_URL's origin when the API is
 * remote, otherwise the current origin (the Vite dev server proxies /socket.io).
 */
function resolveSocketUrl() {
  const base = import.meta.env.VITE_API_URL
  if (!base) return undefined
  try {
    return new URL(base, window.location.origin).origin
  } catch {
    return undefined
  }
}

export function SocketProvider({ children }) {
  const { token, rider, refresh, updateRider } = useAuth()
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [ticks, setTicks] = useState({})

  // Keep the latest auth callbacks without re-running the connect effect
  const handlers = useRef({ refresh, updateRider })
  handlers.current = { refresh, updateRider }

  useEffect(() => {
    if (!token) {
      setSocket(null)
      setConnected(false)
      return undefined
    }

    const s = io(resolveSocketUrl(), {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
    })
    setSocket(s)

    const bump = (event) => setTicks((t) => ({ ...t, [event]: (t[event] || 0) + 1 }))
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)

    s.on('connect', onConnect)
    s.on('disconnect', onDisconnect)
    for (const event of SOCKET_EVENTS) s.on(event, () => bump(event))

    // Live account changes pushed by admins apply to the rider shell instantly
    s.on('approval:update', () => handlers.current.refresh())
    s.on('account:update', () => handlers.current.refresh())
    s.on('availability:update', (payload) => handlers.current.updateRider(payload))

    return () => {
      s.removeAllListeners()
      s.disconnect()
      setSocket(null)
      setConnected(false)
    }
  }, [token])

  // Join the rider's personal room so assignment/approval events reach them
  useEffect(() => {
    if (!socket || !connected || !rider?._id) return undefined
    socket.emit('join:rider', rider._id)
    return () => socket.emit('leave:rider', rider._id)
  }, [socket, connected, rider?._id])

  const value = useMemo(() => ({ socket, connected, ticks }), [socket, connected, ticks])
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

export function useSocket() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within a SocketProvider')
  return ctx
}

/**
 * A number that changes whenever any of the given events fire. Use it as an
 * effect dependency to refetch data live. With no arguments it tracks all
 * events.
 */
export function useRealtimeTick(...events) {
  const { ticks } = useSocket()
  if (events.length === 0) {
    return Object.values(ticks).reduce((sum, n) => sum + n, 0)
  }
  return events.reduce((sum, event) => sum + (ticks[event] || 0), 0)
}

/**
 * Join one or more order rooms while the component is mounted, so the client
 * receives `order:update` events for those orders.
 * @param {Array<string>} orderIds
 */
export function useOrderRooms(orderIds) {
  const { socket, connected } = useSocket()
  const key = (orderIds || []).map(String).filter(Boolean).join(',')

  useEffect(() => {
    if (!socket || !connected || !key) return undefined
    const ids = key.split(',')
    for (const id of ids) socket.emit('join:order', id)
    return () => {
      for (const id of ids) socket.emit('leave:order', id)
    }
  }, [socket, connected, key])
}
