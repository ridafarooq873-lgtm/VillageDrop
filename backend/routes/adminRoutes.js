import express from 'express'
import mongoose from 'mongoose'
import { asyncHandler } from '../utils/asyncHandler.js'
import { protect } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import Rider from '../models/Rider.js'
import User from '../models/User.js'
import Order from '../models/Order.js'
import Complaint from '../models/Complaint.js'
import Payout from '../models/Payout.js'
import Transaction from '../models/Transaction.js'
import generatePin from '../utils/generatePin.js'
import { getFeeConfig, saveFeeConfig } from '../utils/feeConfig.js'
import calculateFee from '../utils/calculateFee.js'
import { summarizeEarnings, lockMissingEarnings } from '../utils/earnings.js'
import { emitOrderEvent, emitRiderEvent } from '../config/socket.js'

const router = express.Router()

const ALL_STATUSES = [
  'pending',
  'accepted_by_shop',
  'ready_for_pickup',
  'assigned_to_rider',
  'picked_up',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'rejected',
]
const ACTIVE_STATUSES = [
  'pending',
  'accepted_by_shop',
  'ready_for_pickup',
  'assigned_to_rider',
  'picked_up',
  'out_for_delivery',
]
const ASSIGNABLE_STATUSES = [...ACTIVE_STATUSES]
const UNASSIGNABLE_STATUSES = [
  'pending',
  'accepted_by_shop',
  'ready_for_pickup',
  'assigned_to_rider',
]
const PAYOUT_STATUSES = ['pending', 'processing', 'paid', 'failed', 'cancelled']
const ACTIVE_PAYOUT_STATUSES = ['pending', 'processing', 'paid']
const STUCK_AFTER_MIN = 45

/** Escape user input before using it inside a RegExp. */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Map of riderId -> number of active orders. */
async function activeOrderCountsByRider() {
  const rows = await Order.aggregate([
    { $match: { status: { $in: ACTIVE_STATUSES }, rider: { $ne: null } } },
    { $group: { _id: '$rider', count: { $sum: 1 } } },
  ])
  return new Map(rows.map((r) => [String(r._id), r.count]))
}

async function populateAdminOrder(orderId) {
  return Order.findById(orderId)
    .populate('customer', 'name phone')
    .populate('shop', 'name')
    .populate({ path: 'rider', select: 'riderId', populate: { path: 'user', select: 'name' } })
    .lean()
}

async function populatePayout(payoutId) {
  return Payout.findById(payoutId)
    .populate({ path: 'rider', select: 'riderId', populate: { path: 'user', select: 'name' } })
    .lean()
}

/* ------------------------------------------------------------------ */
/* Operational monitoring + dashboard                                  */
/* ------------------------------------------------------------------ */

/**
 * @route GET /api/admin/dashboard
 * @desc High-level operational KPIs for the admin home screen
 */
