const Order = require('../models/Order');
const Rider = require('../models/Rider');
const Notification = require('../models/Notification');
const { getIO } = require('../config/socket');

// Allowed status transitions for every order
const STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['assigned', 'purchasing', 'picked_up', 'cancelled'],
  assigned: ['purchasing', 'picked_up'],
  purchasing: ['picked_up'],
  picked_up: ['in_transit'],
  in_transit: ['delivered'],
  delivered: [],
  cancelled: []
};

const STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  assigned: 'Rider Assigned',
  purchasing: 'Purchasing Items',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};

const STATUS_MESSAGES = {
  pending: (n) => `Order ${n} has been created and is pending confirmation.`,
  confirmed: (n) => `Order ${n} has been confirmed.`,
  assigned: (n) => `A rider has been assigned to order ${n}.`,
  purchasing: (n) => `Your rider is purchasing items for order ${n}.`,
  picked_up: (n) => `Order ${n} has been picked up.`,
  in_transit: (n) => `Order ${n} is on the way to you.`,
  delivered: (n) => `Order ${n} has been delivered. Please rate your experience!`,
  cancelled: (n) => `Order ${n} has been cancelled.`
};

// Emit to a room on BOTH namespaces (default io and /tracking) so clients
// connected in either style receive the event exactly once per namespace.
const emitToRoom = (room, event, payload) => {
  try {
    const io = getIO();
    io.to(room).emit(event, payload);
    io.of('/tracking').to(room).emit(event, payload);
  } catch (err) {
    // Socket.io not initialized (e.g. during tests) - ignore
  }
};

// Persist + broadcast a notification to the user room and the order room
const pushNotification = async ({ userId, orderId, title, message, type = 'order' }) => {
  if (!userId) return null;
  try {
    const notif = await Notification.create({
      user: userId,
      title,
      message,
      type,
      relatedId: orderId,
      isRead: false
    });

    // Payload shaped for the frontend: id, userId, orderId, message, type, read
    const payload = {
      id: notif._id,
      userId: notif.user,
      orderId: notif.relatedId || null,
      title: notif.title,
      message: notif.message,
      type: notif.type,
      read: notif.isRead,
      createdAt: notif.createdAt
    };

    if (userId) emitToRoom(`user_${userId}`, 'newNotification', payload);
    if (orderId) emitToRoom(`order_${orderId}`, 'notificationUpdate', payload);

    return payload;
  } catch (err) {
    console.error('[notification] failed to push:', err.message);
    return null;
  }
};

// trackingUpdates.location is stored as a String; accept either a plain
// string or a { lat, lng } object (e.g. from the updateLocation socket event).
const normalizeLocation = (location) => {
  if (!location) return undefined;
  if (typeof location === 'string') return location;
  if (typeof location === 'object' && (location.lat != null || location.lng != null)) {
    return `${location.lat ?? ''},${location.lng ?? ''}`;
  }
  return undefined;
};

// Transition an order to a new status, persist it, and emit real-time events.
// opts: { note, location, actor ('customer'|'rider'|'admin'), reason, force }
const applyStatusChange = async (order, newStatus, opts = {}) => {
  const { note, actor = 'system', reason, force = false } = opts;
  const location = normalizeLocation(opts.location);

  if (!force) {
    const allowed = STATUS_TRANSITIONS[order.status] || [];
    if (!allowed.includes(newStatus)) {
      const err = new Error(`Cannot change order status from '${order.status}' to '${newStatus}'`);
      err.statusCode = 400;
      throw err;
    }
  }

  const previousStatus = order.status;
  order.status = newStatus;

  if (newStatus === 'cancelled') {
    order.cancellation = {
      reason: reason || `Cancelled by ${actor}`,
      cancelledBy: actor,
      cancelledAt: Date.now(),
      refundStatus: order.paymentStatus === 'paid' ? 'pending' : 'na'
    };
  }

  if (newStatus === 'delivered') {
    order.actualDeliveryTime = new Date();
  }

  order.trackingUpdates.push({
    status: newStatus,
    note: note || `Status updated to ${STATUS_LABELS[newStatus] || newStatus}`,
    location,
    timestamp: new Date()
  });

  await order.save();

  // Populate for the live payload so the customer UI can render without refetch
  const updatedOrder = await Order.findById(order._id)
    .populate('items')
    .populate({ path: 'rider', populate: { path: 'user', select: 'name phone' } });

  const timestamp = new Date();

  // 1) Generic status event - always emitted
  emitToRoom(`order_${order._id}`, 'orderStatusUpdated', {
    orderId: order._id,
    previousStatus,
    newStatus,
    updatedOrder,
    timestamp
  });

  // 2) Specific lifecycle events
  const specificEvents = {
    confirmed: 'orderAccepted',
    picked_up: 'orderPicked',
    delivered: 'orderDelivered'
  };
  if (specificEvents[newStatus]) {
    emitToRoom(`order_${order._id}`, specificEvents[newStatus], {
      orderId: order._id,
      newStatus,
      updatedOrder,
      timestamp
    });
  }

  // 3) Notifications
  const orderNumber = updatedOrder.orderNumber || String(order._id).slice(-6).toUpperCase();
  const buildMessage = STATUS_MESSAGES[newStatus] || ((n) => `Order ${n} status changed to ${newStatus}.`);

  // Always notify the customer
  await pushNotification({
    userId: order.customer,
    orderId: order._id,
    title: `Order Update (${STATUS_LABELS[newStatus] || newStatus})`,
    message: buildMessage(orderNumber),
    type: 'order'
  });

  // If an assigned rider exists and the customer cancelled (or admin acted),
  // keep the rider in the loop too
  if ((newStatus === 'cancelled' || newStatus === 'delivered') && order.rider) {
    const riderDoc = await Rider.findById(order.rider).populate('user', 'name');
    if (riderDoc && riderDoc.user) {
      await pushNotification({
        userId: riderDoc.user._id,
        orderId: order._id,
        title: `Order Update (${STATUS_LABELS[newStatus] || newStatus})`,
        message: buildMessage(orderNumber),
        type: 'order'
      });
    }
  }

  return updatedOrder;
};

// Convenience: rider accepts a pending order (pending -> confirmed + assign rider)
const acceptOrder = async (order, riderDoc) => {
  order.rider = riderDoc._id;
  return applyStatusChange(order, 'confirmed', {
    actor: 'rider',
    note: 'Rider accepted the order'
  });
};

module.exports = {
  STATUS_TRANSITIONS,
  STATUS_LABELS,
  applyStatusChange,
  acceptOrder,
  pushNotification,
  emitToRoom
};
