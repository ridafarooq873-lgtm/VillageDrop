import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import User from '../models/User.js'
import Rider from '../models/Rider.js'
import Order from '../models/Order.js'

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
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token
    if (token && process.env.JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET) // { id, role }
        const user = await User.findById(decoded.id).select('role isActive').lean()
        if (!user || !user.isActive || user.role !== decoded.role) {
          return next(new Error('Not authorized'))
        }
        socket.data.user = { id: String(user._id), role: user.role }
      } catch (error) {
        return next(error)
      }
    } else if (token) {
      return next(new Error('Socket authentication is not configured'))
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
    socket.on('join:order', async (orderId) => {
      try {
        if (!user || !mongoose.isValidObjectId(orderId)) return
        let authorized = user.role === 'admin'
        if (user.role === 'customer') {
          authorized = Boolean(await Order.exists({ _id: orderId, customer: user.id }))
        } else if (user.role === 'rider') {
          const rider = await Rider.findOne({ user: user.id }).select('_id').lean()
          authorized = Boolean(rider && await Order.exists({ _id: orderId, rider: rider._id }))
        }
        if (!authorized) return
        socket.join(`order_${String(orderId)}`)
      } catch (error) {
        console.error('[socket] failed to authorize order room:', error)
      }
    })

    socket.on('leave:order', (orderId) => {
      if (orderId) {
        socket.leave(`order_${String(orderId)}`)
        console.log(`[socket] ${socket.id} left order:${orderId}`)
      }
    })

    // Rooms: rider online presence by rider ID
    socket.on('join:rider', async (riderId) => {
      try {
        if (!user || !mongoose.isValidObjectId(riderId)) return
        if (user.role === 'admin') {
          socket.join(`rider:${riderId}`)
          return
        }
        if (user.role !== 'rider') return
        const rider = await Rider.findOne({ user: user.id }).select('_id').lean()
        if (rider && String(rider._id) === String(riderId)) socket.join(`rider:${riderId}`)
      } catch (error) {
        console.error('[socket] failed to authorize rider room:', error)
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
  ioInstance.to(`order_${String(orderId)}`).emit(event, body)
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