router.get(
  '/dashboard',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const [statusAgg, revenueAgg, riderAgg, userAgg, disputeAgg, unassignedAgg, recentOrders] =
      await Promise.all([
        Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        Order.aggregate([
          { $match: { status: 'delivered' } },
          {
            $group: {
              _id: null,
              delivered: { $sum: 1 },
              deliveryFees: { $sum: '$deliveryFee' },
              orderValue: { $sum: '$total' },
            },
          },
        ]),
        Rider.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              approved: { $sum: { $cond: [{ $eq: ['$approvalStatus', 'approved'] }, 1, 0] } },
              pending: { $sum: { $cond: [{ $eq: ['$approvalStatus', 'pending'] }, 1, 0] } },
              rejected: { $sum: { $cond: [{ $eq: ['$approvalStatus', 'rejected'] }, 1, 0] } },
              suspended: { $sum: { $cond: [{ $eq: ['$approvalStatus', 'suspended'] }, 1, 0] } },
              online: { $sum: { $cond: ['$isOnline', 1, 0] } },
              available: {
                $sum: { $cond: [{ $eq: ['$availabilityStatus', 'available'] }, 1, 0] },
              },
              busy: { $sum: { $cond: [{ $eq: ['$availabilityStatus', 'busy'] }, 1, 0] } },
            },
          },
        ]),
        User.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              customers: { $sum: { $cond: [{ $eq: ['$role', 'customer'] }, 1, 0] } },
              riders: { $sum: { $cond: [{ $eq: ['$role', 'rider'] }, 1, 0] } },
              shops: { $sum: { $cond: [{ $eq: ['$role', 'shop'] }, 1, 0] } },
              admins: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } },
              active: { $sum: { $cond: ['$isActive', 1, 0] } },
            },
          },
        ]),
        Complaint.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        Order.aggregate([
          { $match: { status: { $in: ACTIVE_STATUSES }, rider: null } },
          { $count: 'n' },
        ]),
        Order.find()
          .sort({ createdAt: -1 })
          .limit(8)
          .populate('customer', 'name')
          .populate('shop', 'name')
          .populate({ path: 'rider', select: 'riderId', populate: { path: 'user', select: 'name' } })
          .lean(),
      ])

    const byStatus = Object.fromEntries(statusAgg.map((r) => [r._id, r.count]))
    const ordersTotal = statusAgg.reduce((sum, r) => sum + r.count, 0)
    const active = ACTIVE_STATUSES.reduce((sum, s) => sum + (byStatus[s] || 0), 0)

    const disputeCounts = Object.fromEntries(disputeAgg.map((r) => [r._id, r.count]))
    const disputesTotal = disputeAgg.reduce((sum, r) => sum + r.count, 0)

    const r = riderAgg[0] || {}
    const u = userAgg[0] || {}
    const rev = revenueAgg[0] || { delivered: 0, deliveryFees: 0, orderValue: 0 }

    res.json({
      orders: {
        total: ordersTotal,
        active,
        delivered: byStatus.delivered || 0,
        cancelled: (byStatus.cancelled || 0) + (byStatus.rejected || 0),
        unassigned: unassignedAgg[0]?.n || 0,
        byStatus,
      },
      riders: {
        total: r.total || 0,
        approved: r.approved || 0,
        pending: r.pending || 0,
        rejected: r.rejected || 0,
        suspended: r.suspended || 0,
        online: r.online || 0,
        available: r.available || 0,
        busy: r.busy || 0,
      },
      users: {
        total: u.total || 0,
        customers: u.customers || 0,
        riders: u.riders || 0,
        shops: u.shops || 0,
        admins: u.admins || 0,
        active: u.active || 0,
        inactive: (u.total || 0) - (u.active || 0),
      },
      disputes: {
        total: disputesTotal,
        open: disputeCounts.open || 0,
        in_progress: disputeCounts.in_progress || 0,
        resolved: disputeCounts.resolved || 0,
        closed: disputeCounts.closed || 0,
      },
      revenue: {
        delivered: rev.delivered || 0,
        deliveryFees: rev.deliveryFees || 0,
        orderValue: rev.orderValue || 0,
      },
      fees: getFeeConfig(),
      recentOrders,
    })
  })
)

/**
 * @route GET /api/admin/monitoring
 * @desc Live operational snapshot: system, fleet, active load, alerts
 */
router.get(
  '/monitoring',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const now = new Date()
    const [statusAgg, riders, activeOrders, openDisputes, pendingApprovals] = await Promise.all([
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Rider.find()
        .select('riderId isOnline availabilityStatus approvalStatus location updatedAt')
        .populate('user', 'name')
        .lean(),
      Order.find({ status: { $in: ACTIVE_STATUSES } })
        .sort({ createdAt: 1 })
        .populate('customer', 'name')
        .populate('shop', 'name')
        .populate({ path: 'rider', select: 'riderId', populate: { path: 'user', select: 'name' } })
        .lean(),
      Complaint.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
      Rider.countDocuments({ approvalStatus: 'pending' }),
    ])

    const withAge = activeOrders.map((o) => ({
      _id: o._id,
      orderNumber: o.orderNumber,
      status: o.status,
      requiresPurchase: o.requiresPurchase,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      ageMinutes: Math.max(0, Math.round((now - new Date(o.createdAt)) / 60000)),
      customer: o.customer?.name || '—',
      shop: o.shop?.name || '—',
      rider: o.rider
        ? { _id: o.rider._id, riderId: o.rider.riderId, name: o.rider.user?.name }
        : null,
    }))

    const cutoff = new Date(now.getTime() - STUCK_AFTER_MIN * 60000)
    const stuckOrders = withAge.filter((o) => new Date(o.updatedAt) < cutoff)

    const ridersWithWork = new Set(
      activeOrders.map((o) => (o.rider ? String(o.rider._id) : null)).filter(Boolean)
    )
    const inconsistentRiders = riders
      .filter((r) => r.availabilityStatus === 'busy' && !ridersWithWork.has(String(r._id)))
      .map((r) => ({ _id: r._id, riderId: r.riderId, name: r.user?.name || '—' }))

    const readyState = mongoose.connection.readyState
    const mongoStates = ['disconnected', 'connected', 'connecting', 'disconnecting']

    res.json({
      system: {
        uptimeSeconds: Math.round(process.uptime()),
        mongo: mongoStates[readyState] || 'unknown',
        now,
      },
      ordersByStatus: Object.fromEntries(statusAgg.map((r) => [r._id, r.count])),
      fleet: {
        total: riders.length,
        online: riders.filter((r) => r.isOnline).length,
        offline: riders.filter((r) => !r.isOnline).length,
        available: riders.filter((r) => r.availabilityStatus === 'available').length,
        busy: riders.filter((r) => r.availabilityStatus === 'busy').length,
        approved: riders.filter((r) => r.approvalStatus === 'approved').length,
        suspended: riders.filter((r) => r.approvalStatus === 'suspended').length,
        rejected: riders.filter((r) => r.approvalStatus === 'rejected').length,
      },
      riders: riders.map((r) => ({
        _id: r._id,
        riderId: r.riderId,
        name: r.user?.name || '—',
        isOnline: r.isOnline,
        availabilityStatus: r.availabilityStatus,
        approvalStatus: r.approvalStatus,
        activeOrders: activeOrders.filter(
          (o) => o.rider && String(o.rider._id) === String(r._id)
        ).length,
        lastLocationUpdate: r.location?.lastUpdated || null,
      })),
      activeOrders: withAge,
      alerts: {
        stuckOrders,
        pendingApprovals,
        openDisputes,
        inconsistentRiders,
      },
    })
  })
)

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

