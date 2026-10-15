import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'

let ioInstance = null

/** Room that every authenticated admin socket joins (global operations feed). */
export const ADMIN_ROOM = 'admins'

/** Personal room for a user account (where notifications are delivered). */
export const userRoom = (userId) => `user:${userId}`

/**
 * Initialize Socket.IO with CORS settings.
 *
 * The handshake accepts an optional JWT via `auth.token` (or `?token=`).
 * A valid admin token automatically joins the operations room so admin
 * screens receive every order/rider event; rider tokens join their own
 * `rider:<id>` room when the client asks for it.
 *
 * @param {import('http').Server} httpServer
 * @param {{origin?: string}} options
 */
export function initSocket(httpServer, { origin = process.env.CLIENT_URL || '*' } = {}) {
  const io = new Server(httpServer, {
    cors: {
      origin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  })

  ioInstance = io

  // Best-effort handshake authentication (unauthenticated use still allowed
  // for public order tracking, but privileged rooms require a valid token).
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token
    if (token && process.env.JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET) // { id, role }
        socket.data.user = { id: decoded.id, role: decoded.role }
      } catch {
        // Invalid/expired token: treat as anonymous, keep the connection.
      }
    }
    next()
  })

  io.on('connection', (socket) => {
    const user = socket.data?.user
    console.log(`[socket] client connected: ${socket.id}${user ? ` (${user.role})` : ''}`)

    // Admins get the global feed automatically
    if (user?.role === 'admin') socket.join(ADMIN_ROOM)

    // Every authenticated user joins their personal room for notifications
    if (user?.id) socket.join(userRoom(user.id))

    // Rooms: order-based for tracking
    socket.on('join:order', (orderId) => {
      if (orderId) {
        socket.join(String(orderId))
        console.log(`[socket] ${socket.id} joined order:${orderId}`)
      }
    })

    socket.on('leave:order', (orderId) => {
      if (orderId) {
        socket.leave(String(orderId))
        console.log(`[socket] ${socket.id} left order:${orderId}`)
      }
    })

    // Rooms: rider online presence by rider ID
    socket.on('join:rider', (riderId) => {
      if (riderId) {
        socket.join(`rider:${riderId}`)
      }
    })

    socket.on('leave:rider', (riderId) => {
      if (riderId) {
        socket.leave(`rider:${riderId}`)
      }
    })

    // Admins-only operations feed (also auto-joined above)
    socket.on('join:admins', () => {
      if (socket.data.user?.role === 'admin') socket.join(ADMIN_ROOM)
    })

    socket.on('leave:admins', () => {
      socket.leave(ADMIN_ROOM)
    })

    socket.on('disconnect', () => {
      console.log(`[socket] client disconnected: ${socket.id}`)
    })
  })

  return io
}

/** @returns {import('socket.io').Server|null} */
export function getIO() {
  return ioInstance
}

/**
 * Emit an event to everyone watching a specific order room, plus the global
 * admin operations feed so monitoring screens stay live.
 * @param {string} orderId
 * @param {string} event
 * @param {object} payload
 */
export function emitOrderEvent(orderId, event, payload = {}) {
  if (!ioInstance || !orderId) return
  const body = { orderId: String(orderId), ...payload }
  ioInstance.to(String(orderId)).emit(event, body)
  ioInstance.to(ADMIN_ROOM).emit(event, body)
}

/**
 * Emit an event to a specific rider room, plus the admin operations feed
 * (approvals, availability, assignment changes are useful operationally).
 * @param {string} riderId
 * @param {string} event
 * @param {object} payload
 */
export function emitRiderEvent(riderId, event, payload = {}) {
  if (!ioInstance || !riderId) return
  const body = { riderId: String(riderId), ...payload }
  ioInstance.to(`rider:${riderId}`).emit(event, body)
  ioInstance.to(ADMIN_ROOM).emit(event, body)
}

/**
 * Emit an event to a single user's personal room (notifications).
 * @param {string} userId
 * @param {string} event
 * @param {object} payload
 */
export function emitUserEvent(userId, event, payload = {}) {
  if (!ioInstance || !userId) return
  ioInstance.to(userRoom(userId)).emit(event, payload)
}
