import express from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { protect } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import Order from '../models/Order.js'
import OrderItem from '../models/OrderItem.js'
import Complaint from '../models/Complaint.js'
import generatePin from '../utils/generatePin.js'
import calculateFee from '../utils/calculateFee.js'

const router = express.Router()

/**
 * @route POST /api/customers/orders
 * @desc Create an order (minimal stub for testing)
 */
router.post(
  '/orders',
  protect,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const { items, deliveryAddress, shopId, distanceKm, type, requiresPurchase } = req.body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Order items are required' })
    }

    const isPurchase = type === 'assisted_purchase' || requiresPurchase === true

    const subtotal = items.reduce(
      (acc, item) => acc + (item.price || 0) * (item.quantity || 1),
      0
    )
    const deliveryFee = calculateFee({ distanceKm })
    const total = subtotal + deliveryFee

    const order = await Order.create({
      customer: req.user.id,
      shop: shopId || undefined,
      subtotal,
      deliveryFee,
      total,
      deliveryAddress,
      status: 'pending',
      paymentStatus: 'pending',
      orderType: isPurchase ? 'assisted_purchase' : 'standard',
      requiresPurchase: isPurchase,
      purchaseStatus: isPurchase ? 'pending' : 'not_required',
      pickupPin: generatePin(4),
      deliveryPin: generatePin(4),
    })

    const orderItems = await OrderItem.insertMany(
      items.map((item) => ({
        order: order._id,
        productName: item.productName,
        quantity: item.quantity || 1,
        price: item.price || 0,
      }))
    )

    const populated = await Order.findById(order._id)
      .populate('customer', 'name phone address')
      .populate('shop', 'name phone address')
      .lean()

    res.status(201).json({
      message: 'Order created successfully',
      order: populated,
      items: orderItems,
    })
  })
)

/**
 * @route GET /api/customers/orders
 * @desc Get customer's orders
 */
router.get(
  '/orders',
  protect,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const orders = await Order.find({ customer: req.user.id })
      .populate('rider', 'riderId')
      .populate('shop', 'name')
      .sort({ createdAt: -1 })
      .lean()

    res.json(orders)
  })
)

/**
 * @route POST /api/customers/orders/:orderId/dispute
 * @desc Raise a dispute/complaint about your own order (fed into admin dispute handling)
 * @body { subject, description, against? }
 */
router.post(
  '/orders/:orderId/dispute',
  protect,
  requireRole('customer'),
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.orderId)
    if (!order) return res.status(404).json({ message: 'Order not found' })
    if (order.customer.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You can only raise disputes on your own orders' })
    }

    const { subject, description, against } = req.body
    if (!subject?.trim() || !description?.trim()) {
      return res.status(400).json({ message: 'Subject and description are required' })
    }

    const complaint = await Complaint.create({
      order: order._id,
      raisedBy: req.user.id,
      against: against || undefined,
      subject: subject.trim(),
      description: description.trim(),
      status: 'open',
    })

    res.status(201).json({ message: 'Dispute raised', dispute: complaint })
  })
)

export default router
