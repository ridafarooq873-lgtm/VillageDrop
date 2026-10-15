const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Review = require('../models/Review');
const Complaint = require('../models/Complaint');
const Notification = require('../models/Notification');
const calculateFee = require('../utils/calculateFee');
const generatePin = require('../utils/generatePin');

const router = express.Router();

// All routes are protected and restricted to customers
router.use(protect);
router.use(authorize('customer'));

// @route   GET /api/customer
// @desc    Get customer dashboard stats
// @access  Private (Customer)
router.get('/', async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments({ customer: req.user.id });
    const activeOrders = await Order.countDocuments({
      customer: req.user.id,
      status: { $in: ['pending', 'confirmed', 'assigned', 'purchasing', 'picked_up', 'in_transit'] }
    });
    const completedOrders = await Order.countDocuments({
      customer: req.user.id,
      status: 'delivered'
    });
    
    const orders = await Order.find({ customer: req.user.id, status: 'delivered' });
    const totalSpent = orders.reduce((acc, order) => acc + order.totalAmount, 0);

    const recentOrders = await Order.find({ customer: req.user.id })
      .populate('items')
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalOrders,
          activeOrders,
          completedOrders,
          totalSpent
        },
        recentOrders
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/customer/orders
// @desc    Create a new delivery or purchase request (Order)
// @access  Private (Customer)
router.post(
  '/orders',
  [
    body('orderType').optional().isIn(['pickup_delivery', 'rider_assisted_purchase']),
    body('pickup.address', 'Pickup address is required').not().isEmpty(),
    body('delivery.address', 'Delivery address is required').not().isEmpty(),
    body('delivery.contactName', 'Delivery contact name is required').not().isEmpty(),
    body('delivery.contactPhone', 'Delivery contact phone is required').not().isEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { orderType, pickup, delivery, items, paymentMethod, purchaseDetails } = req.body;
      const isRAP = orderType === 'rider_assisted_purchase';

      if (!isRAP && (!items || items.length === 0)) {
        return res.status(400).json({ success: false, message: 'At least one item is required for Pickup & Delivery' });
      }

      if (isRAP && (!purchaseDetails || !purchaseDetails.instructions)) {
        return res.status(400).json({ success: false, message: 'Purchase instructions are required for Rider-Assisted Purchase' });
      }

      // Dummy calculation for distance (in real world, use Google Maps API)
      const distance = 5; 
      
      let totalWeight = 0;
      let hasFragile = false;
      let hasElectronics = false;
      
      const newOrder = new Order({
        customer: req.user.id,
        orderType: orderType || 'pickup_delivery',
        pickup,
        delivery,
        paymentMethod: paymentMethod || 'cod',
        purchaseDetails: isRAP ? purchaseDetails : undefined,
        deliveryFee: 0, 
        totalAmount: 0, 
        deliveryPin: generatePin(),
        trackingUpdates: [
          { status: 'pending', note: 'Order created successfully' }
        ]
      });

      await newOrder.save();
      
      const createdItems = [];
      if (items && items.length > 0) {
        for (const itemData of items) {
          const item = new OrderItem({
            order: newOrder._id,
            ...itemData
          });
          await item.save();
          createdItems.push(item._id);
          
          totalWeight += (itemData.weight || 0) * (itemData.quantity || 1);
          if (itemData.fragile) hasFragile = true;
          if (itemData.category === 'electronics') hasElectronics = true;
        }
      }
      
      let fee = calculateFee({
        distance,
        weight: totalWeight,
        category: hasElectronics ? 'electronics' : 'parcel',
        isFragile: hasFragile
      });

      // Additional service fee for RAP
      if (isRAP) {
        fee += 20;
      }

      newOrder.items = createdItems;
      newOrder.deliveryFee = fee;
      
      // Calculate total amount (Fee + Estimated Item Cost for RAP)
      const estimatedCost = isRAP && purchaseDetails && purchaseDetails.estimatedItemCost ? purchaseDetails.estimatedItemCost : 0;
      newOrder.totalAmount = fee + estimatedCost; 

      await newOrder.save();

      const populatedOrder = await Order.findById(newOrder._id).populate('items');

      res.status(201).json({
        success: true,
        data: populatedOrder
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   GET /api/customer/orders
// @desc    Get all orders for a customer
// @access  Private (Customer)
router.get('/orders', async (req, res) => {
  try {
    const { status, orderType, limit = 10, page = 1 } = req.query;
    const query = { customer: req.user.id };
    
    if (status) query.status = status;
    if (orderType) query.orderType = orderType;

    const orders = await Order.find(query)
      .populate('items')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
      
    const count = await Order.countDocuments(query);

    res.status(200).json({
      success: true,
      count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      data: orders
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/customer/orders/:id
// @desc    Get single order details
// @access  Private (Customer)
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, customer: req.user.id })
      .populate('items')
      .populate({ path: 'rider', populate: { path: 'user', select: 'name phone' } });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/customer/orders/:id/cancel
// @desc    Cancel an order
// @access  Private (Customer)
router.put('/orders/:id/cancel', async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, customer: req.user.id });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Order cannot be cancelled at this stage' });
    }

    const { reason } = req.body;

    order.status = 'cancelled';
    order.cancellation = {
      reason: reason || 'Customer requested cancellation',
      cancelledBy: 'customer',
      cancelledAt: Date.now(),
      refundStatus: order.paymentStatus === 'paid' ? 'pending' : 'na'
    };
    
    order.trackingUpdates.push({
      status: 'cancelled',
      note: 'Order cancelled by customer'
    });

    await order.save();

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/customer/orders/:id/items
// @desc    Add item to existing order (only if pending)
// @access  Private (Customer)
router.post('/orders/:id/items', async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, customer: req.user.id });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Items can only be added to pending orders' });
    }

    if (order.orderType === 'rider_assisted_purchase') {
      return res.status(400).json({ success: false, message: 'Cannot add standalone items to a Rider-Assisted Purchase. Update purchase details instead.' });
    }

    const newItem = new OrderItem({
      order: order._id,
      ...req.body
    });

    await newItem.save();
    
    order.items.push(newItem._id);
    await order.save();

    res.status(201).json({
      success: true,
      data: newItem
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/customer/orders/:id/items/:itemId
// @desc    Remove item from order
// @access  Private (Customer)
router.delete('/orders/:id/items/:itemId', async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, customer: req.user.id });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Items can only be removed from pending orders' });
    }
    
    if (order.items.length <= 1) {
      return res.status(400).json({ success: false, message: 'Cannot remove the last item. Cancel order instead.' });
    }

    const item = await OrderItem.findOneAndDelete({ _id: req.params.itemId, order: order._id });
    
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found in order' });
    }

    order.items = order.items.filter(id => id.toString() !== req.params.itemId);
    await order.save();

    res.status(200).json({
      success: true,
      message: 'Item removed successfully'
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// ================= NOTIFICATIONS =================

// @route   GET /api/customer/notifications
// @desc    Get customer notifications
// @access  Private (Customer)
router.get('/notifications', async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: notifications
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/customer/notifications/:id/read
// @desc    Mark notification as read
// @access  Private (Customer)
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

    res.status(200).json({
      success: true,
      data: notification
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// ================= REVIEWS =================

// @route   POST /api/customer/orders/:id/reviews
// @desc    Submit a review for a delivered order
// @access  Private (Customer)
router.post(
  '/orders/:id/reviews',
  [
    body('rating', 'Rating is required and must be between 1 and 5').isNumeric().custom(v => v >= 1 && v <= 5),
    body('comment', 'Comment is optional but must be a string').optional().isString()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const order = await Order.findOne({ _id: req.params.id, customer: req.user.id });

      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      if (order.status !== 'delivered') {
        return res.status(400).json({ success: false, message: 'Can only review delivered orders' });
      }

      // Check if review already exists
      const existingReview = await Review.findOne({ order: order._id, reviewer: req.user.id });
      if (existingReview) {
        return res.status(400).json({ success: false, message: 'You have already reviewed this order' });
      }

      const review = new Review({
        order: order._id,
        reviewer: req.user.id,
        reviewee: order.rider,
        rating: req.body.rating,
        comment: req.body.comment
      });

      await review.save();

      res.status(201).json({
        success: true,
        data: review
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   GET /api/customer/reviews
// @desc    Get reviews submitted by customer
// @access  Private (Customer)
router.get('/reviews', async (req, res) => {
  try {
    const reviews = await Review.find({ reviewer: req.user.id }).populate('order');
    res.status(200).json({ success: true, data: reviews });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// ================= COMPLAINTS =================

// @route   POST /api/customer/complaints
// @desc    Submit a complaint
// @access  Private (Customer)
router.post(
  '/complaints',
  [
    body('subject', 'Subject is required').not().isEmpty(),
    body('description', 'Description is required').not().isEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { order, subject, description } = req.body;

      if (order) {
        // Verify order belongs to user
        const orderExists = await Order.findOne({ _id: order, customer: req.user.id });
        if (!orderExists) {
          return res.status(404).json({ success: false, message: 'Order not found' });
        }
      }

      const complaint = new Complaint({
        user: req.user.id,
        order,
        subject,
        description
      });

      await complaint.save();

      res.status(201).json({
        success: true,
        data: complaint
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   GET /api/customer/complaints
// @desc    Get user's complaints
// @access  Private (Customer)
router.get('/complaints', async (req, res) => {
  try {
    const complaints = await Complaint.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: complaints });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
