import express from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { protect } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import Rider from '../models/Rider.js'
import Order from '../models/Order.js'
import OrderItem from '../models/OrderItem.js'
import User from '../models/User.js'
import Shop from '../models/Shop.js'
import Payout from '../models/Payout.js'
import generatePin from '../utils/generatePin.js'
import { upload, publicUrl } from '../middleware/upload.js'
import { getFeeConfig } from '../utils/feeConfig.js'
import { summarizeEarnings, sumRows } from '../utils/earnings.js'
import { emitOrderEvent, emitRiderEvent } from '../config/socket.js'

const router = express.Router()

/**
 * Load the logged-in rider and the order, verifying the rider owns it.
 * Sends the appropriate error response and returns null when invalid.
 */
async function getRiderAndOwnedOrder(req, res) {
  const rider = await Rider.findOne({ user: req.user.id })
  if (!rider) {
    res.status(404).json({ message: 'Rider profile not found' })
    return null
  }
  const order = await Order.findById(req.params.orderId)
  if (!order) {
    res.status(404).json({ message: 'Order not found' })
    return null
  }
  if (!order.rider || order.rider.toString() !== rider._id.toString()) {
    res.status(403).json({ message: 'You are not assigned to this order' })
    return null
  }
  return { rider, order }
}


/**
 * @route GET /api/riders/me/profile
 * @desc Get rider profile for authenticated rider
 */
router.get(
  '/me/profile',
  protect,
  requireRole('rider'),
  asyncHandler(async (req, res) => {
    const rider = await Rider.findOne({ user: req.user.id }).lean()
    if (!rider) {
      return res.status(404).json({ message: 'Rider profile not found' })
    }
    res.json(rider)
  })
)

/**
 * @route PUT /api/riders/me/profile
 * @desc Update rider profile (limited fields)
 */
router.put(
  '/me/profile',
  protect,
  requireRole('rider'),
  asyncHandler(async (req, res) => {
    const allowed = ['vehicleType', 'licenseNumber', 'nicNumber', 'bankDetails']
    const updates = {}
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }

    const rider = await Rider.findOneAndUpdate({ user: req.user.id }, updates, { new: true })
    if (!rider) {
      return res.status(404).json({ message: 'Rider profile not found' })
    }
    res.json({ message: 'Profile updated successfully', rider })
  })
)

/**
 * @route PUT /api/riders/me/availability
 * @desc Update online/offline and availability status
 */
router.put(
  '/me/availability',
  protect,
  requireRole('rider'),
  asyncHandler(async (req, res) => {
    const { isOnline, availabilityStatus, location } = req.body

    const rider = await Rider.findOne({ user: req.user.id })
    if (!rider) {
      return res.status(404).json({ message: 'Rider profile not found' })
    }

    // Approval check - cannot go online until approved
    if (!rider.isApproved || rider.approvalStatus !== 'approved') {
      return res.status(403).json({
        message: 'Your account is not approved yet. You cannot go online.',
        approvalStatus: rider.approvalStatus,
      })
    }

    if (typeof isOnline === 'boolean') {
      rider.isOnline = isOnline
      if (!isOnline) {
        rider.availabilityStatus = 'offline'
      } else if (rider.availabilityStatus === 'offline' || !rider.availabilityStatus) {
        rider.availabilityStatus = 'available'
      }
    }

    if (availabilityStatus && ['available', 'busy', 'offline'].includes(availabilityStatus)) {
      rider.availabilityStatus = availabilityStatus
      if (availabilityStatus === 'offline') {
        rider.isOnline = false
      } else {
        rider.isOnline = true
      }
    }

    if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
      rider.location = {
        lat: location.lat,
        lng: location.lng,
        lastUpdated: new Date(),
      }
    }

    await rider.save()

    res.json({
      message: 'Availability updated successfully',
      rider: {
        _id: rider._id,
        user: rider.user,
        isOnline: rider.isOnline,
        availabilityStatus: rider.availabilityStatus,
        location: rider.location,
        isApproved: rider.isApproved,
        approvalStatus: rider.approvalStatus,
      },
    })
  })
)

/**
 * @route GET /api/riders/me/approval-status
 * @desc Check current approval state
 */