/**
 * @route GET /api/admin/users
 * @desc List users with role/status/search filters
 */
router.get(
  '/users',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { role, status, q } = req.query
    const filter = {}
    if (['customer', 'rider', 'shop', 'admin'].includes(role)) filter.role = role
    if (status === 'active') filter.isActive = true
    if (status === 'inactive') filter.isActive = false
    if (q && q.trim()) {
      const rx = new RegExp(escapeRegex(q.trim()), 'i')
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }]
    }

    const [users, agg] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).limit(500).lean(),
      User.aggregate([
        {
          $group: {
            _id: '$role',
            total: { $sum: 1 },
            active: { $sum: { $cond: ['$isActive', 1, 0] } },
          },
        },
      ]),
    ])

    res.json({ users, counts: agg })
  })
)

/**
 * @route PUT /api/admin/users/:id/status
 * @desc Activate / deactivate a user account
 */
router.put(
  '/users/:id/status',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { isActive } = req.body
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be a boolean' })
    }
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: 'You cannot change your own account status' })
    }

    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ message: 'User not found' })

    if (!isActive && user.role === 'admin') {
      const otherAdmins = await User.countDocuments({
        role: 'admin',
        isActive: true,
        _id: { $ne: user._id },
      })
      if (otherAdmins === 0) {
        return res.status(400).json({ message: 'Cannot deactivate the last active admin' })
      }
    }

    user.isActive = isActive
    await user.save()

    // Deactivating a rider also takes them off the road
    let rider = null
    if (user.role === 'rider' && !isActive) {
      rider = await Rider.findOneAndUpdate(
        { user: user._id },
        { isOnline: false, availabilityStatus: 'offline' },
        { new: true }
      )
      if (rider) emitRiderEvent(rider._id, 'account:update', { isActive: false })
    }

    res.json({
      message: isActive ? 'User activated' : 'User deactivated',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
      rider,
    })
  })
)

/**
 * @route PUT /api/admin/users/:id/role
 * @desc Change a user's role (applies immediately — role is read from DB per request)
 */
router.put(
  '/users/:id/role',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { role } = req.body
    if (!['customer', 'rider', 'shop', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' })
    }
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: 'You cannot change your own role' })
    }

    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ message: 'User not found' })

    if (user.role === 'admin' && role !== 'admin') {
      const otherAdmins = await User.countDocuments({
        role: 'admin',
        isActive: true,
        _id: { $ne: user._id },
      })
      if (otherAdmins === 0) {
        return res.status(400).json({ message: 'Cannot demote the last active admin' })
      }
    }

    user.role = role
    await user.save()

    res.json({
      message: `Role updated to ${role}`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
    })
  })
)

/* ------------------------------------------------------------------ */
/* Riders                                                              */
/* ------------------------------------------------------------------ */

/**
 * @route GET /api/admin/riders/pending
 * @desc Get all riders pending approval
 */
router.get(
  '/riders/pending',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const riders = await Rider.find({ approvalStatus: 'pending' })
      .populate('user', 'name email phone address')
      .sort({ createdAt: -1 })
      .lean()

    res.json(riders)
  })
)

