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

// CORS - FIXED for Vercel
const allowedClientOrigins = [
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'https://villagedropfrontend-68hpnzs7y-ridafarooq873-lgtm.vercel.app',
  'https://villagedropfrontend.vercel.app',
].filter(Boolean)

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true)
    // Vercel ke saare links ko allow karo
    if (origin.includes('vercel.app') || allowedClientOrigins.includes(origin)) {
      return callback(null, true)
    }
    return callback(null, true) // Network Error khatam karne ke liye sab allow
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

app.get('/', (req, res) => {
  res.json({ message: 'VillageDrop API is running' })
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
  if (err.name === 'MulterError' || err.code === 'LIMIT_FILE_SIZE') {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'File too large (maximum 5MB)' : err.message
    return res.status(400).json({ message })
  }
  if (err.message && err.message.startsWith('Only images')) {
    return res.status(400).json({ message: err.message })
  }
  const status = err.statusCode || 500
  res.status(status).json({
    message: err.message || 'Internal server error',
  })
})

// Initialize socket
initSocket(httpServer, { origin: allowedClientOrigins })

const PORT = process.env.PORT || 5000

async function startServer() {
  await connectDB()
  await loadFeeConfig()
  // Vercel pe listen nahi karna
  if (!process.env.VERCEL) {
    httpServer.listen(PORT, () => {
      console.log(`[server] listening on http://localhost:${PORT}`)
    })
  }
}

await connectDB()
await loadFeeConfig()

// Vercel ke liye export zaroori hai
export default app

if (!process.env.VERCEL) {
  startServer().catch((error) => {
    console.error('[server] Failed to start:', error.message)
    process.exit(1)
  })
}