router.get(
  '/me/approval-status',
  protect,
  requireRole('rider'),
  asyncHandler(async (req, res) => {
    const rider = await Rider.findOne({ user: req.user.id })
      .select('isApproved approvalStatus rejectionReason approvedAt')
      .lean()
    if (!rider) {
      return res.status(404).json({ message: 'Rider profile not found' })
    }
    res.json(rider)
  })
)

/**
 * @route GET /api/riders/available-requests
 * @desc Get available delivery requests (orders ready for pickup / pending assignment)
 */
router.get(
  '/available-requests',
  protect,
  requireRole('rider'),
  asyncHandler(async (req, res) => {
    const rider = await Rider.findOne({ user: req.user.id })
    if (!rider) {
      return res.status(404).json({ message: 'Rider profile not found' })
    }

    if (!rider.isApproved || rider.approvalStatus !== 'approved') {
      return res.status(403).json({
        message: 'You cannot view available requests until approved.',
        approvalStatus: rider.approvalStatus,
      })
    }

    // Hide orders this rider has already rejected
    const orders = await Order.find({
      status: { $in: ['ready_for_pickup', 'accepted_by_shop', 'pending'] },
      rider: null,
      'rejections.rider': { $ne: rider._id },
    })
      .populate('customer', 'name phone address')
      .populate('shop', 'name phone address')
      .sort({ createdAt: -1 })
      .lean()

    res.json(orders)
  })
)

/**
 * @route POST /api/riders/me/reject-request/:orderId
 * @desc Reject / decline an available delivery request
 * @body { reason?: string }
 */
router.post(
  '/me/reject-request/:orderId',
  protect,
  requireRole('rider'),
  asyncHandler(async (req, res) => {
    const { orderId } = req.params
    const { reason } = req.body

    const rider = await Rider.findOne({ user: req.user.id })
    if (!rider) {
      return res.status(404).json({ message: 'Rider profile not found' })
    }

    const order = await Order.findById(orderId)
    if (!order) {
      return res.status(404).json({ message: 'Order not found' })
    }

    // Cannot reject an order already assigned to you or another rider
    if (order.rider && order.rider.toString() === rider._id.toString()) {
      return res.status(400).json({ message: 'You already accepted this order' })
    }
    if (order.rider && order.rider.toString() !== rider._id.toString()) {
      return res.status(409).json({ message: 'Order already assigned to another rider' })
    }

    // Already rejected by this rider?
    const already = order.rejections?.some((r) => r.rider?.toString() === rider._id.toString())
    if (!already) {
      order.rejections = order.rejections || []
      order.rejections.push({ rider: rider._id, reason: reason?.trim() || '', at: new Date() })
      await order.save()
    }

    res.json({ message: 'Request rejected successfully', orderId: order._id })  })
)

/**
 * @route POST /api/riders/me/accept-request/:orderId
 * @desc Accept an available delivery request
 */
router.post(
  '/me/accept-request/:orderId',
  protect,
  requireRole('rider'),
  asyncHandler(async (req, res) => {
    const { orderId } = req.params
    const rider = await Rider.findOne({ user: req.user.id })
    if (!rider) {
      return res.status(404).json({ message: 'Rider profile not found' })
    }

    if (!rider.isApproved || rider.approvalStatus !== 'approved') {
      return res.status(403).json({ message: 'Cannot accept requests until approved.' })
    }

    if (!rider.isOnline || rider.availabilityStatus !== 'available') {
      return res
        .status(403)
        .json({ message: 'You must be online and available to accept requests.' })
    }

    const order = await Order.findById(orderId)
    if (!order) {
      return res.status(404).json({ message: 'Order not found' })
    }

    // Order must be unassigned and in acceptable state
    if (order.rider) {
      return res.status(409).json({ message: 'Order already assigned to another rider' })
    }

    if (!['pending', 'accepted_by_shop', 'ready_for_pickup', 'assigned_to_rider'].includes(order.status)) {
      return res.status(400).json({ message: 'Order is not available for assignment' })
    }

    // Assign rider and update status
    order.rider = rider._id
    order.status = 'assigned_to_rider'
    order.acceptedAt = new Date()
    order.statusHistory = order.statusHistory || []
    order.statusHistory.push({
      status: 'assigned_to_rider',
      by: req.user.id,
      note: `Accepted by rider ${rider.riderId || rider._id}`,
      at: new Date(),
    })

    // Generate pickup/delivery PINs if not present
    if (!order.pickupPin) order.pickupPin = generatePin(4)
    if (!order.deliveryPin) order.deliveryPin = generatePin(4)

    await order.save()

    // Mark rider as busy
    rider.availabilityStatus = 'busy'
    await rider.save()

    const populated = await Order.findById(order._id)
      .populate('customer', 'name phone address')
      .populate('shop', 'name phone address')
      .populate('rider', 'riderId')
      .lean()

    // Broadcast: order taken so other riders drop it from their list
    emitOrderEvent(order._id, 'order:update', { status: order.status })
    emitRiderEvent(rider._id, 'request:accepted', { order: populated })

    res.json({
      message: 'Order accepted successfully',
      order: populated,
    })
  })
)

