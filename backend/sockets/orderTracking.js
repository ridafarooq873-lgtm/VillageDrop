module.exports = (io) => {
  // Create a namespace or just use the main io
  const trackingNamespace = io.of('/tracking');

  trackingNamespace.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Join order tracking room
    socket.on('joinOrderRoom', (orderId) => {
      socket.join(`order_${orderId}`);
      console.log(`Socket ${socket.id} joined room: order_${orderId}`);
    });

    // Leave order tracking room
    socket.on('leaveOrderRoom', (orderId) => {
      socket.leave(`order_${orderId}`);
      console.log(`Socket ${socket.id} left room: order_${orderId}`);
    });

    // Rider emits location updates
    socket.on('updateLocation', (data) => {
      // data should contain { orderId, lat, lng }
      if (data && data.orderId) {
        // Broadcast to everyone in the order room except the sender
        socket.to(`order_${data.orderId}`).emit('riderLocationUpdate', {
          lat: data.lat,
          lng: data.lng,
          timestamp: new Date()
        });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};
