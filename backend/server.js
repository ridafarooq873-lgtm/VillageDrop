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

const allowedClientOrigins = [
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'https://villagedropfrontend-68hpnzs7y-ridafarooq873-lgtm.vercel.app',
  'https://villagedropfrontend.vercel.app',
].filter(Boolean)

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true)
    if (origin.includes('vercel.app') || allowedClientOrigins.includes(origin)) {
      return callback(null, true)
    }
    return callback(null, true)
  },
  credentials: true,
}))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Vercel ke liye lazy DB connect - ROUTES SE PEHLE
let isConnected = false
app.use(async (req, res, next) => {
  if (process.env.VERCEL && !isConnected) {
    try {
      await connectDB()
      await loadFeeConfig()
      isConnected = true
    } catch (e) {
      console.error('DB connect failed:', e.message)
    }
  }
  next()
})

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

app.use('/uploads', express.static(UPLOAD_DIR))

app.use('/api/auth', authRoutes)
app.use('/api/riders', riderRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/customers', customerRoutes)
app.use('/api/customer', customerCompatRoutes)
app.use('/api/notifications', notificationRoutes)

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' })
})

app.use((err, req, res, next) => {
  console.error('[error]', err)
  const status = err.statusCode || 500
  res.status(status).json({ message: err.message || 'Internal server error' })
})

initSocket(httpServer, { origin: allowedClientOrigins })

const PORT = process.env.PORT || 5000

// Local ke liye hi server start hoga
if (!process.env.VERCEL) {
  const start = async () => {
    await connectDB()
    await loadFeeConfig()
    httpServer.listen(PORT, () => {
      console.log(`[server] listening on http://localhost:${PORT}`)
    })
  }
  start()
}

// Vercel ke liye ESM export
export default app
