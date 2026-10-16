const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const Order = require('../models/Order');
const Rider = require('../models/Rider');
const User = require('../models/User');
const { applyStatusChange } = require('../services/orderStatusService');

router.use(protect);
router.use(authorize('admin'));

// @route   GET /api/admin
// @desc    Admin Health Check
// @access  Private (Admin)
router.get('/', (req, res) => {
  res.status(200).json({ success: true, message: 'Admin API is running' });
});

router.get('/overview', async (req, res) => {
  try {
    const [orders, pendingRiders, riders, users] = await Promise.all([
      Order.countDocuments(),
      Rider.countDocuments({ isApproved: { $ne: true }, approvalStatus: { $ne: 'rejected' } }),
      Rider.countDocuments({ isApproved: true }),
      User.countDocuments()
    ]);
    return res.status(200).json({ success: true, data: { orders, pendingRiders, riders, users } });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ success: false, message: 'Could not load admin overview' });
  }
});

router.get('/riders', async (req, res) => {
  const status = req.query.status || 'pending';
  if (!['pending', 'approved', 'rejected', 'all'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid rider status filter' });
  }

  try {
    const query = status === 'all'
      ? {}
      : status === 'approved'
        ? { isApproved: true }
        : status === 'rejected'
          ? { approvalStatus: 'rejected' }
          : { isApproved: { $ne: true }, approvalStatus: { $ne: 'rejected' } };
    const riders = await Rider.find(query)
      .populate('user', 'name email phone address isActive')
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: riders });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ success: false, message: 'Could not load rider applications' });
  }
});

router.put('/riders/:id/approval', async (req, res) => {
  const { decision, reason } = req.body;
  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ success: false, message: 'Decision must be approve or reject' });
  }
  if (decision === 'reject' && (typeof reason !== 'string' || !reason.trim())) {
    return res.status(400).json({ success: false, message: 'A reason is required to reject an application' });
  }

  try {
    const rider = await Rider.findById(req.params.id).populate('user', 'name email phone');
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Rider application not found' });
    }
    if (rider.isApproved || rider.approvalStatus === 'rejected') {
      return res.status(409).json({ success: false, message: 'This rider application has already been reviewed' });
    }

    rider.approvalStatus = decision === 'approve' ? 'approved' : 'rejected';
    rider.isApproved = decision === 'approve';
    rider.isAvailable = false;
    rider.rejectionReason = decision === 'reject' ? String(reason || '').trim() : undefined;
    await rider.save();
    return res.status(200).json({ success: true, data: rider });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ success: false, message: 'Could not review rider application' });
  }
});

router.get('/orders', async (req, res) => {
  try {
    const query = {};
    if (req.query.status) query.status = req.query.status;
    const orders = await Order.find(query)
      .populate('items')
      .populate('customer', 'name email phone')
      .populate({ path: 'rider', populate: { path: 'user', select: 'name phone' } })
      .sort({ createdAt: -1 })
      .limit(200);
    return res.status(200).json({ success: true, data: orders });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ success: false, message: 'Could not load orders' });
  }
});

// @route   PUT /api/admin/orders/:id/status
// @desc    Update order status (emits real-time socket events + notifications)
// @access  Private (Admin)
router.put('/orders/:id/status', async (req, res) => {
  try {
    const { status, note, location, reason } = req.body;
    const adminStatuses = {
      pending: ['cancelled'],
      confirmed: ['assigned', 'purchasing', 'picked_up', 'cancelled'],
      assigned: ['purchasing', 'picked_up'],
      purchasing: ['picked_up'],
      picked_up: ['in_transit'],
      in_transit: ['delivered']
    };

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (!adminStatuses[order.status]?.includes(status)) {
      return res.status(400).json({ success: false, message: 'That status change is not available to administrators' });
    }
    if (['assigned', 'purchasing', 'picked_up', 'in_transit', 'delivered'].includes(status) && !order.rider) {
      return res.status(400).json({ success: false, message: 'A rider must accept this order before it can advance' });
    }

    const updatedOrder = await applyStatusChange(order, status, {
      actor: 'admin',
      note,
      location,
      reason
    });

    res.status(200).json({ success: true, data: updatedOrder });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    res.status(500).send('Server Error');
  }
});

module.exports = router;