/**
 * @route PUT /api/riders/me/order/:orderId/status
 * @desc Progress order status. Allowed transitions (strict order):
 *        assigned_to_rider -> picked_up -> out_for_delivery -> delivered
 * @body { status, pickupPin?, deliveryPin?, note? }
 */
// Allowed forward transitions from a given status
const STATUS_FLOW = {
  assigned_to_rider: ['picked_up'],
  picked_up: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
}

router.put(
  '/me/order/:orderId/status',
  protect,
  requireRole('rider'),
  asyncHandler(async (req, res) => {
    const { orderId } = req.params
    const { status, pickupPin, deliveryPin, note } = req.body

    const rider = await Rider.findOne({ user: req.user.id })
    if (!rider) {
      return res.status(404).json({ message: 'Rider profile not found' })
    }

    const order = await Order.findById(orderId)
    if (!order) {
      return res.status(404).json({ message: 'Order not found' })
    }

    if (!order.rider || order.rider.toString() !== rider._id.toString()) {
      return res.status(403).json({ message: 'You are not assigned to this order' })
    }

    const allowedNext = STATUS_FLOW[order.status] || []
    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        message: `Cannot move order from '${order.status}' to '${status}'. Allowed: ${allowedNext.join(', ') || 'none (terminal)'}`,
      })
    }

    const now = new Date()

    // Validate PINs based on transition
    if (status === 'picked_up') {
      if (order.requiresPurchase) {
        // Assisted purchase: the purchase must be completed first; no pickup PIN needed
        if (order.purchaseStatus !== 'completed') {
          return res.status(400).json({
            message:
              'Complete the assisted purchase first (confirm items and upload the receipt) before marking as picked up.',
          })
        }
      } else {
        if (!pickupPin) {
          return res.status(400).json({ message: 'Pickup PIN is required' })
        }
        if (order.pickupPin && order.pickupPin !== pickupPin) {
          return res.status(400).json({ message: 'Invalid pickup PIN' })
        }
      }
      order.pickedUpAt = now
    }

    if (status === 'out_for_delivery') {
      order.outForDeliveryAt = now
    }

    if (status === 'delivered') {
      if (!deliveryPin) {
        return res.status(400).json({ message: 'Delivery PIN is required' })
      }
      if (order.deliveryPin && order.deliveryPin !== deliveryPin) {
        return res.status(400).json({ message: 'Invalid delivery PIN' })
      }
      order.deliveredAt = now
      // Lock rider earning figures at the commission rate in effect now
      const rate = Number(getFeeConfig().commissionRate) || 0
      const gross = Number(order.deliveryFee) || 0
      order.riderEarning = {
        gross,
        commission: Math.round(gross * rate),
        net: gross - Math.round(gross * rate),
        rate,
        computedAt: now,
      }
      // Update rider stats and free the rider back to available
      rider.totalDeliveries += 1
      rider.completedDeliveries += 1
      rider.availabilityStatus = 'available'
      rider.isOnline = true
      await rider.save()
    }

    order.status = status
    order.statusHistory = order.statusHistory || []
    order.statusHistory.push({ status, by: req.user.id, note: note || '', at: now })
    await order.save()

    emitOrderEvent(order._id, 'order:update', { status: order.status })
    emitRiderEvent(rider._id, 'delivery:update', { orderId: order._id, status: order.status })

    const populated = await Order.findById(order._id)
      .populate('customer', 'name phone address')
      .populate('shop', 'name phone address')
      .lean()

    res.json({ message: `Order marked as ${status}`, order: populated })
  })
)

