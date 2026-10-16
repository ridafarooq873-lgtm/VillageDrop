import express from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { protect } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import Order from '../models/Order.js'
import OrderItem from '../models/OrderItem.js'
import Review from '../models/Review.js'
import Complaint from '../models/Complaint.js'
import Notification from '../models/Notification.js'
import generatePin from '../utils/generatePin.js'
import calculateFee from '../utils/calculateFee.js'
import { emitOrderEvent } from '../config/socket.js'

const router = express.Router()

const STATUS_MAP = {
  accepted_by_shop: 'confirmed',
  ready_for_pickup: 'confirmed',
  assigned_to_rider: 'assigned',
  out_for_delivery: 'in_transit',
}

function presentOrder(order, items = []) {
  const value = order.toObject ? order.toObject() : order
  return {
    ...value,
    status: STATUS_MAP[value.status] || value.status,
    orderType: value.orderType === 'assisted_purchase' ? 'rider_assisted_purchase' : 'pickup_delivery',
    totalAmount: value.total,
    pickup: {
      address: value.shopAddress?.street || '',
      landmark: value.shopAddress?.landmark || '',
      contactName: value.shopAddress?.contactName || value.shop?.name || '',
      contactPhone: value.shopAddress?.phone || value.shop?.phone || '',
      instructions: value.shopAddress?.instructions || '',
    },
    delivery: {
      address: value.deliveryAddress?.street || '',
      landmark: value.deliveryAddress?.landmark || '',
      contactName: value.deliveryAddress?.name || '',
      contactPhone: value.deliveryAddress?.phone || '',
      instructions: value.deliveryAddress?.instructions || '',
    },
    purchaseDetails: {
      instructions: value.purchaseNotes || value.notes || '',
      estimatedItemCost: value.subtotal,
      actualItemCost: value.purchaseAmount,
    },
    trackingUpdates: (value.statusHistory || []).map((entry) => ({
      status: STATUS_MAP[entry.status] || entry.status,
      note: entry.note,
      timestamp: entry.at,
    })),
    items: items.map((item) => ({
      ...item,
      name: item.productName,
      category: item.category || 'parcel',
      weight: item.weight || 0,
      fragile: item.fragile || false,
    })),
  }
}

async function loadCustomerOrder(orderId, customerId, includeDeliveryPin = false) {
  let query = Order.findOne({ _id: orderId, customer: customerId })
    .populate('rider', 'riderId vehicleType')
    .populate({ path: 'rider', populate: { path: 'user', select: 'name phone' } })
    .populate('shop', 'name phone')
  if (includeDeliveryPin) query = query.select('+pickupPin +deliveryPin')
  const order = await query.lean()
  if (!order) return null
  const items = await OrderItem.find({ order: order._id }).lean()
  return presentOrder(order, items)
}

router.get(
  '/',
  protect,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const [totalOrders, activeOrders, deliveredOrders, recentOrders] = await Promise.all([
      Order.countDocuments({ customer: req.user.id }),
      Order.countDocuments({
        customer: req.user.id,
        status: { $in: ['pending', 'accepted_by_shop', 'ready_for_pickup', 'assigned_to_rider', 'picked_up', 'out_for_delivery'] },
      }),
      Order.countDocuments({ customer: req.user.id, status: 'delivered' }),
      Order.find({ customer: req.user.id }).sort({ createdAt: -1 }).limit(5).lean(),
    ])
    res.json({
      data: {
        totalOrders,
        activeOrders,
        deliveredOrders,
        recentOrders: recentOrders.map((order) => presentOrder(order)),
      },
    })
  })
)

router.post(
  '/orders',
  protect,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const { orderType, pickup, delivery, purchaseDetails, items = [], paymentMethod = 'cod' } = req.body
    if (!pickup?.address?.trim() || !delivery?.address?.trim()) {
      return res.status(400).json({ message: 'Pickup and delivery addresses are required' })
    }
    const isPurchase = orderType === 'rider_assisted_purchase'
    if (isPurchase && !purchaseDetails?.instructions?.trim()) {
      return res.status(400).json({ message: 'Purchase instructions are required' })
    }
    if (!isPurchase && (!Array.isArray(items) || items.length === 0 || items.some((item) => !item.name?.trim()))) {
      return res.status(400).json({ message: 'At least one named package item is required' })
    }
    if (!['cod', 'card', 'wallet'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'Invalid payment method' })
    }
    const purchaseCost = isPurchase ? Math.max(0, Number(purchaseDetails?.estimatedItemCost) || 0) : 0
    const deliveryFee = calculateFee({})
    const order = await Order.create({
      customer: req.user.id,
      subtotal: purchaseCost,
      deliveryFee,
      total: purchaseCost + deliveryFee,
      paymentMethod,
      deliveryAddress: {
        name: delivery.contactName?.trim(),
        phone: delivery.contactPhone?.trim(),
        street: delivery.address.trim(),
        landmark: delivery.landmark?.trim(),
        instructions: delivery.instructions?.trim(),
      },
      shopAddress: {
        street: pickup.address.trim(),
        landmark: pickup.landmark?.trim(),
        contactName: pickup.contactName?.trim(),
        phone: pickup.contactPhone?.trim(),
        instructions: pickup.instructions?.trim(),
      },
      status: 'pending',
      statusHistory: [{ status: 'pending', by: req.user.id, note: 'Order created', at: new Date() }],
      orderType: isPurchase ? 'assisted_purchase' : 'standard',
      requiresPurchase: isPurchase,
      purchaseStatus: isPurchase ? 'pending' : 'not_required',
      purchaseNotes: purchaseDetails?.instructions?.trim() || '',
      pickupPin: generatePin(4),
      deliveryPin: generatePin(4),
    })

    const requestedItems = isPurchase
      ? [{ name: purchaseDetails.instructions.trim(), quantity: 1 }]
      : items
    const savedItems = await OrderItem.insertMany(requestedItems.map((item) => ({
          order: order._id,
          productName: item.name.trim(),
          quantity: Math.max(1, Number(item.quantity) || 1),
          price: 0,
          total: 0,
          description: item.description?.trim() || '',
          category: item.category || 'parcel',
          weight: Math.max(0, Number(item.weight) || 0),
          fragile: Boolean(item.fragile),
        })))
    const result = await loadCustomerOrder(order._id, req.user.id, true)
    result.items = savedItems.map((item) => ({
      ...item.toObject(),
      name: item.productName,
      category: item.category,
      weight: item.weight,
      fragile: item.fragile,
    }))
    emitOrderEvent(order._id, 'order:update', { status: order.status })
    res.status(201).json({ message: 'Order created successfully', data: result })
  })
)

