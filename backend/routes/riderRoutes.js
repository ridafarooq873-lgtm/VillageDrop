const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const Order = require('../models/Order');
const Rider = require('../models/Rider');
const { applyStatusChange, acceptOrder } = require('../services/orderStatusService');

router.use(protect);
router.use(authorize('rider'));

// Ensure the rider has a Rider profile document; create one if missing
const getRiderProfile = async (userId) => {
  let rider = await Rider.findOne({ user: userId });
  if (!rider) {
    rider = await Rider.create({ user: userId, isAvailable: true, isApproved: false });
  }
  return rider;
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

    const [available, assigned] = await Promise.all([
      Order.find({ status: 'pending', rider: null })
        .populate('items')
        .populate('customer', 'name phone')
        .sort({ createdAt: -1 })
        .limit(50),
      Order.find({ rider: rider._id, status: { $nin: ['delivered', 'cancelled'] } })
        .populate('items')
        .populate('customer', 'name phone')
        .sort({ createdAt: -1 })
    ]);

    res.status(200).json({ success: true, data: { available, assigned, rider } });
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

    const order = await Order.findOne({ _id: req.params.id, status: 'pending', rider: null });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not available for acceptance' });
    }

    const updatedOrder = await acceptOrder(order, rider);

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
    const { status, note, location, pin } = req.body;

    const RIDER_STATUSES = ['assigned', 'purchasing', 'picked_up', 'in_transit', 'delivered'];
    if (!RIDER_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Rider can only set: ${RIDER_STATUSES.join(', ')}`
      });
    }

    const order = await Order.findOne({ _id: req.params.id, rider: rider._id });
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

module.exports = router;