/**
 * @route GET /api/admin/riders?approvalStatus=
 * @desc Get all riders (with active-order counts for management views)
 */
router.get(
  '/riders',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { approvalStatus } = req.query
    const filter = ['pending', 'approved', 'rejected', 'suspended'].includes(approvalStatus)
      ? { approvalStatus }
      : {}

    const [riders, counts] = await Promise.all([
      Rider.find(filter)
        .populate('user', 'name email phone address isActive')
        .sort({ createdAt: -1 })
        .lean(),
      activeOrderCountsByRider(),
    ])

    res.json(riders.map((r) => ({ ...r, activeOrders: counts.get(String(r._id)) || 0 })))
  })
)

/**
 * @route GET /api/admin/riders/:riderId
 * @desc Rider detail: profile + recent orders
 */
router.get(
  '/riders/:riderId',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const rider = await Rider.findById(req.params.riderId)
      .populate('user', 'name email phone isActive createdAt')
      .lean()
    if (!rider) return res.status(404).json({ message: 'Rider not found' })

    const orders = await Order.find({ rider: rider._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate('customer', 'name')
      .lean()

    res.json({ rider, orders })
  })
)

/**
 * @route PUT /api/admin/riders/:riderId/approve
 * @desc Approve a rider (also resumes suspended/rejected riders)
 */
router.put(
  '/riders/:riderId/approve',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { riderId } = req.params

    const rider = await Rider.findById(riderId)
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' })
    }

    rider.isApproved = true
    rider.approvalStatus = 'approved'
    rider.approvedBy = req.user.id
    rider.approvedAt = new Date()
    rider.rejectionReason = undefined

    await rider.save()

    const populated = await Rider.findById(rider._id)
      .populate('user', 'name email phone address')
      .lean()

    emitRiderEvent(rider._id, 'approval:update', { approvalStatus: 'approved' })
    res.json({ message: 'Rider approved successfully', rider: populated })
  })
)

/**
 * @route PUT /api/admin/riders/:riderId/reject
 * @desc Reject a rider
 */
router.put(
  '/riders/:riderId/reject',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { riderId } = req.params
    const { rejectionReason } = req.body

    const rider = await Rider.findById(riderId)
    if (!rider) {
      return res.status(404).json({ message: 'Rider not found' })
    }

    rider.isApproved = false
    rider.approvalStatus = 'rejected'
    rider.approvedBy = req.user.id
    rider.approvedAt = new Date()
    rider.rejectionReason = rejectionReason?.trim() || 'Not specified'
    rider.isOnline = false
    rider.availabilityStatus = 'offline'

    await rider.save()

    const populated = await Rider.findById(rider._id)
      .populate('user', 'name email phone address')
      .lean()

    emitRiderEvent(rider._id, 'approval:update', { approvalStatus: 'rejected' })
    res.json({ message: 'Rider rejected', rider: populated })
  })
)

/**
 * @route PUT /api/admin/riders/:riderId/suspend
 * @desc Suspend an approved rider (blocked while they hold active orders)
 */
router.put(
  '/riders/:riderId/suspend',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const rider = await Rider.findById(req.params.riderId)
    if (!rider) return res.status(404).json({ message: 'Rider not found' })

    const activeCount = await Order.countDocuments({
      rider: rider._id,
      status: { $in: ACTIVE_STATUSES },
    })
    if (activeCount > 0) {
      return res.status(409).json({
        message: `Rider still has ${activeCount} active order(s). Reassign them before suspending.`,
        activeOrders: activeCount,
      })
    }

    rider.approvalStatus = 'suspended'
    rider.isApproved = false
    rider.rejectionReason = req.body.reason?.trim() || 'Suspended by administrator'
    rider.isOnline = false
    rider.availabilityStatus = 'offline'
    await rider.save()

    emitRiderEvent(rider._id, 'approval:update', { approvalStatus: 'suspended' })

    const populated = await Rider.findById(rider._id)
      .populate('user', 'name email phone address')
      .lean()

    res.json({ message: 'Rider suspended', rider: populated })
  })
)

/**
 * @route PUT /api/admin/riders/:riderId/availability
 * @desc Force a rider's online/availability state (operational override)
 */
