const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const Order = require('../models/Order');
const { applyStatusChange } = require('../services/orderStatusService');

router.use(protect);
router.use(authorize('admin'));

// @route   GET /api/admin
// @desc    Admin Health Check
// @access  Private (Admin)
router.get('/', (req, res) => {
  res.status(200).json({ success: true, message: 'Admin API is running' });
});

// @route   PUT /api/admin/orders/:id/status
// @desc    Update order status (emits real-time socket events + notifications)
// @access  Private (Admin)
router.put('/orders/:id/status', async (req, res) => {
  try {
    const { status, note, location, reason } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
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
