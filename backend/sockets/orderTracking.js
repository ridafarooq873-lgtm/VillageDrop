const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Rider = require('../models/Rider');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET;

const registerHandlers = (nsp) => {
  nsp.use(async (socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id).select('role isActive');
      if (!user || !user.isActive) return next(new Error('Authentication required'));
      socket.data.userId = String(user._id);
      socket.data.role = user.role;
      return next();
    } catch {
      return next(new Error('Authentication required'));
    }
  });

  nsp.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id} on namespace ${nsp.name}`);

    const user = { id: socket.data.userId, role: socket.data.role };
    socket.join(`user_${user.id}`);
    console.log(`[socket] ${socket.id} joined room: user_${user.id}`);

    // Join an order tracking room: order_{orderId}
    socket.on('joinOrderRoom', async (orderId) => {
      if (!mongoose.Types.ObjectId.isValid(orderId)) return;
      try {
        const order = await Order.findById(orderId).select('customer rider');
        if (!order) return;

        let authorized = user?.role === 'admin' || (
          user?.role === 'customer' && String(order.customer) === String(user.id)
        );
        if (user?.role === 'rider' && order.rider) {
          const rider = await Rider.findOne({ user: user.id, isApproved: true });
          authorized = Boolean(rider && String(order.rider) === String(rider._id));
        }
        if (!authorized) return;

        socket.join(`order_${orderId}`);
        console.log(`[socket] ${socket.id} joined room: order_${orderId}`);
      } catch (err) {
        console.error(`[socket] Could not authorize order room: ${err.message}`);
      }
    });

    // Leave an order tracking room
    socket.on('leaveOrderRoom', (orderId) => {
      if (!orderId) return;
      socket.leave(`order_${orderId}`);
      console.log(`[socket] ${socket.id} left room: order_${orderId}`);
    });

    // Rider emits location updates -> broadcast to the order room (except sender)
    socket.on('updateLocation', (data) => {
      if (user?.role !== 'rider' || !data || !mongoose.Types.ObjectId.isValid(data.orderId)) return;
      if (!Number.isFinite(data.lat) || !Number.isFinite(data.lng) ||
        data.lat < -90 || data.lat > 90 || data.lng < -180 || data.lng > 180) return;

      Promise.all([
        Rider.findOne({ user: user.id, isApproved: true }),
        Order.findById(data.orderId).select('rider')
      ]).then(([rider, order]) => {
        if (!rider || !order || String(order.rider) !== String(rider._id)) return;
        socket.to(`order_${data.orderId}`).emit('riderLocationUpdate', {
          orderId: data.orderId,
          lat: data.lat,
          lng: data.lng,
          timestamp: new Date()
        });
      }).catch((err) => {
        console.error(`[socket] Could not relay rider location: ${err.message}`);
      });
    });

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id}`);
    });
  });
};

module.exports = (io) => {
  // Register on the default namespace and the /tracking namespace so any
  // client connection style (io() or io('/tracking')) works.
  registerHandlers(io);
  registerHandlers(io.of('/tracking'));
};