/**
 * @route GET /api/riders/me/active-deliveries
 * @desc Get active deliveries for logged-in rider
 */
router.get(
  '/me/active-deliveries',
  protect,
  requireRole('rider'),
  asyncHandler(async (req, res) => {
    const rider = await Rider.findOne({ user: req.user.id })
    if (!rider) {
      return res.status(404).json({ message: 'Rider profile not found' })
    }

    const orders = await Order.find({
      rider: rider._id,
      status: { $in: ['assigned_to_rider', 'picked_up', 'out_for_delivery'] },
    })
      .populate('customer', 'name phone address')
      .populate('shop', 'name phone address')
      .sort({ updatedAt: -1 })
      .lean()

    res.json(orders)
  })
)

/**
 * @route GET /api/riders/me/completed-deliveries
 * @desc Get completed deliveries for logged-in rider
 */
router.get(
  '/me/completed-deliveries',
  protect,
  requireRole('rider'),
  asyncHandler(async (req, res) => {
    const rider = await Rider.findOne({ user: req.user.id })
    if (!rider) {
      return res.status(404).json({ message: 'Rider profile not found' })
    }

    const orders = await Order.find({
      rider: rider._id,
      status: 'delivered',
    })
      .populate('customer', 'name phone address')
      .populate('shop', 'name phone address')
      .sort({ deliveredAt: -1 })
      .lean()

    res.json(orders)
  })
)

/**
 * @route GET /api/riders/me/order/:orderId
 * @desc Get a single assigned order with its items (used by the purchase workflow)
 */
router.get(
  '/me/order/:orderId',
  protect,
  requireRole('rider'),
  asyncHandler(async (req, res) => {
    const ctx = await getRiderAndOwnedOrder(req, res)
    if (!ctx) return
    const { order } = ctx
    const items = await OrderItem.find({ order: order._id }).lean()
    res.json({ order, items })
  })
)

/**
 * @route POST /api/riders/me/order/:orderId/purchase/items
 * @desc Item purchase confirmation for a rider-assisted purchase
 * @body { items: [{ itemId, purchasedQuantity, isAvailable, actualPrice, note }], notes? }
 */
router.post(
  '/me/order/:orderId/purchase/items',
  protect,
  requireRole('rider'),
  asyncHandler(async (req, res) => {
    const ctx = await getRiderAndOwnedOrder(req, res)
    if (!ctx) return
    const { order } = ctx

    if (!order.requiresPurchase) {
      return res.status(400).json({ message: 'This order does not require a purchase' })
    }
    if (['picked_up', 'out_for_delivery', 'delivered'].includes(order.status)) {
      return res.status(400).json({ message: 'Items can no longer be changed at this stage' })
    }

    const { items, notes } = req.body
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'An items array is required' })
    }

    const orderItems = await OrderItem.find({ order: order._id })
    if (orderItems.length === 0) {
      return res.status(400).json({ message: 'No items found for this order' })
    }

    let matched = 0
    for (const input of items) {
      const id = input.itemId || input._id
      const doc = orderItems.find((oi) => oi._id.toString() === String(id))
      if (!doc) continue
      matched += 1

      if (input.isAvailable === false) {
        doc.isAvailable = false
        doc.purchasedQuantity = 0
      } else {
        doc.isAvailable = true
        const qty = Number(input.purchasedQuantity)
        doc.purchasedQuantity = Number.isFinite(qty) && qty >= 0 ? qty : doc.quantity
      }

      if (input.actualPrice !== undefined) {
        const price = Number(input.actualPrice)
        doc.actualPrice = Number.isFinite(price) && price >= 0 ? price : doc.price
      }

      if (input.note !== undefined) doc.purchaseNote = String(input.note).trim()
      doc.confirmed = true
      doc.confirmedAt = new Date()
      doc.total = doc.purchasedQuantity * (doc.actualPrice || 0)
      await doc.save()
    }

    if (matched === 0) {
      return res.status(400).json({ message: 'No matching items were found for this order' })
    }

    order.purchaseStatus = 'items_confirmed'
    order.itemsConfirmedAt = new Date()
    if (notes !== undefined) order.purchaseNotes = String(notes).trim()
    order.statusHistory = order.statusHistory || []
    order.statusHistory.push({
      status: 'purchase_items_confirmed',
      by: req.user.id,
      note: `${matched} item(s) confirmed`,
      at: new Date(),
    })
    await order.save()

    const savedItems = await OrderItem.find({ order: order._id }).lean()
    res.json({ message: 'Purchased items confirmed', purchaseStatus: order.purchaseStatus, items: savedItems })
  })
)

