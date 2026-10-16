const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const Order = require('../models/Order');
const Rider = require('../models/Rider');
const Notification = require('../models/Notification');
const { applyStatusChange, acceptOrder } = require('../services/orderStatusService');

router.use(protect);
router.use(authorize('rider'));

// Ensure the rider has a Rider profile document; create one if missing
const getRiderProfile = async (userId) => {
  let rider = await Rider.findOne({ user: userId });
  if (!rider) {
    rider = await Rider.create({
      user: userId,
      isAvailable: false,
      isApproved: false,
      approvalStatus: 'pending'
    });
  }
  return rider;
};

const requireApprovedRider = (rider, res) => {
  if (!rider.isApproved || rider.approvalStatus === 'rejected') {
    res.status(403).json({
      success: false,
      message: rider.approvalStatus === 'rejected'
        ? `Your rider application was not approved${rider.rejectionReason ? `: ${rider.rejectionReason}` : ''}`
        : 'Your rider account is waiting for admin approval'
    });
    return false;
  }
  return true;
};

// @route   GET /api/rider
// @desc    Rider Health Check
// @access  Private (Rider)
router.get('/', (req, res) => {
  res.status(200).json({ success: true, message: 'Rider API is running' });
});

// @route   GET /api/rider/orders
// @desc    Get orders available for pickup and orders assigned to this rider
// @access  Private (Rider)
router.get('/orders', async (req, res) => {
  try {
    const rider = await getRiderProfile(req.user.id);
    await rider.populate('user', 'name email phone');
    if (!rider.isApproved || rider.approvalStatus === 'rejected') {
      return res.status(200).json({ success: true, data: { available: [], assigned: [], rider } });
    }

    const [available, assigned, totalDeliveries] = await Promise.all([
      Order.find({ status: 'pending', rider: null })
        .populate('items')
        .populate('customer', 'name phone')
        .sort({ createdAt: -1 })
        .limit(50),
      Order.find({ rider: rider._id, status: { $nin: ['delivered', 'cancelled'] } })
        .populate('items')
        .populate('customer', 'name phone')
        .sort({ createdAt: -1 }),
      Order.countDocuments({ rider: rider._id, status: 'delivered' })
    ]);

    res.status(200).json({ success: true, data: { available, assigned, totalDeliveries, rider } });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/rider/orders/:id/accept
// @desc    Rider accepts a pending order (pending -> confirmed, rider assigned)
// @access  Private (Rider)
router.put('/orders/:id/accept', async (req, res) => {
  try {
    const rider = await getRiderProfile(req.user.id);
    if (!requireApprovedRider(rider, res)) return;
    if (!rider.isAvailable) {
      return res.status(403).json({ success: false, message: 'Set your availability to online before accepting orders' });
    }

    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: 'pending', rider: null },
      { $set: { rider: rider._id } },
      { new: true }
    );
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not available for acceptance' });
    }

    let updatedOrder;
    try {
      updatedOrder = await acceptOrder(order, rider);
    } catch (error) {
      await Order.updateOne(
        { _id: order._id, status: 'pending', rider: rider._id },
        { $unset: { rider: 1 } }
      );
      throw error;
    }

    res.status(200).json({ success: true, data: updatedOrder });
  } catch (err) {
    console.error(err.message);
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/rider/orders/:id/status
// @desc    Advance order status (assigned/purchasing/picked_up/in_transit/delivered)
//          delivered requires the customer's deliveryPin
// @access  Private (Rider)
router.put('/orders/:id/status', async (req, res) => {
  try {
    const rider = await getRiderProfile(req.user.id);
    if (!requireApprovedRider(rider, res)) return;
    const { status, note, location, pin } = req.body;

    const RIDER_STATUSES = ['assigned', 'purchasing', 'picked_up', 'in_transit', 'delivered'];
    if (!RIDER_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Rider can only set: ${RIDER_STATUSES.join(', ')}`
      });
    }

    const order = await Order.findOne({ _id: req.params.id, rider: rider._id })
      .select('+deliveryPin');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found or not assigned to you' });
    }

    // Delivery requires PIN verification against the customer's delivery PIN
    if (status === 'delivered') {
      if (!pin || String(pin) !== String(order.deliveryPin)) {
        return res.status(400).json({ success: false, message: 'Invalid delivery PIN' });
      }
    }

    const updatedOrder = await applyStatusChange(order, status, {
      actor: 'rider',
      note,
      location
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

router.put('/availability', async (req, res) => {
  const { isAvailable } = req.body || {};
  if (typeof isAvailable !== 'boolean') {
    return res.status(400).json({ success: false, message: 'isAvailable must be a boolean' });
  }

  try {
    const rider = await getRiderProfile(req.user.id);
    if (!requireApprovedRider(rider, res)) return;
    rider.isAvailable = isAvailable;
    await rider.save();
    return res.status(200).json({ success: true, data: { isAvailable: rider.isAvailable } });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ success: false, message: 'Could not update availability' });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    return res.status(200).json({ success: true, data: notifications });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ success: false, message: 'Could not load notifications' });
  }
});

router.put('/notifications/:id/read', async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { isRead: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    return res.status(200).json({ success: true, data: notification });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ success: false, message: 'Could not update notification' });
  }
});

module.exports = router;