router.put(
  '/riders/:riderId/availability',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { isOnline, availabilityStatus } = req.body
    const updates = {}

    if (availabilityStatus !== undefined) {
      if (!['available', 'busy', 'offline'].includes(availabilityStatus)) {
        return res.status(400).json({ message: 'Invalid availability status' })
      }
      updates.availabilityStatus = availabilityStatus
    }
    if (typeof isOnline === 'boolean') updates.isOnline = isOnline

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'Nothing to update' })
    }

    // Keep the two fields consistent
    if (updates.availabilityStatus === 'offline') updates.isOnline = false
    else if (updates.availabilityStatus) updates.isOnline = true
    else if (updates.isOnline === true) updates.availabilityStatus = 'available'
    else if (updates.isOnline === false) updates.availabilityStatus = 'offline'

    const rider = await Rider.findByIdAndUpdate(req.params.riderId, updates, { new: true })
    if (!rider) return res.status(404).json({ message: 'Rider not found' })

    emitRiderEvent(rider._id, 'availability:update', {
      isOnline: rider.isOnline,
      availabilityStatus: rider.availabilityStatus,
    })

    const populated = await Rider.findById(rider._id)
      .populate('user', 'name email phone address')
      .lean()

    res.json({ message: 'Rider availability updated', rider: populated })
  })
)

/* ------------------------------------------------------------------ */
/* Orders + rider assignment / reassignment                            */
/* ------------------------------------------------------------------ */

/**
 * @route GET /api/admin/orders?status=&q=&page=&limit=
 * @desc List all orders with filters (paginated)
 */
router.get(
  '/orders',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { status, q, page, limit } = req.query
    const filter = {}
    if (ALL_STATUSES.includes(status)) filter.status = status
    if (q && q.trim()) filter.orderNumber = new RegExp(escapeRegex(q.trim()), 'i')

    const pageNum = Math.max(1, Number(page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(limit) || 25))

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize)
        .populate('customer', 'name phone')
        .populate('shop', 'name')
        .populate({
          path: 'rider',
          select: 'riderId',
          populate: { path: 'user', select: 'name' },
        })
        .lean(),
      Order.countDocuments(filter),
    ])

    res.json({
      orders,
      total,
      page: pageNum,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    })
  })
)

/**
 * @route PUT /api/admin/orders/:orderId/assign
 * @desc Assign a rider to an order — or reassign it from the current rider
 * @body { riderId }
 */
router.put(
  '/orders/:orderId/assign',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { riderId } = req.body
    if (!riderId) return res.status(400).json({ message: 'riderId is required' })

    const order = await Order.findById(req.params.orderId)
    if (!order) return res.status(404).json({ message: 'Order not found' })
    if (!ASSIGNABLE_STATUSES.includes(order.status)) {
      return res
        .status(400)
        .json({ message: `Order is ${order.status} and can no longer be assigned` })
    }

    const rider = await Rider.findById(riderId)
    if (!rider) return res.status(404).json({ message: 'Rider not found' })
    if (!rider.isApproved || rider.approvalStatus !== 'approved') {
      return res.status(400).json({ message: 'Rider must be approved before assignment' })
    }

    const previousRiderId = order.rider ? order.rider.toString() : null
    if (previousRiderId === rider._id.toString()) {
      return res.status(400).json({ message: 'Rider is already assigned to this order' })
    }

    const now = new Date()

    // Free the previous rider
    if (previousRiderId) {
      const oldRider = await Rider.findById(previousRiderId)
      if (oldRider) {
        oldRider.availabilityStatus = oldRider.isOnline ? 'available' : 'offline'
        await oldRider.save()
      }
    }

    const wasReassigned = Boolean(previousRiderId)
    order.rider = rider._id
    if (['pending', 'accepted_by_shop', 'ready_for_pickup'].includes(order.status)) {
      order.status = 'assigned_to_rider'
    }
    order.acceptedAt = now

    // Reassigning invalidates PINs the previous rider knows
    if (wasReassigned) {
      order.pickupPin = generatePin(4)
      order.deliveryPin = generatePin(4)
    } else {
      if (!order.pickupPin) order.pickupPin = generatePin(4)
      if (!order.deliveryPin) order.deliveryPin = generatePin(4)
    }

    order.statusHistory = order.statusHistory || []
    order.statusHistory.push({
      status: order.status,
      by: req.user.id,
      note: wasReassigned
        ? `Reassigned to ${rider.riderId || rider._id} by admin`
        : `Assigned to ${rider.riderId || rider._id} by admin`,
      at: now,
    })
    await order.save()

    rider.availabilityStatus = 'busy'
    await rider.save()

    const populated = await populateAdminOrder(order._id)

    emitOrderEvent(order._id, 'order:update', { status: order.status })
    if (previousRiderId) {
      emitRiderEvent(previousRiderId, 'assignment:removed', { orderId: order._id })
    }
    emitRiderEvent(rider._id, 'assignment:assigned', { orderId: order._id })

    res.json({
      message: wasReassigned ? 'Order reassigned successfully' : 'Rider assigned successfully',
      order: populated,
    })
  })
)

