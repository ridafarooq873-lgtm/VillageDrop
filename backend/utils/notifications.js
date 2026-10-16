import Notification from '../models/Notification.js'
import Rider from '../models/Rider.js'
import User from '../models/User.js'
import { emitUserEvent } from '../config/socket.js'

/** Human-readable labels for order statuses. */
export const ORDER_STATUS_LABEL = {
  pending: 'Pending',
  accepted_by_shop: 'Accepted by shop',
  ready_for_pickup: 'Ready for pickup',
  assigned_to_rider: 'Rider assigned',
  picked_up: 'Picked up',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
}

/** Accept either an ObjectId, a string, or a populated document. */
const idOf = (v) => {
  if (!v) return null
  if (typeof v === 'object' && v._id) return String(v._id)
  return String(v)
}

export function serializeNotification(n) {
  return {
    _id: n._id,
    type: n.type,
    title: n.title,
    message: n.message,
    isRead: n.isRead,
    metadata: n.metadata,
    createdAt: n.createdAt,
  }
}

/**
 * Persist a notification and push it live to the recipient's personal room.
 * @param {string} recipient User id
 */
export async function createNotification(recipient, { type = 'system', title, message, metadata } = {}) {
  const userId = idOf(recipient)
  if (!userId || !title || !message) return null
  try {
    const n = await Notification.create({ recipient: userId, type, title, message, metadata })
    emitUserEvent(userId, 'notification', serializeNotification(n))
    return n
  } catch (err) {
    console.error('[notifications] failed to create notification:', err.message)
    return null
  }
}

/**
 * Notify the customer (always) and the assigned rider (unless the rider
 * performed the change themselves) that an order changed status.
 * @param {import('mongoose').Document} order
 * @param {string} status
 */
export async function notifyOrderStatus(order, status, { note, notifyRider = true } = {}) {
  if (!order) return null
  const label = ORDER_STATUS_LABEL[status] || status
  const no = order.orderNumber || ''
  const metadata = { orderId: String(order._id), status }
  const jobs = []

  if (order.customer) {
    const base = no ? `Order ${no} is now ${label}.` : `Your order is now ${label}.`
    jobs.push(
      createNotification(idOf(order.customer), {
        type: 'order',
        title: no ? `Order ${no}` : 'Order update',
        message: note ? `${base} ${note}` : base,
        metadata,
      }),
    )
  }

  if (notifyRider && order.rider) {
    jobs.push(
      notifyRiderUser(idOf(order.rider), {
        type: 'delivery',
        title: no ? `Delivery ${no}` : 'Delivery update',
        message: no ? `Order ${no} is now ${label}.` : `Order is now ${label}.`,
        metadata,
      }),
    )
  }

  return Promise.all(jobs)
}

/** Notify a rider's user account. */
export async function notifyRiderUser(riderId, { type = 'delivery', title, message, metadata } = {}) {
  const rider = await Rider.findById(idOf(riderId)).select('user').lean()
  if (!rider?.user) return null
  return createNotification(rider.user, { type, title, message, metadata })
}

/** Notify a rider's user account (approval/suspension notices). */
export async function notifyRiderAccount(riderId, { title, message, approvalStatus }) {
  return notifyRiderUser(riderId, {
    type: 'approval',
    title,
    message,
    metadata: { approvalStatus },
  })
}

/** Notify every active admin. */
export async function notifyAdmins({ type = 'system', title, message, metadata } = {}) {
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean()
  return Promise.all(admins.map((a) => createNotification(a._id, { type, title, message, metadata })))
}
