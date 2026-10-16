const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

// Verify the JWT sent via socket.handshake.auth.token
const authenticate = (socket) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded; // { id, role }
  } catch (err) {
    return null;
  }
};

const registerHandlers = (nsp) => {
  nsp.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id} on namespace ${nsp.name}`);

    const user = authenticate(socket);
    if (user && user.id) {
      socket.data.userId = user.id;
      socket.data.role = user.role;
      socket.join(`user_${user.id}`);
      console.log(`[socket] ${socket.id} joined room: user_${user.id}`);
    }

    // Join an order tracking room: order_{orderId}
    socket.on('joinOrderRoom', (orderId) => {
      if (!orderId) return;
      socket.join(`order_${orderId}`);
      console.log(`[socket] ${socket.id} joined room: order_${orderId}`);
    });

    // Leave an order tracking room
    socket.on('leaveOrderRoom', (orderId) => {
      if (!orderId) return;
      socket.leave(`order_${orderId}`);
      console.log(`[socket] ${socket.id} left room: order_${orderId}`);
    });

    // Rider emits location updates -> broadcast to the order room (except sender)
    socket.on('updateLocation', (data) => {
      if (data && data.orderId) {
        socket.to(`order_${data.orderId}`).emit('riderLocationUpdate', {
          orderId: data.orderId,
          lat: data.lat,
          lng: data.lng,
          timestamp: new Date()
        });
      }
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