router.get(
  '/orders',
  protect,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const orders = await Order.find({ customer: req.user.id })
      .populate('shop', 'name phone')
      .sort({ createdAt: -1 })
      .limit(Math.min(100, Math.max(1, Number(req.query.limit) || 100)))
      .lean()
    const results = await Promise.all(orders.map(async (order) => {
      const items = await OrderItem.find({ order: order._id }).lean()
      return presentOrder(order, items)
    }))
    res.json({ data: results })
  })
)

router.get(
  '/orders/:orderId',
  protect,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const order = await loadCustomerOrder(req.params.orderId, req.user.id, true)
    if (!order) return res.status(404).json({ message: 'Order not found' })
    res.json({ data: order })
  })
)

router.put(
  '/orders/:orderId/cancel',
  protect,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const order = await Order.findOne({ _id: req.params.orderId, customer: req.user.id })
    if (!order) return res.status(404).json({ message: 'Order not found' })
    if (!['pending', 'accepted_by_shop', 'ready_for_pickup'].includes(order.status) || order.rider) {
      return res.status(409).json({ message: 'This order can no longer be cancelled' })
    }
    order.status = 'cancelled'
    order.statusHistory.push({
      status: 'cancelled',
      by: req.user.id,
      note: String(req.body.reason || '').trim(),
      at: new Date(),
    })
    await order.save()
    const result = await loadCustomerOrder(order._id, req.user.id)
    emitOrderEvent(order._id, 'order:update', { status: order.status })
    res.json({ message: 'Order cancelled', data: result })
  })
)

router.post(
  '/orders/:orderId/reviews',
  protect,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const order = await Order.findOne({ _id: req.params.orderId, customer: req.user.id, status: 'delivered' })
    if (!order) return res.status(404).json({ message: 'Delivered order not found' })
    const rating = Number(req.body.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' })
    }
    const existing = await Review.findOne({ order: order._id, customer: req.user.id })
    if (existing) return res.status(409).json({ message: 'A review has already been submitted' })
    const review = await Review.create({
      order: order._id,
      customer: req.user.id,
      rider: order.rider || undefined,
      shop: order.shop || undefined,
      rating,
      comment: String(req.body.comment || '').trim(),
    })
    res.status(201).json({ message: 'Review submitted', data: review })
  })
)

router.get(
  '/reviews',
  protect,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const reviews = await Review.find({ customer: req.user.id }).sort({ createdAt: -1 }).lean()
    res.json({ data: reviews })
  })
)

router.post(
  '/complaints',
  protect,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const { subject, description, orderId } = req.body
    if (!subject?.trim() || !description?.trim()) {
      return res.status(400).json({ message: 'Subject and description are required' })
    }
    if (orderId && !(await Order.exists({ _id: orderId, customer: req.user.id }))) {
      return res.status(404).json({ message: 'Order not found' })
    }
    const complaint = await Complaint.create({
      order: orderId || undefined,
      raisedBy: req.user.id,
      subject: subject.trim(),
      description: description.trim(),
    })
    res.status(201).json({ data: complaint })
  })
)

router.get(
  '/complaints',
  protect,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const complaints = await Complaint.find({ raisedBy: req.user.id }).sort({ createdAt: -1 }).lean()
    res.json({ data: complaints })
  })
)

router.get(
  '/notifications',
  protect,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const notifications = await Notification.find({ recipient: req.user.id }).sort({ createdAt: -1 }).lean()
    res.json({ data: notifications })
  })
)

router.put(
  '/notifications/:notificationId/read',
  protect,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, recipient: req.user.id },
      { $set: { isRead: true } },
      { new: true }
    )
    if (!notification) return res.status(404).json({ message: 'Notification not found' })
    res.json({ data: notification })
  })
)

export default router