/**
 * @route POST /api/riders/me/order/:orderId/purchase/receipt
 * @desc Upload receipt + record the actual purchase amount (multipart form: receipt, amount, notes)
 */
router.post(
  '/me/order/:orderId/purchase/receipt',
  protect,
  requireRole('rider'),
  upload.single('receipt'),
  asyncHandler(async (req, res) => {
    const ctx = await getRiderAndOwnedOrder(req, res)
    if (!ctx) return
    const { rider, order } = ctx

    if (!order.requiresPurchase) {
      return res.status(400).json({ message: 'This order does not require a purchase' })
    }
    if (!['items_confirmed', 'completed'].includes(order.purchaseStatus)) {
      return res.status(400).json({ message: 'Confirm the purchased items before recording the receipt' })
    }

    const amount = Number(req.body.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'A valid purchase amount is required' })
    }
    if (!req.file) {
      return res.status(400).json({ message: 'A receipt file is required' })
    }

    order.purchaseAmount = amount
    order.receiptUrl = publicUrl(req.file)
    order.receiptUploadedAt = new Date()
    order.purchaseCompletedAt = new Date()
    order.purchaseStatus = 'completed'
    order.purchasedBy = rider._id
    if (req.body.notes !== undefined) order.purchaseNotes = String(req.body.notes).trim()

    // Reflect the actual spend in the order totals
    order.subtotal = amount
    order.total = amount + (order.deliveryFee || 0)

    order.statusHistory = order.statusHistory || []
    order.statusHistory.push({
      status: 'purchase_receipt_recorded',
      by: req.user.id,
      note: `Purchase amount recorded: Rs ${amount}`,
      at: new Date(),
    })
    await order.save()

    emitRiderEvent(rider._id, 'purchase:receipt', { orderId: order._id, amount })

    res.json({
      message: 'Receipt uploaded and purchase amount recorded',
      purchaseStatus: order.purchaseStatus,
      purchaseAmount: order.purchaseAmount,
      receiptUrl: order.receiptUrl,
    })
  })
)

/**
 * @route POST /api/riders/me/order/:orderId/delivery/proof
 * @desc Upload optional delivery proof photo (multipart form: proof) -> { url }
 */
router.post(
  '/me/order/:orderId/delivery/proof',
  protect,
  requireRole('rider'),
  upload.single('proof'),
  asyncHandler(async (req, res) => {
    const ctx = await getRiderAndOwnedOrder(req, res)
    if (!ctx) return
    if (!req.file) {
      return res.status(400).json({ message: 'A proof file is required' })
    }
    res.json({ message: 'Proof uploaded', url: publicUrl(req.file) })
  })
)

/**
 * @route POST /api/riders/me/order/:orderId/delivery/confirm
 * @desc Delivery confirmation for an out-for-delivery order
 * @body { deliveryPin, recipientName?, notes?, proofUrl? }
 */