/**
 * @route PUT /api/admin/orders/:orderId/unassign
 * @desc Remove the rider from an order (before pickup only) and free them up
 */
router.put(
  '/orders/:orderId/unassign',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.orderId)
    if (!order) return res.status(404).json({ message: 'Order not found' })
    if (!order.rider) return res.status(400).json({ message: 'Order has no rider assigned' })
    if (!UNASSIGNABLE_STATUSES.includes(order.status)) {
      return res
        .status(400)
        .json({ message: 'Order already picked up — reassign it to another rider instead' })
    }

    const previousRiderId = order.rider
    const oldRider = await Rider.findById(previousRiderId)
    if (oldRider) {
      oldRider.availabilityStatus = oldRider.isOnline ? 'available' : 'offline'
      await oldRider.save()
    }

    order.rider = null
    if (order.status === 'assigned_to_rider') order.status = 'ready_for_pickup'
    order.statusHistory = order.statusHistory || []
    order.statusHistory.push({
      status: order.status,
      by: req.user.id,
      note: 'Unassigned by admin',
      at: new Date(),
    })
    await order.save()

    const populated = await populateAdminOrder(order._id)
    emitOrderEvent(order._id, 'order:update', { status: order.status })
    emitRiderEvent(previousRiderId, 'assignment:removed', { orderId: order._id })

    res.json({ message: 'Rider unassigned', order: populated })
  })
)

/* ------------------------------------------------------------------ */
/* Delivery fee management                                             */
/* ------------------------------------------------------------------ */

/**
 * @route GET /api/admin/fees
 * @desc Current delivery fee + commission configuration and samples
 */
router.get(
  '/fees',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const fees = getFeeConfig()
    res.json({
      fees,
      samples: [1, 3, 5, 10, 15].map((km) => ({ km, fee: calculateFee({ distanceKm: km }) })),
    })
  })
)

/**
 * @route PUT /api/admin/fees
 * @desc Update fee/commission configuration (applies to new orders immediately)
 * @body { base?, perKm?, minFee?, maxFee?, surge?, commissionRate?, minimumPayout? }
 */
router.put(
  '/fees',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const allowed = ['base', 'perKm', 'minFee', 'maxFee', 'surge', 'commissionRate', 'minimumPayout']
    const updates = {}

    for (const key of allowed) {
      if (req.body[key] === undefined) continue
      const value = Number(req.body[key])
      if (!Number.isFinite(value) || value < 0) {
        return res.status(400).json({ message: `${key} must be a non-negative number` })
      }
      updates[key] = value
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fee fields provided' })
    }
    if (updates.surge !== undefined && (updates.surge <= 0 || updates.surge > 5)) {
      return res.status(400).json({ message: 'Surge multiplier must be between 0.1 and 5' })
    }
    if (
      updates.commissionRate !== undefined &&
      (updates.commissionRate < 0 || updates.commissionRate > 1)
    ) {
      return res.status(400).json({ message: 'commissionRate must be between 0 and 1' })
    }

    const fees = await saveFeeConfig(updates, req.user.id)

    res.json({
      message: 'Delivery fee configuration updated',
      fees,
      samples: [1, 3, 5, 10, 15].map((km) => ({ km, fee: calculateFee({ distanceKm: km }) })),
    })
  })
)

/* ------------------------------------------------------------------ */
/* Platform earnings + rider payouts                                   */
/* ------------------------------------------------------------------ */

/**
 * @route GET /api/admin/earnings
 * @desc Platform earnings: gross fees, commission, rider net, per-rider breakdown
 */
