/**
 * Emit order status update to relevant rooms.
 * @param {import('socket.io').Server} io
 * @param {string} orderId
 * @param {object} payload
 */
export function emitOrderUpdate(io, orderId, payload) {
  if (!io || !orderId) return
  io.to(orderId).emit('order:update', { orderId, ...payload })
}

/**
 * Notify a specific rider.
 * @param {import('socket.io').Server} io
 * @param {string} riderId
 * @param {object} payload
 */
export function notifyRider(io, riderId, payload) {
  if (!io || !riderId) return
  io.to(`rider:${riderId}`).emit('rider:notify', { riderId, ...payload })
}

export default { emitOrderUpdate, notifyRider }
