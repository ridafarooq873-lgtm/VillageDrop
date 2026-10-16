import 'dotenv/config'
import express from 'express'
import http from 'http'
import cors from 'cors'
import mongoose from 'mongoose'
import { connectDB } from './config/db.js'
import { loadFeeConfig } from './utils/feeConfig.js'
import { initSocket } from './config/socket.js'
import { UPLOAD_DIR } from './middleware/upload.js'
import authRoutes from './routes/authRoutes.js'
import riderRoutes from './routes/riderRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import customerRoutes from './routes/customerRoutes.js'
import customerCompatRoutes from './routes/customerCompatRoutes.js'
import notificationRoutes from './routes/notificationRoutes.js'

const app = express()
const httpServer = http.createServer(app)

// CORS
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
const allowedClientOrigins = new Set([clientUrl])
if (process.env.NODE_ENV !== 'production') {
  allowedClientOrigins.add('http://localhost:5173')
  allowedClientOrigins.add('http://127.0.0.1:5173')
}
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedClientOrigins.has(origin)) return callback(null, true)
    return callback(new Error('Origin is not allowed by CORS'))
  },
  credentials: true,
}))

// Body parsing
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  })
})

// Static: uploaded receipts and delivery proofs
app.use('/uploads', express.static(UPLOAD_DIR))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/riders', riderRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/customers', customerRoutes)
app.use('/api/customer', customerCompatRoutes)
app.use('/api/notifications', notificationRoutes)

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' })
})

// Global error handler
app.use((err, req, res, next) => {
  console.error('[error]', err)

  // Multer / upload errors -> 400
  if (err.name === 'MulterError' || err.code === 'LIMIT_FILE_SIZE') {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'File too large (maximum 5MB)' : err.message
    return res.status(400).json({ message })
  }
  // Custom fileFilter rejection
  if (err.message && err.message.startsWith('Only images')) {
    return res.status(400).json({ message: err.message })
  }

  const status = err.statusCode || 500
  res.status(status).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
})

// Initialize socket
initSocket(httpServer, { origin: [...allowedClientOrigins] })

const PORT = process.env.PORT || 5000

async function startServer() {
  await connectDB()
  await loadFeeConfig()
  httpServer.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`)
  })
}

startServer().catch((error) => {
  console.error('[server] Failed to start:', error.message)
  process.exitCode = 1
  httpServer.close()
})