router.get(
  '/earnings',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const fees = getFeeConfig()
    const rate = Number(fees.commissionRate) || 0

    const [delivered, payoutAgg, recentPayouts] = await Promise.all([
      Order.find({ status: 'delivered', deliveryFee: { $gt: 0 } })
        .populate({ path: 'rider', select: 'riderId', populate: { path: 'user', select: 'name' } })
        .sort({ deliveredAt: -1 })
        .lean(),
      Payout.aggregate([
        {
          $group: {
            _id: '$status',
            amount: { $sum: '$amount' },
            commission: { $sum: '$commission' },
            count: { $sum: 1 },
          },
        },
      ]),
      Payout.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate({ path: 'rider', select: 'riderId', populate: { path: 'user', select: 'name' } })
        .lean(),
    ])

    // Per-rider breakdown (commission rounded per order so rows add up;
    // settled orders keep the rate they were locked at on delivery)
    const { rows, gross, commission, net: riderNet, byRider } = summarizeEarnings(delivered, rate)

    const payoutStatus = Object.fromEntries(
      payoutAgg.map((r) => [
        r._id,
        { amount: r.amount, commission: r.commission, count: r.count },
      ])
    )
    const activePayoutNet = payoutAgg
      .filter((r) => ACTIVE_PAYOUT_STATUSES.includes(r._id))
      .reduce((s, r) => s + r.amount, 0)
    const paidOut = payoutAgg
      .filter((r) => r._id === 'paid')
      .reduce((s, r) => s + r.amount, 0)

    res.json({
      commissionRate: rate,
      minimumPayout: Number(fees.minimumPayout) || 0,
      platform: {
        deliveredOrders: rows.length,
        grossDeliveryFees: gross,
        totalCommission: commission,
        riderNet,
      },
      payouts: {
        byStatus: payoutStatus,
        paidAmount: paidOut,
        activeAmount: activePayoutNet,
        unsettledNet: Math.max(0, riderNet - activePayoutNet),
      },
      byRider: [...byRider].sort((a, b) => b.net - a.net),
      recentPayouts,
    })
  })
)

/**
 * @route GET /api/admin/payouts?status=&riderId=
 * @desc List payouts with status counts
 */
router.get(
  '/payouts',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { status, riderId } = req.query
    const filter = {}
    if (PAYOUT_STATUSES.includes(status)) filter.status = status
    if (riderId) filter.rider = riderId

    const [payouts, agg] = await Promise.all([
      Payout.find(filter)
        .sort({ createdAt: -1 })
        .limit(100)
        .populate({ path: 'rider', select: 'riderId', populate: { path: 'user', select: 'name' } })
        .lean(),
      Payout.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
    ])

    res.json({
      payouts,
      counts: Object.fromEntries(
        agg.map((r) => [r._id, { count: r.count, amount: r.amount }])
      ),
    })
  })
)

/**
 * @route POST /api/admin/payouts
 * @desc Generate a payout for a rider from unsettled delivered orders
 * @body { riderId, periodStart?, periodEnd?, ignoreMinimum?, notes? }
 */
router.post(
  '/payouts',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { riderId, periodStart, periodEnd, ignoreMinimum, notes } = req.body
    if (!riderId) return res.status(400).json({ message: 'riderId is required' })

    const rider = await Rider.findById(riderId)
    if (!rider) return res.status(404).json({ message: 'Rider not found' })

    const activeCount = await Payout.countDocuments({
      rider: rider._id,
      status: { $in: ['pending', 'processing'] },
    })
    if (activeCount > 0) {
      return res
        .status(409)
        .json({ message: 'Rider already has an active payout — settle it first.' })
    }

    // Exclude orders already covered by an active/paid payout
    const covered = await Payout.distinct('orders', {
      rider: rider._id,
      status: { $in: ACTIVE_PAYOUT_STATUSES },
    })

    const filter = {
      rider: rider._id,
      status: 'delivered',
      deliveryFee: { $gt: 0 },
      _id: { $nin: covered },
    }
    if (periodStart || periodEnd) {
      filter.deliveredAt = {}
      if (periodStart) filter.deliveredAt.$gte = new Date(periodStart)
      if (periodEnd) filter.deliveredAt.$lte = new Date(periodEnd)
    }

    const orders = await Order.find(filter).lean()
    if (orders.length === 0) {
      return res
        .status(400)
        .json({ message: 'No unsettled delivered orders available for payout' })
    }

    const fees = getFeeConfig()
    const rate = Number(fees.commissionRate) || 0
    // Lock legacy orders that were delivered before earnings were tracked
    await lockMissingEarnings(orders, rate)
    const { rows, gross, commission, net } = summarizeEarnings(orders, rate)

    const minimum = Number(fees.minimumPayout) || 0
    if (net < minimum && !ignoreMinimum) {
      return res.status(400).json({
        message: `Net amount Rs ${net} is below the minimum payout of Rs ${minimum}. Use ignoreMinimum to override.`,
      })
    }

    const payout = await Payout.create({
      rider: rider._id,
      periodStart: periodStart ? new Date(periodStart) : undefined,
      periodEnd: periodEnd ? new Date(periodEnd) : undefined,
      amount: net,
      commission,
      deliveryFees: gross,
      orderCount: rows.length,
      status: 'pending',
      notes,
      orders: rows.map((r) => r.orderId),
      transactions: [],
    })

    const txns = await Transaction.insertMany(
      rows.map((r) => ({
        order: r.orderId,
        rider: rider._id,
        amount: r.net,
        type: 'payout',
        status: 'pending',
        grossAmount: r.deliveryFee,
        commission: r.commission,
        netAmount: r.net,
        payout: payout._id,
        settlementStatus: 'pending_payout',
        reference: `PO-${String(payout._id).slice(-8).toUpperCase()}`,
        notes: `Delivery fee payout for ${r.orderNumber}`,
      }))
    )

    payout.transactions = txns.map((t) => t._id)
    await payout.save()

    const populated = await populatePayout(payout._id)
    res.status(201).json({
      message: 'Payout created',
      payout: populated,
      summary: { gross, commission, net, orders: rows.length },
    })
  })
)