router.post(
  '/me/order/:orderId/delivery/confirm',
  protect,
  requireRole('rider'),
  asyncHandler(async (req, res) => {
    const ctx = await getRiderAndOwnedOrder(req, res)
    if (!ctx) return
    const { rider, order } = ctx

    if (order.status !== 'out_for_delivery') {
      return res.status(400).json({ message: 'Order must be out for delivery before it can be confirmed' })
    }

    const { deliveryPin, recipientName, notes, proofUrl } = req.body
    if (!deliveryPin) {
      return res.status(400).json({ message: 'Delivery PIN is required' })
    }
    if (order.deliveryPin && order.deliveryPin !== deliveryPin) {
      return res.status(400).json({ message: 'Invalid delivery PIN' })
    }

    const now = new Date()
    order.deliveryConfirmed = true
    order.deliveryConfirmedAt = now
    order.deliveryRecipientName = recipientName?.trim() || order.deliveryAddress?.name || ''
    order.deliveryNotes = notes?.trim() || ''
    if (proofUrl) order.deliveryProofUrl = proofUrl
    order.deliveredAt = now
    order.status = 'delivered'
    // Lock rider earning figures at the commission rate in effect now
    const earnRate = Number(getFeeConfig().commissionRate) || 0
    const grossFee = Number(order.deliveryFee) || 0
    const earnCommission = Math.round(grossFee * earnRate)
    order.riderEarning = {
      gross: grossFee,
      commission: earnCommission,
      net: grossFee - earnCommission,
      rate: earnRate,
      computedAt: now,
    }
    order.statusHistory = order.statusHistory || []
    order.statusHistory.push({
      status: 'delivered',
      by: req.user.id,
      note: `Delivery confirmed with ${order.deliveryRecipientName || 'recipient'}`,
      at: now,
    })
    await order.save()

    rider.totalDeliveries += 1
    rider.completedDeliveries += 1
    rider.availabilityStatus = 'available'
    rider.isOnline = true
    await rider.save()

    emitOrderEvent(order._id, 'order:update', { status: order.status })
    emitRiderEvent(rider._id, 'delivery:update', { orderId: order._id, status: order.status })

    const populated = await Order.findById(order._id)
      .populate('customer', 'name phone address')
      .populate('shop', 'name phone address')
      .lean()

    res.json({ message: 'Delivery confirmed', order: populated })
  })
)

/**
 * @route GET /api/riders/me/earnings
 * @desc Rider earnings: gross fees, platform commission, net pay, payout history
 */
router.get(
  '/me/earnings',
  protect,
  requireRole('rider'),
  asyncHandler(async (req, res) => {
    const rider = await Rider.findOne({ user: req.user.id })
    if (!rider) {
      return res.status(404).json({ message: 'Rider profile not found' })
    }

    const fees = getFeeConfig()
    const rate = Number(fees.commissionRate) || 0
    const minimum = Number(fees.minimumPayout) || 0

    const [delivered, activePayouts, paidPayouts, settledPayouts] = await Promise.all([
      Order.find({ rider: rider._id, status: 'delivered', deliveryFee: { $gt: 0 } })
        .sort({ deliveredAt: -1 })
        .limit(200)
        .lean(),
      Payout.find({ rider: rider._id, status: { $in: ['pending', 'processing'] } })
        .sort({ createdAt: -1 })
        .lean(),
      Payout.find({ rider: rider._id, status: 'paid' })
        .sort({ paidAt: -1 })
        .limit(20)
        .lean(),
      // Orders already locked into any live or paid payout are never
      // part of a future payout (cancelled/failed payouts release them)
      Payout.find({ rider: rider._id, status: { $in: ['pending', 'processing', 'paid'] } })
        .select('orders')
        .lean(),
    ])

    const summary = summarizeEarnings(delivered, rate)
    const gross = summary.gross
    const commission = summary.commission
    const netEarnings = summary.net

    // Rows not yet covered by a live/paid payout = the next payout pool
    const lockedOrderIds = new Set(
      settledPayouts.flatMap((p) => (p.orders || []).map((id) => String(id)))
    )
    const unsettledRows = summary.rows.filter((r) => !lockedOrderIds.has(String(r.orderId)))

    const pendingPayoutAmount = sumRows(activePayouts, 'amount')
    const paidOut = sumRows(paidPayouts, 'amount')
    const nextPayoutAmount = sumRows(unsettledRows, 'net')

    res.json({
      commissionRate: rate,
      minimumPayout: minimum,
      summary: {
        totalOrders: summary.rows.length,
        grossEarnings: gross,
        totalCommission: commission,
        netEarnings,
        paidOut,
        pendingPayoutAmount,
        nextPayoutAmount,
        nextPayoutEligible: nextPayoutAmount >= minimum && nextPayoutAmount > 0,
      },
      earnings: summary.rows.slice(0, 50),
      unsettled: unsettledRows,
      payouts: [...activePayouts, ...paidPayouts].slice(0, 20),
    })
  })
)

export default router
