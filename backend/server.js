require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Configs
const connectDB = require('./config/db');
const socket = require('./config/socket');

// Route files
const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const riderRoutes = require('./routes/riderRoutes');

// Socket namespaces
const orderTrackingSocket = require('./sockets/orderTracking');

// Initialize Express App
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Connect to Database
connectDB();

// Middlewares
app.use(express.json()); // Body parser
app.use(cors({
  origin: 'http://localhost:5173', // Frontend dev URL
  credentials: true
}));
app.use(helmet()); // Security headers
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev')); // Logging
}

// Mount Routers
app.use('/api/auth', authRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/rider', riderRoutes);

// Base route
app.get('/', (req, res) => {
  res.send('Village Drop Backend is running');
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: err.message || 'Server Error'
  });
});

// Initialize Socket.io
const io = socket.init(server);

// Initialize Socket Handlers
orderTrackingSocket(io);

// Start Server
const PORT = process.env.PORT || 5000;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
}

module.exports = { app, server, io };