/**
 * @route PUT /api/admin/payouts/:payoutId
 * @desc Advance a payout: processing / paid / failed / cancelled
 * @body { status, reference?, notes? }
 */
router.put(
  '/payouts/:payoutId',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { status, reference, notes } = req.body
    if (!PAYOUT_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Invalid payout status' })
    }

    const payout = await Payout.findById(req.params.payoutId)
    if (!payout) return res.status(404).json({ message: 'Payout not found' })
    if (payout.status === 'paid') {
      return res.status(400).json({ message: 'Paid payouts cannot be modified' })
    }

    payout.status = status
    if (reference !== undefined) payout.reference = reference
    if (notes !== undefined) payout.notes = notes

    if (status === 'paid') {
      payout.paidAt = new Date()
      payout.paidBy = req.user.id
      await Transaction.updateMany(
        { payout: payout._id },
        { status: 'completed', settlementStatus: 'paid', settledAt: new Date() }
      )
    } else if (status === 'failed' || status === 'cancelled') {
      // Released back into the pool of unsettled earnings
      await Transaction.updateMany(
        { payout: payout._id },
        {
          status: status === 'failed' ? 'failed' : 'reversed',
          settlementStatus: 'reversed',
        }
      )
    }

    await payout.save()

    const populated = await populatePayout(payout._id)
    res.json({ message: `Payout marked ${status}`, payout: populated })
  })
)

/* ------------------------------------------------------------------ */
/* Dispute handling                                                    */
/* ------------------------------------------------------------------ */

/**
 * @route GET /api/admin/disputes?status=
 * @desc List disputes/complaints with status counts
 */
router.get(
  '/disputes',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { status } = req.query
    const filter = ['open', 'in_progress', 'resolved', 'closed'].includes(status)
      ? { status }
      : {}

    const [disputes, agg] = await Promise.all([
      Complaint.find(filter)
        .sort({ createdAt: -1 })
        .limit(200)
        .populate('raisedBy', 'name role email')
        .populate('against', 'name role')
        .populate({ path: 'order', select: 'orderNumber status total deliveryFee' })
        .lean(),
      Complaint.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ])

    res.json({
      disputes,
      counts: Object.fromEntries(agg.map((r) => [r._id, r.count])),
    })
  })
)

/**
 * @route PUT /api/admin/disputes/:disputeId
 * @desc Update a dispute: assign a status and record the resolution
 * @body { status?, resolution? }
 */
router.put(
  '/disputes/:disputeId',
  protect,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { status, resolution } = req.body
    if (status !== undefined && !['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid dispute status' })
    }

    const complaint = await Complaint.findById(req.params.disputeId)
    if (!complaint) return res.status(404).json({ message: 'Dispute not found' })

    if (status) complaint.status = status
    if (resolution !== undefined) complaint.resolution = String(resolution).trim()

    if (['resolved', 'closed'].includes(complaint.status)) {
      if (!complaint.resolvedAt) complaint.resolvedAt = new Date()
      complaint.resolvedBy = req.user.id
    }

    await complaint.save()

    if (complaint.order) {
      emitOrderEvent(complaint.order, 'dispute:update', { status: complaint.status })
    }

    const populated = await Complaint.findById(complaint._id)
      .populate('raisedBy', 'name role email')
      .populate('against', 'name role')
      .populate({ path: 'order', select: 'orderNumber status total' })
      .lean()

    res.json({ message: 'Dispute updated', dispute: populated })
  })
)

export default router
